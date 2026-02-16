use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    Ollama,
}

impl Default for Provider {
    fn default() -> Self {
        Self::Anthropic
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub provider: Provider,
    pub api_key: String,
    pub model: String,
    pub ollama_url: String,
    pub ollama_model: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            provider: Provider::Anthropic,
            api_key: String::new(),
            model: "claude-sonnet-4-5-20250929".to_string(),
            ollama_url: "http://localhost:11434".to_string(),
            ollama_model: "llama3.1:8b".to_string(),
        }
    }
}

pub fn get_config_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn load_config(app_data_dir: &PathBuf) -> AppConfig {
    let path = get_config_path(app_data_dir);
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(app_data_dir: &PathBuf, config: &AppConfig) -> Result<(), String> {
    let path = get_config_path(app_data_dir);
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}
