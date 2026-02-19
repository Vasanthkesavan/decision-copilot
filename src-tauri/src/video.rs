use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoRenderProgress {
    pub decision_id: String,
    pub rendered_frames: u32,
    pub total_frames: u32,
    pub percent: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoRenderComplete {
    pub decision_id: String,
    pub output_path: String,
}

/// Parse Remotion progress output.
/// Remotion 4.x outputs: "Rendered 30/900, time remaining: 5s"
fn parse_remotion_progress(line: &str) -> Option<(u32, u32)> {
    if let Some(idx) = line.find("/") {
        let before = &line[..idx];
        let after = &line[idx + 1..];

        let rendered: Option<u32> = before
            .rsplit(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|s| s.parse().ok());

        let total: Option<u32> = after
            .split(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|s| s.parse().ok());

        if let (Some(r), Some(t)) = (rendered, total) {
            if t > 0 && r <= t {
                return Some((r, t));
            }
        }
    }
    None
}

/// Find the project root by walking up from the Cargo manifest dir
/// (which is src-tauri/) to find the directory containing remotion.config.ts.
fn find_project_root() -> Result<PathBuf, String> {
    // In dev mode, CARGO_MANIFEST_DIR is set to src-tauri/
    // The project root is its parent.
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let manifest_path = PathBuf::from(&manifest_dir);
        if let Some(parent) = manifest_path.parent() {
            if parent.join("remotion.config.ts").exists() {
                return Ok(parent.to_path_buf());
            }
        }
    }

    // Fallback: try current_dir and its parent
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.join("remotion.config.ts").exists() {
            return Ok(cwd);
        }
        if let Some(parent) = cwd.parent() {
            if parent.join("remotion.config.ts").exists() {
                return Ok(parent.to_path_buf());
            }
        }
    }

    Err("Could not find project root (remotion.config.ts not found). Make sure you're running from the project directory.".to_string())
}

pub async fn render_debate_video(
    app_handle: &tauri::AppHandle,
    decision_id: &str,
    format: &str,
    input_props_json: &str,
    app_data_dir: &PathBuf,
    audio_dir: &str,
) -> Result<String, String> {
    // 1. Write input props to temp file
    let props_dir = app_data_dir.join("video_render");
    std::fs::create_dir_all(&props_dir)
        .map_err(|e| format!("Failed to create video render dir: {}", e))?;
    let props_file = props_dir.join(format!("{}.json", decision_id));
    std::fs::write(&props_file, input_props_json)
        .map_err(|e| format!("Failed to write props file: {}", e))?;

    // 2. Determine output path
    let output_dir = app_data_dir.join("exports");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create exports dir: {}", e))?;
    let output_file = output_dir.join(format!("{}-{}.mp4", decision_id, format));

    // 3. Find project root (where remotion.config.ts lives)
    let project_root = find_project_root()?;

    // 4. Spawn node with the Remotion CLI script directly.
    //    This avoids npx/.cmd shell wrapper issues on Windows entirely.
    let props_path = props_file.to_string_lossy().to_string();
    let output_path = output_file.to_string_lossy().to_string();
    let cli_script = project_root
        .join("node_modules/@remotion/cli/remotion-cli.js")
        .to_string_lossy()
        .to_string();

    // Normalize audio_dir to forward slashes for Remotion (runs in Node.js)
    let public_dir = audio_dir.replace('\\', "/");

    let mut child = Command::new("node")
        .args([
            &cli_script,
            "render",
            "src/remotion/index.ts",
            "DebateVideo",
            "--props",
            &props_path,
            "--output",
            &output_path,
            "--codec",
            "h264",
            "--public-dir",
            &public_dir,
            "--log",
            "verbose",
        ])
        .current_dir(&project_root)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn remotion render: {}", e))?;

    // 5. Parse stdout for progress (Remotion outputs progress to stdout)
    let decision_id_owned = decision_id.to_string();
    let app = app_handle.clone();
    let mut last_lines: Vec<String> = Vec::new();

    // Read both stdout and stderr — Remotion may write to either
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Spawn a task to collect stderr in the background
    let stderr_handle = tokio::spawn(async move {
        let mut stderr_lines = Vec::new();
        if let Some(stderr) = stderr {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                stderr_lines.push(line);
            }
        }
        stderr_lines
    });

    // Process stdout for progress
    if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // Keep last 20 lines for error reporting
            last_lines.push(line.clone());
            if last_lines.len() > 20 {
                last_lines.remove(0);
            }

            if let Some((rendered, total)) = parse_remotion_progress(&line) {
                let percent = rendered as f32 / total as f32 * 100.0;
                let _ = app.emit(
                    "video-render-progress",
                    VideoRenderProgress {
                        decision_id: decision_id_owned.clone(),
                        rendered_frames: rendered,
                        total_frames: total,
                        percent,
                    },
                );
            }
        }
    }

    // 6. Wait for completion
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for remotion process: {}", e))?;

    // Collect stderr
    let stderr_lines = stderr_handle.await.unwrap_or_default();

    // 7. Clean up temp props file
    let _ = std::fs::remove_file(&props_file);

    if !status.success() {
        // Combine stdout and stderr for error context
        let mut error_context = last_lines;
        error_context.extend(stderr_lines);
        let tail = error_context
            .iter()
            .rev()
            .take(10)
            .rev()
            .cloned()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(format!(
            "Remotion render failed (exit code {:?}):\n{}",
            status.code(),
            tail
        ));
    }

    let output_path_str = output_file.to_string_lossy().to_string();

    // 8. Emit completion
    let _ = app_handle.emit(
        "video-render-complete",
        VideoRenderComplete {
            decision_id: decision_id.to_string(),
            output_path: output_path_str.clone(),
        },
    );

    Ok(output_path_str)
}
