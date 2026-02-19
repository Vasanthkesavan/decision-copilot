import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Player } from "@remotion/player";
import { Video, Download, FolderOpen, Monitor, Smartphone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DebateVideo } from "@/remotion/DebateVideo";
import { calculateTotalFrames } from "@/remotion/utils";
import { PORTRAIT, LANDSCAPE, FPS } from "@/remotion/constants";
import type { VideoInputProps, VideoAgentMeta } from "@/remotion/types";
import type { AgentMeta } from "@/lib/agentColors";

interface AudioSegment {
  index: number;
  agent: string;
  round: number;
  exchange: number;
  text: string;
  audio_file: string;
  duration_ms: number;
  start_ms: number;
}

interface AudioManifest {
  decision_id: string;
  segments: AudioSegment[];
  total_duration_ms: number;
}

interface VideoRenderProgress {
  decision_id: string;
  rendered_frames: number;
  total_frames: number;
  percent: number;
}

interface VideoRenderComplete {
  decision_id: string;
  output_path: string;
}

interface VideoRenderError {
  decision_id: string;
  error: string;
}

interface VideoExportDialogProps {
  decisionId: string;
  title: string;
  manifest: AudioManifest;
  audioDir: string;
  registry: AgentMeta[];
  onClose: () => void;
}

type RenderState = "idle" | "rendering" | "complete" | "error";

export default function VideoExportDialog({
  decisionId,
  title,
  manifest,
  audioDir,
  registry,
  onClose,
}: VideoExportDialogProps) {
  const [format, setFormat] = useState<"portrait" | "landscape">("portrait");
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [progress, setProgress] = useState(0);
  const [outputPath, setOutputPath] = useState("");
  const [error, setError] = useState("");

  // Transform agent registry for Remotion
  const videoAgents: VideoAgentMeta[] = useMemo(
    () =>
      registry.map((a) => ({
        key: a.key,
        label: a.label,
        emoji: a.emoji,
        color: a.color,
        role: a.role,
      })),
    [registry]
  );

  // Build preview props with Tauri asset protocol URLs
  const previewProps: VideoInputProps = useMemo(
    () => ({
      title,
      format,
      fps: FPS,
      totalDurationMs: manifest.total_duration_ms,
      agents: videoAgents,
      segments: manifest.segments.map((seg) => ({
        index: seg.index,
        agent: seg.agent,
        round: seg.round,
        exchange: seg.exchange,
        text: seg.text,
        audioFilePath: seg.audio_file
          ? convertFileSrc(
              `${audioDir}/${seg.audio_file}`.replace(/\\/g, "/")
            )
          : "",
        durationMs: seg.duration_ms,
        startMs: seg.start_ms,
      })),
    }),
    [title, format, manifest, audioDir, videoAgents]
  );

  // Build CLI render props — audio referenced via staticFile() paths.
  // The backend passes --public-dir pointing to the audio directory,
  // so files are served at /audio/{filename} by Remotion's bundler.
  const cliPropsJson = useMemo(() => {
    const cliProps: VideoInputProps = {
      ...previewProps,
      segments: manifest.segments.map((seg) => ({
        index: seg.index,
        agent: seg.agent,
        round: seg.round,
        exchange: seg.exchange,
        text: seg.text,
        audioFilePath: seg.audio_file || "",
        durationMs: seg.duration_ms,
        startMs: seg.start_ms,
      })),
    };
    return JSON.stringify(cliProps);
  }, [previewProps, manifest, audioDir]);

  const totalFrames = useMemo(
    () => calculateTotalFrames(previewProps),
    [previewProps]
  );

  const dims = format === "landscape" ? LANDSCAPE : PORTRAIT;

  // Preview player scaled to fit dialog
  const previewWidth = format === "portrait" ? 240 : 400;
  const scale = previewWidth / dims.width;
  const previewHeight = dims.height * scale;

  // Listen for render events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<VideoRenderProgress>("video-render-progress", (event) => {
      if (event.payload.decision_id === decisionId) {
        setProgress(event.payload.percent);
      }
    }).then((u) => unlisteners.push(u));

    listen<VideoRenderComplete>("video-render-complete", (event) => {
      if (event.payload.decision_id === decisionId) {
        setRenderState("complete");
        setOutputPath(event.payload.output_path);
        setProgress(100);
      }
    }).then((u) => unlisteners.push(u));

    listen<VideoRenderError>("video-render-error", (event) => {
      if (event.payload.decision_id === decisionId) {
        setRenderState("error");
        setError(event.payload.error);
      }
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [decisionId]);

  async function handleExport() {
    try {
      setRenderState("rendering");
      setProgress(0);
      setError("");
      await invoke("render_video", {
        decisionId,
        format,
        inputPropsJson: cliPropsJson,
        audioDir,
      });
    } catch (err) {
      setRenderState("error");
      setError(String(err));
    }
  }

  async function handleOpenFile() {
    if (outputPath) {
      try {
        await revealItemInDir(outputPath);
      } catch {
        // fallback: just let user know the path
      }
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-4 w-4" />
            Export Debate Video
          </DialogTitle>
          <DialogDescription>
            Preview and export to MP4 for sharing on X/Twitter
          </DialogDescription>
        </DialogHeader>

        {/* Format toggle */}
        <div className="flex gap-2">
          <Button
            variant={format === "portrait" ? "default" : "outline"}
            size="sm"
            onClick={() => setFormat("portrait")}
          >
            <Smartphone className="h-3.5 w-3.5 mr-1.5" />
            Portrait 9:16
          </Button>
          <Button
            variant={format === "landscape" ? "default" : "outline"}
            size="sm"
            onClick={() => setFormat("landscape")}
          >
            <Monitor className="h-3.5 w-3.5 mr-1.5" />
            Landscape 16:9
          </Button>
        </div>

        {/* Preview player */}
        <div
          className="rounded-lg overflow-hidden border border-border mx-auto"
          style={{ width: previewWidth, height: previewHeight }}
        >
          <Player
            component={DebateVideo as unknown as React.FC<Record<string, unknown>>}
            inputProps={previewProps as unknown as Record<string, unknown>}
            durationInFrames={totalFrames}
            compositionWidth={dims.width}
            compositionHeight={dims.height}
            fps={FPS}
            style={{ width: previewWidth, height: previewHeight }}
            controls
            autoPlay={false}
          />
        </div>

        {/* Progress bar */}
        {renderState === "rendering" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Rendering... {Math.round(progress)}%
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {renderState === "error" && (
          <div className="px-3 py-2 rounded-lg bg-destructive/20 border border-destructive/30 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Success */}
        {renderState === "complete" && (
          <div className="px-3 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm">
            Video exported successfully!
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          {renderState === "complete" ? (
            <Button size="sm" onClick={handleOpenFile}>
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Show in Explorer
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleExport}
              disabled={renderState === "rendering"}
            >
              {renderState === "rendering" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              {renderState === "rendering" ? "Rendering..." : "Export MP4"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
