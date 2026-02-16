use crate::config::{self, AppConfig, Provider};
use crate::db::Database;
use crate::llm;
use crate::profile;
use crate::llm::StreamEvent;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::PathBuf;
use tauri::ipc::Channel;
use tauri::State;
use std::sync::Mutex;

pub struct AppState {
    pub db: Database,
    pub app_data_dir: PathBuf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub conversation_id: String,
    pub response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SettingsResponse {
    pub provider: String,
    pub api_key_set: bool,
    pub api_key_preview: String,
    pub model: String,
    pub ollama_url: String,
    pub ollama_model: String,
}

fn db_err(e: rusqlite::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, Mutex<AppState>>,
    conversation_id: Option<String>,
    message: String,
    on_event: Channel<StreamEvent>,
) -> Result<SendMessageResponse, String> {
    let (provider, api_key, model, ollama_url, conv_id, history_messages) = {
        let state = state.lock().map_err(|e| e.to_string())?;
        let config = config::load_config(&state.app_data_dir);

        match config.provider {
            Provider::Anthropic => {
                if config.api_key.is_empty() {
                    return Err("API key not set. Please go to Settings to add your Anthropic API key.".to_string());
                }
            }
            Provider::Ollama => {}
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

        let active_model = match config.provider {
            Provider::Anthropic => config.model.clone(),
            Provider::Ollama => config.ollama_model.clone(),
        };

        (config.provider, config.api_key, active_model, config.ollama_url, conv_id, history)
    };

    let app_data_dir = {
        let state = state.lock().map_err(|e| e.to_string())?;
        state.app_data_dir.clone()
    };

    let response_text = llm::send_message(
        &provider,
        &api_key,
        &model,
        &ollama_url,
        history_messages,
        &app_data_dir,
        &on_event,
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
    state.db.get_conversations().map_err(db_err)
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
    let preview = if config.api_key.len() > 8 {
        format!("{}...{}", &config.api_key[..4], &config.api_key[config.api_key.len()-4..])
    } else if !config.api_key.is_empty() {
        "****".to_string()
    } else {
        String::new()
    };
    let provider_str = match config.provider {
        Provider::Anthropic => "anthropic",
        Provider::Ollama => "ollama",
    };
    Ok(SettingsResponse {
        provider: provider_str.to_string(),
        api_key_set: !config.api_key.is_empty(),
        api_key_preview: preview,
        model: config.model,
        ollama_url: config.ollama_url,
        ollama_model: config.ollama_model,
    })
}

#[tauri::command]
pub fn save_settings(
    state: State<'_, Mutex<AppState>>,
    provider: String,
    api_key: String,
    model: String,
    ollama_url: String,
    ollama_model: String,
) -> Result<(), String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    let existing = config::load_config(&state.app_data_dir);
    let final_key = if api_key.is_empty() { existing.api_key } else { api_key };
    let prov = match provider.as_str() {
        "ollama" => Provider::Ollama,
        _ => Provider::Anthropic,
    };
    let config = AppConfig {
        provider: prov,
        api_key: final_key,
        model,
        ollama_url,
        ollama_model,
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
