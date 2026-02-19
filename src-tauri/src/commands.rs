use crate::agents;
use crate::config::{self, AppConfig};
use crate::db::{Database, DebateAudio, DebateRound, Decision};
use crate::debate;
use crate::llm;
use crate::profile;
use crate::profile::ProfileFileInfo;
use crate::llm::StreamEvent;
use crate::tts;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::State;
use std::sync::Mutex;

pub struct AppState {
    pub db: Database,
    pub app_data_dir: PathBuf,
    pub debate_cancel_flags: HashMap<String, Arc<AtomicBool>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub conversation_id: String,
    pub response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub api_key_set: bool,
    pub api_key_preview: String,
    pub model: String,
    pub agent_models: std::collections::HashMap<String, String>,
    pub elevenlabs_api_key_set: bool,
    pub elevenlabs_api_key_preview: String,
    pub tts_provider: String,
    pub elevenlabs_model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDecisionResponse {
    pub conversation_id: String,
    pub decision_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
    pub prompt_price_per_million: Option<f64>,
    pub completion_price_per_million: Option<f64>,
    pub is_free: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StandaloneSandboxMeta {
    participants: Vec<agents::AgentInfo>,
    model_map: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelsResponse {
    data: Vec<OpenRouterModelEntry>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelEntry {
    id: String,
    name: Option<String>,
    context_length: Option<u32>,
    pricing: Option<OpenRouterModelPricing>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModelPricing {
    prompt: Option<String>,
    completion: Option<String>,
}

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

fn parse_price(value: Option<&str>) -> Option<f64> {
    value.and_then(|raw| raw.parse::<f64>().ok()).map(|per_token| per_token * 1_000_000.0)
}

fn short_model_label(model_id: &str) -> String {
    let trimmed = model_id.trim();
    let base = trimmed
        .split_once('/')
        .map(|(_, model)| model)
        .unwrap_or(trimmed);
    let base = base.strip_suffix(":free").unwrap_or(base);
    if base.len() <= 30 {
        base.to_string()
    } else {
        format!("{}...", &base[..27])
    }
}

fn build_standalone_sandbox(selected_models: &[String]) -> Result<StandaloneSandboxMeta, String> {
    let cleaned: Vec<String> = selected_models
        .iter()
        .map(|m| m.trim())
        .filter(|m| !m.is_empty())
        .map(|m| m.to_string())
        .collect();

    if cleaned.len() < 2 {
        return Err("Select at least 2 models for a standalone debate.".to_string());
    }
    if cleaned.len() > 5 {
        return Err("Standalone debates support up to 5 models.".to_string());
    }

    let unique_count = cleaned.iter().collect::<std::collections::HashSet<_>>().len();
    if unique_count != cleaned.len() {
        return Err("Please choose unique models for each debate slot.".to_string());
    }

    let colors = ["blue", "red", "teal", "orange", "green"];
    let voice_genders = ["male", "female"];

    let mut participants: Vec<agents::AgentInfo> = Vec::new();
    let mut model_map: HashMap<String, String> = HashMap::new();

    for (idx, model_id) in cleaned.iter().enumerate() {
        let color = colors[idx % colors.len()];
        let voice_gender = voice_genders[idx % voice_genders.len()];
        let key = format!("sandbox_model_{}", idx + 1);
        let label = short_model_label(model_id);
        let emoji = "\u{1f916}";

        participants.push(agents::AgentInfo {
            key: key.clone(),
            label,
            emoji: emoji.to_string(),
            color: color.to_string(),
            role: "debater".to_string(),
            builtin: true,
            sort_order: idx as u32,
            voice_gender: voice_gender.to_string(),
        });
        model_map.insert(key, model_id.clone());
    }

    participants.push(agents::AgentInfo {
        key: "moderator".to_string(),
        label: "Moderator".to_string(),
        emoji: "\u{1f3af}".to_string(),
        color: "amber".to_string(),
        role: "moderator".to_string(),
        builtin: true,
        sort_order: 100,
        voice_gender: "male".to_string(),
    });

    Ok(StandaloneSandboxMeta {
        participants,
        model_map,
    })
}

#[tauri::command]
pub async fn send_message(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    conversation_id: Option<String>,
    message: String,
    on_event: Channel<StreamEvent>,
) -> Result<SendMessageResponse, String> {
    let (api_key, model, conv_id, history_messages, conv_type, decision_id) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let config = config::load_config(&state.app_data_dir);

        if config.openrouter_api_key.is_empty() {
            return Err("API key not set. Please go to Settings to add your OpenRouter API key.".to_string());
        }

        let conv_id = match conversation_id {
            Some(id) => id,
            None => {
                let title = if message.len() > 50 {
                    format!("{}...", &message[..50])
                } else {
                    message.clone()
                };
                let conv = state.db.create_conversation(&title).map_err(db_err)?;
                conv.id
            }
        };

        state.db.add_message(&conv_id, "user", &message).map_err(db_err)?;

        let messages = state.db.get_messages(&conv_id).map_err(db_err)?;
        let history: Vec<serde_json::Value> = messages.iter().map(|m| {
            json!({
                "role": m.role,
                "content": m.content,
            })
        }).collect();

        let conv = state.db.get_conversation(&conv_id).map_err(db_err)?;
        let conv_type = conv.map(|c| c.conv_type).unwrap_or_else(|| "chat".to_string());

        let decision_id = if conv_type == "decision" {
            state.db.get_decision_by_conversation(&conv_id)
                .map_err(db_err)?
                .map(|d| d.id)
        } else {
            None
        };

        (config.openrouter_api_key, config.model, conv_id, history, conv_type, decision_id)
    };

    let app_data_dir = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.app_data_dir.clone()
    };

    let response_text = llm::send_message(
        &api_key,
        &model,
        history_messages,
        &app_data_dir,
        &on_event,
        &conv_type,
        decision_id.as_deref(),
        &app_handle,
    ).await?;

    {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.db.add_message(&conv_id, "assistant", &response_text).map_err(db_err)?;
    }

    Ok(SendMessageResponse {
        conversation_id: conv_id,
        response: response_text,
    })
}

#[tauri::command]
pub fn get_conversations(state: State<'_, Mutex<AppState>>) -> Result<Vec<crate::db::Conversation>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_conversations_by_type("chat").map_err(db_err)
}

#[tauri::command]
pub fn get_messages(state: State<'_, Mutex<AppState>>, conversation_id: String) -> Result<Vec<crate::db::Message>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_messages(&conversation_id).map_err(db_err)
}

#[tauri::command]
pub fn get_settings(state: State<'_, Mutex<AppState>>) -> Result<SettingsResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let config = config::load_config(&state.app_data_dir);
    let preview = if config.openrouter_api_key.len() > 8 {
        format!("{}...{}", &config.openrouter_api_key[..4], &config.openrouter_api_key[config.openrouter_api_key.len()-4..])
    } else if !config.openrouter_api_key.is_empty() {
        "****".to_string()
    } else {
        String::new()
    };
    let elevenlabs_preview = if config.elevenlabs_api_key.len() > 8 {
        format!("{}...{}", &config.elevenlabs_api_key[..4], &config.elevenlabs_api_key[config.elevenlabs_api_key.len()-4..])
    } else if !config.elevenlabs_api_key.is_empty() {
        "****".to_string()
    } else {
        String::new()
    };
    Ok(SettingsResponse {
        api_key_set: !config.openrouter_api_key.is_empty(),
        api_key_preview: preview,
        model: config.model,
        agent_models: config.agent_models,
        elevenlabs_api_key_set: !config.elevenlabs_api_key.is_empty(),
        elevenlabs_api_key_preview: elevenlabs_preview,
        tts_provider: config.tts_provider,
        elevenlabs_model: config.elevenlabs_model,
    })
}

#[tauri::command]
pub async fn get_openrouter_models() -> Result<Vec<OpenRouterModelInfo>, String> {
    let response = reqwest::Client::new()
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch OpenRouter models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenRouter models API error ({}): {}", status, body));
    }

    let payload: OpenRouterModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Invalid OpenRouter models response: {}", e))?;

    let mut models: Vec<OpenRouterModelInfo> = payload
        .data
        .into_iter()
        .map(|entry| {
            let prompt_price = parse_price(entry.pricing.as_ref().and_then(|p| p.prompt.as_deref()));
            let completion_price = parse_price(entry.pricing.as_ref().and_then(|p| p.completion.as_deref()));
            let is_free = prompt_price.unwrap_or(0.0) == 0.0 && completion_price.unwrap_or(0.0) == 0.0;

            OpenRouterModelInfo {
                id: entry.id.clone(),
                name: entry.name.unwrap_or_else(|| entry.id),
                context_length: entry.context_length,
                prompt_price_per_million: prompt_price,
                completion_price_per_million: completion_price,
                is_free,
            }
        })
        .collect();

    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, Mutex<AppState>>,
    api_key: String,
    model: String,
    elevenlabs_api_key: Option<String>,
    tts_provider: Option<String>,
    elevenlabs_model: Option<String>,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let existing = config::load_config(&state.app_data_dir);
    let final_key = if api_key.is_empty() { existing.openrouter_api_key } else { api_key };
    let final_elevenlabs_key = match elevenlabs_api_key {
        Some(k) if !k.is_empty() => k,
        _ => existing.elevenlabs_api_key,
    };
    let final_elevenlabs_model = match elevenlabs_model {
        Some(m) if !m.trim().is_empty() => m.trim().to_string(),
        _ => existing.elevenlabs_model,
    };
    let config = AppConfig {
        openrouter_api_key: final_key,
        model,
        agent_models: existing.agent_models,
        elevenlabs_api_key: final_elevenlabs_key,
        tts_provider: tts_provider.unwrap_or(existing.tts_provider),
        elevenlabs_model: final_elevenlabs_model,
        voices: existing.voices,
    };
    config::save_config(&state.app_data_dir, &config)
}

#[tauri::command]
pub fn get_profile_files(state: State<'_, Mutex<AppState>>) -> Result<std::collections::HashMap<String, String>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    profile::read_all_profiles(&state.app_data_dir)
}

#[tauri::command]
pub fn open_profile_folder(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let dir = profile::get_profile_dir(&state.app_data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_conversation(state: State<'_, Mutex<AppState>>, conversation_id: String) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.delete_conversation(&conversation_id).map_err(db_err)
}

// ── Decision Commands ──

#[tauri::command]
pub fn create_decision(state: State<'_, Mutex<AppState>>, title: String) -> Result<CreateDecisionResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let conv = state.db.create_conversation_with_type(&title, "decision").map_err(db_err)?;
    let decision = state.db.create_decision(&conv.id, &title).map_err(db_err)?;
    Ok(CreateDecisionResponse {
        conversation_id: conv.id,
        decision_id: decision.id,
    })
}

#[tauri::command]
pub fn get_decisions(state: State<'_, Mutex<AppState>>) -> Result<Vec<Decision>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_decisions().map_err(db_err)
}

#[tauri::command]
pub fn get_decision(state: State<'_, Mutex<AppState>>, decision_id: String) -> Result<Decision, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_decision(&decision_id)
        .map_err(db_err)?
        .ok_or_else(|| "Decision not found".to_string())
}

#[tauri::command]
pub fn get_decision_by_conversation(state: State<'_, Mutex<AppState>>, conversation_id: String) -> Result<Decision, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_decision_by_conversation(&conversation_id)
        .map_err(db_err)?
        .ok_or_else(|| "Decision not found".to_string())
}

#[tauri::command]
pub fn update_decision_status(
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
    status: String,
    user_choice: Option<String>,
    user_choice_reasoning: Option<String>,
    outcome: Option<String>,
) -> Result<Decision, String> {
    let state = state.lock().map_err(|e| e.to_string())?;

    match status.as_str() {
        "decided" => {
            let choice = user_choice.ok_or("user_choice is required when status is 'decided'")?;
            state.db.update_decision_choice(&decision_id, &choice, user_choice_reasoning.as_deref()).map_err(db_err)?;
        }
        "reviewed" => {
            let outcome_text = outcome.ok_or("outcome is required when status is 'reviewed'")?;
            state.db.update_decision_outcome(&decision_id, &outcome_text).map_err(db_err)?;
        }
        _ => {
            state.db.update_decision_status(&decision_id, &status).map_err(db_err)?;
        }
    }

    state.db.get_decision(&decision_id)
        .map_err(db_err)?
        .ok_or_else(|| "Decision not found after update".to_string())
}

// ── Profile Viewer Commands ──

#[tauri::command]
pub fn get_profile_files_detailed(state: State<'_, Mutex<AppState>>) -> Result<Vec<ProfileFileInfo>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    profile::read_all_profiles_detailed(&state.app_data_dir)
}

#[tauri::command]
pub fn update_profile_file(state: State<'_, Mutex<AppState>>, filename: String, content: String) -> Result<ProfileFileInfo, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    profile::write_profile_file(&state.app_data_dir, &filename, &content)?;
    let dir = profile::get_profile_dir(&state.app_data_dir);
    let path = dir.join(&filename);
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let modified_at = chrono::DateTime::<chrono::Utc>::from(modified)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    Ok(ProfileFileInfo {
        filename,
        content,
        modified_at,
        size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub fn remove_profile_file(state: State<'_, Mutex<AppState>>, filename: String) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    profile::delete_profile_file(&state.app_data_dir, &filename)?;
    Ok(())
}

// ── Committee Agent Commands ──

#[tauri::command]
pub fn get_agent_registry(state: State<'_, Mutex<AppState>>) -> Result<Vec<agents::AgentInfo>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    Ok(agents::load_registry(&state.app_data_dir))
}

#[tauri::command]
pub fn get_agent_files(state: State<'_, Mutex<AppState>>) -> Result<Vec<agents::AgentFileInfo>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    agents::read_all_agent_files(&state.app_data_dir)
}

#[tauri::command]
pub fn update_agent_file(state: State<'_, Mutex<AppState>>, filename: String, content: String) -> Result<agents::AgentFileInfo, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    agents::write_agent_file(&state.app_data_dir, &filename, &content)?;
    let dir = agents::get_agents_dir(&state.app_data_dir);
    let path = dir.join(&filename);
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let modified = metadata.modified().map_err(|e| e.to_string())?;
    let modified_at = chrono::DateTime::<chrono::Utc>::from(modified)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    Ok(agents::AgentFileInfo {
        filename,
        content,
        modified_at,
        size_bytes: metadata.len(),
    })
}

#[tauri::command]
pub fn save_agent_model(
    state: State<'_, Mutex<AppState>>,
    agent_key: String,
    model: String,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let mut config = config::load_config(&state.app_data_dir);
    if model.is_empty() {
        config.agent_models.remove(&agent_key);
    } else {
        config.agent_models.insert(agent_key, model);
    }
    config::save_config(&state.app_data_dir, &config)
}

#[tauri::command]
pub fn open_agents_folder(state: State<'_, Mutex<AppState>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let dir = agents::get_agents_dir(&state.app_data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn create_custom_agent(
    state: State<'_, Mutex<AppState>>,
    label: String,
    emoji: String,
    description: String,
    voice_gender: String,
) -> Result<agents::AgentInfo, String> {
    // Generate prompt via LLM
    let (api_key, model, app_data_dir) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let config = config::load_config(&state.app_data_dir);
        if config.openrouter_api_key.is_empty() {
            return Err("API key not set. Please go to Settings to add your OpenRouter API key.".to_string());
        }
        (config.openrouter_api_key, config.model, state.app_data_dir.clone())
    };

    let (system_prompt, user_prompt) = agents::agent_generation_prompt(&label, &description);
    let generated_prompt = llm::call_llm_simple(&api_key, &model, &system_prompt, &user_prompt).await?;

    agents::create_custom_agent(&app_data_dir, &label, &emoji, &generated_prompt, &voice_gender)
}

#[tauri::command]
pub fn delete_custom_agent(
    state: State<'_, Mutex<AppState>>,
    agent_key: String,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;

    // Also remove model override from config
    let mut config = config::load_config(&state.app_data_dir);
    config.agent_models.remove(&agent_key);
    config::save_config(&state.app_data_dir, &config)?;

    agents::delete_custom_agent(&state.app_data_dir, &agent_key)
}

// ── Debate Commands ──

#[tauri::command]
pub async fn start_debate(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
    quick_mode: bool,
    selected_agents: Option<Vec<String>>,
) -> Result<(), String> {
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        let decision = state.db.get_decision(&decision_id)
            .map_err(db_err)?
            .ok_or_else(|| "Decision not found".to_string())?;

        if let Some(ref summary_json) = decision.summary_json {
            let summary: serde_json::Value = serde_json::from_str(summary_json)
                .map_err(|_| "Invalid summary JSON".to_string())?;
            let has_options = summary.get("options")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            let has_variables = summary.get("variables")
                .and_then(|v| v.as_array())
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            if !has_options || !has_variables {
                return Err("Decision needs at least one option and one variable before starting a debate.".to_string());
            }
        } else {
            return Err("Decision has no summary data. Chat with the AI first to build context.".to_string());
        }
    }

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.debate_cancel_flags.insert(decision_id.clone(), cancel_flag.clone());
    }

    let dec_id = decision_id.clone();
    let selected = selected_agents.clone();
    tokio::spawn(async move {
        if let Err(e) = debate::run_debate(
            app_handle.clone(),
            dec_id.clone(),
            quick_mode,
            cancel_flag,
            selected,
            None,
            None,
            None,
            None,
        ).await {
            eprintln!("Debate error: {}", e);
            let _ = tauri::Emitter::emit(&app_handle, "debate-error", serde_json::json!({
                "decision_id": dec_id,
                "error": e,
            }));
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_debate(state: State<'_, Mutex<AppState>>, decision_id: String) -> Result<Vec<DebateRound>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_debate_rounds(&decision_id).map_err(db_err)
}

#[tauri::command]
pub fn cancel_debate(state: State<'_, Mutex<AppState>>, decision_id: String) -> Result<(), String> {
    let mut state = state.lock().map_err(|e| e.to_string())?;
    if let Some(flag) = state.debate_cancel_flags.get(&decision_id) {
        flag.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    state.db.update_decision_status(&decision_id, "analyzing").map_err(db_err)?;
    state.debate_cancel_flags.remove(&decision_id);
    Ok(())
}

// ── Audio Commands ──

#[tauri::command]
pub async fn generate_debate_audio(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
) -> Result<tts::AudioManifest, String> {
    let (app_data_dir, rounds) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let rounds = state.db.get_debate_rounds(&decision_id).map_err(db_err)?;
        (state.app_data_dir.clone(), rounds)
    };

    if rounds.is_empty() {
        return Err("No debate rounds found for this decision.".into());
    }

    let config = config::load_config(&app_data_dir);
    let registry = agents::load_registry(&app_data_dir);

    let manifest = tts::generate_debate_audio(
        &app_handle,
        &decision_id,
        &rounds,
        &config,
        &registry,
        &app_data_dir,
    ).await?;

    // Save to DB
    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?;
    {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.db.save_debate_audio(
            &decision_id,
            &manifest_json,
            manifest.total_duration_ms as i64,
            &app_data_dir.join("debates").join(&decision_id).to_string_lossy(),
        ).map_err(db_err)?;
    }

    Ok(manifest)
}

#[tauri::command]
pub fn get_debate_audio(
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
) -> Result<Option<DebateAudio>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_debate_audio(&decision_id).map_err(db_err)
}

// ── Standalone Debate Commands ──

#[tauri::command]
pub fn create_standalone_debate(
    state: State<'_, Mutex<AppState>>,
    title: String,
    prompt: String,
) -> Result<CreateDecisionResponse, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let conv = state.db.create_conversation_with_type(&title, "debate").map_err(db_err)?;
    let decision = state.db.create_decision(&conv.id, &title).map_err(db_err)?;
    state.db.update_debate_brief(&decision.id, &prompt).map_err(db_err)?;
    Ok(CreateDecisionResponse {
        conversation_id: conv.id,
        decision_id: decision.id,
    })
}

#[tauri::command]
pub async fn start_standalone_debate(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
    quick_mode: bool,
    selected_models: Vec<String>,
    prompt: Option<String>,
    debate_config: Option<debate::StandaloneDebateConfig>,
) -> Result<(), String> {
    let sandbox = build_standalone_sandbox(&selected_models)?;
    let normalized_config = {
        let fallback_exchanges = if quick_mode { 0 } else { 2 };
        match debate_config {
            Some(cfg) if cfg.mode.trim().eq_ignore_ascii_case("moderator_auto") => {
                debate::StandaloneDebateConfig {
                    mode: "moderator_auto".to_string(),
                    exchange_count: None,
                    max_exchanges: Some(cfg.max_exchanges.unwrap_or(12).clamp(2, 20)),
                }
            }
            Some(cfg) => debate::StandaloneDebateConfig {
                mode: "fixed".to_string(),
                exchange_count: Some(cfg.exchange_count.unwrap_or(fallback_exchanges).clamp(0, 12)),
                max_exchanges: None,
            },
            None => debate::StandaloneDebateConfig {
                mode: "fixed".to_string(),
                exchange_count: Some(fallback_exchanges),
                max_exchanges: None,
            },
        }
    };

    let (debate_title, resolved_context) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let decision = state
            .db
            .get_decision(&decision_id)
            .map_err(db_err)?
            .ok_or_else(|| "Standalone debate decision not found".to_string())?;

        let title = decision.title.trim().to_string();

        let from_request = prompt
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);
        let from_db = decision
            .debate_brief
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string);

        let context = from_request.or(from_db).unwrap_or_default();

        (title, context)
    };

    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut state = state.lock().map_err(|e| e.to_string())?;
        state.debate_cancel_flags.insert(decision_id.clone(), cancel_flag.clone());
        let sandbox_json = serde_json::to_string(&json!({
            "standalone_sandbox": {
                "participants": &sandbox.participants,
                "model_map": &sandbox.model_map,
                "debate_config": &normalized_config,
            }
        })).map_err(|e| e.to_string())?;
        state.db.update_decision_summary(&decision_id, &sandbox_json).map_err(db_err)?;
    }

    let brief = if resolved_context.is_empty() {
        format!(
            "# Debate Topic\n\n{}\n\nDebate this topic thoroughly from your unique perspective. Engage with each other's arguments directly.",
            debate_title
        )
    } else {
        format!(
            "# Debate Topic\n\n{}\n\n## Context\n{}\n\nDebate this topic thoroughly from your unique perspective. Engage with each other's arguments directly.",
            debate_title,
            resolved_context
        )
    };

    let dec_id = decision_id.clone();
    let selected = sandbox
        .participants
        .iter()
        .filter(|agent| agent.role == "debater")
        .map(|agent| agent.key.clone())
        .collect::<Vec<_>>();
    let participants = sandbox.participants.clone();
    let model_map = sandbox.model_map.clone();
    let standalone_config = normalized_config.clone();

    tokio::spawn(async move {
        if let Err(e) = debate::run_debate(
            app_handle.clone(),
            dec_id.clone(),
            quick_mode,
            cancel_flag,
            Some(selected),
            Some(brief),
            Some(participants),
            Some(model_map),
            Some(standalone_config),
        ).await {
            eprintln!("Standalone debate error: {}", e);
            let _ = tauri::Emitter::emit(&app_handle, "debate-error", serde_json::json!({
                "decision_id": dec_id,
                "error": e,
            }));
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_standalone_debates(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<Decision>, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    state.db.get_standalone_debates().map_err(db_err)
}

// ── Video Export Commands ──

#[tauri::command]
pub async fn render_video(
    app_handle: tauri::AppHandle,
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
    format: String,
    input_props_json: String,
    audio_dir: String,
) -> Result<String, String> {
    let app_data_dir = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.app_data_dir.clone()
    };

    let dec_id = decision_id.clone();
    let app = app_handle.clone();

    tokio::spawn(async move {
        match crate::video::render_debate_video(&app, &dec_id, &format, &input_props_json, &app_data_dir, &audio_dir).await {
            Ok(_path) => { /* completion event already emitted */ }
            Err(e) => {
                let _ = tauri::Emitter::emit(&app, "video-render-error", serde_json::json!({
                    "decision_id": dec_id,
                    "error": e,
                }));
            }
        }
    });

    Ok("Render started".to_string())
}

// ── PDF Export Commands ──

#[tauri::command]
pub fn save_pdf(
    state: State<'_, Mutex<AppState>>,
    decision_id: String,
    pdf_base64: String,
) -> Result<String, String> {
    let app_data_dir = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.app_data_dir.clone()
    };

    let output_dir = app_data_dir.join("exports");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create exports dir: {}", e))?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&pdf_base64)
        .map_err(|e| format!("Failed to decode PDF data: {}", e))?;

    let output_path = output_dir.join(format!("{}-transcript.pdf", decision_id));
    std::fs::write(&output_path, &bytes)
        .map_err(|e| format!("Failed to write PDF: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}
