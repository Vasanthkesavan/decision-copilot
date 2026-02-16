use crate::config::Provider;
use crate::profile;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::ipc::Channel;

const SYSTEM_PROMPT: &str = r#"You are a personal decision-making assistant. Your primary job right now is to deeply understand the user — who they are, what they value, what their life situation looks like, and what matters most to them.

You have access to a set of profile files stored as markdown on the user's machine. These files contain what you've learned about the user so far. Before every response, you should read the relevant profile files to remind yourself what you know.

As you learn new things about the user through conversation, you should update or create profile files to remember this information. Be organized — create separate files for different aspects of the user's life (career, finances, family, values, goals, health, etc.). Don't ask permission to save — just save what you learn naturally.

When saving profile information:
- Write in a clear, structured markdown format
- Use headers and bullet points for organization
- Include context and nuance, not just bare facts
- Update existing files rather than duplicating information
- Create new files when you discover a new significant aspect of the user's life

Be conversational and warm. Ask thoughtful follow-up questions. Don't interrogate — let understanding develop naturally through genuine conversation. You're building a relationship, not filling out a form.

When you have enough context about the user and they bring you a decision to make, you should:
1. Read all relevant profile files
2. Consider all variables and how they interact
3. Weigh tradeoffs against the user's stated values and priorities
4. Give a clear, committed recommendation with transparent reasoning
5. Explain what they'd be giving up with your recommended choice

But for now, focus on learning about the user. The better you understand them, the better your future recommendations will be."#;

// ── Stream event sent to frontend via Channel ──

#[derive(Clone, Serialize)]
#[serde(tag = "type")]
pub enum StreamEvent {
    #[serde(rename = "token")]
    Token { token: String },
    #[serde(rename = "tool_use")]
    ToolUse { tool: String },
}

// ── Anthropic tool format ──

fn get_anthropic_tools() -> Value {
    json!([
        {
            "name": "read_profile_files",
            "description": "Read the list of all profile files and their contents. Call this at the start of conversations to refresh your memory about the user.",
            "input_schema": {
                "type": "object",
                "properties": {},
                "required": []
            }
        },
        {
            "name": "write_profile_file",
            "description": "Create or update a profile file with information learned about the user. Use descriptive filenames like 'career.md', 'values.md', 'family.md', etc.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "The filename (e.g., 'career.md')"
                    },
                    "content": {
                        "type": "string",
                        "description": "The full markdown content of the file"
                    }
                },
                "required": ["filename", "content"]
            }
        },
        {
            "name": "delete_profile_file",
            "description": "Delete a profile file that is no longer relevant or has been consolidated into another file.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "The filename to delete"
                    }
                },
                "required": ["filename"]
            }
        }
    ])
}

// ── Ollama/OpenAI tool format ──

fn get_ollama_tools() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "read_profile_files",
                "description": "Read the list of all profile files and their contents. Call this at the start of conversations to refresh your memory about the user.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_profile_file",
                "description": "Create or update a profile file with information learned about the user. Use descriptive filenames like 'career.md', 'values.md', 'family.md', etc.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filename": {
                            "type": "string",
                            "description": "The filename (e.g., 'career.md')"
                        },
                        "content": {
                            "type": "string",
                            "description": "The full markdown content of the file"
                        }
                    },
                    "required": ["filename", "content"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_profile_file",
                "description": "Delete a profile file that is no longer relevant or has been consolidated into another file.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "filename": {
                            "type": "string",
                            "description": "The filename to delete"
                        }
                    },
                    "required": ["filename"]
                }
            }
        }
    ])
}

// ── Ollama response types (used for tool-call parsing) ──

#[derive(Debug, Serialize, Deserialize)]
struct OllamaToolCall {
    function: OllamaFunctionCall,
}

#[derive(Debug, Serialize, Deserialize)]
struct OllamaFunctionCall {
    name: String,
    arguments: Value,
}

// ── Shared tool execution ──

fn execute_tool(name: &str, input: &Value, app_data_dir: &PathBuf) -> String {
    match name {
        "read_profile_files" => {
            match profile::read_all_profiles(app_data_dir) {
                Ok(files) => serde_json::to_string(&files).unwrap_or_else(|_| "{}".to_string()),
                Err(e) => format!("Error reading profiles: {}", e),
            }
        }
        "write_profile_file" => {
            let filename = input["filename"].as_str().unwrap_or("unknown.md");
            let content = input["content"].as_str().unwrap_or("");
            match profile::write_profile_file(app_data_dir, filename, content) {
                Ok(msg) => msg,
                Err(e) => format!("Error writing profile: {}", e),
            }
        }
        "delete_profile_file" => {
            let filename = input["filename"].as_str().unwrap_or("");
            match profile::delete_profile_file(app_data_dir, filename) {
                Ok(msg) => msg,
                Err(e) => format!("Error deleting profile: {}", e),
            }
        }
        _ => format!("Unknown tool: {}", name),
    }
}

// ── Public entry point ──

pub async fn send_message(
    provider: &Provider,
    api_key: &str,
    model: &str,
    ollama_url: &str,
    messages: Vec<Value>,
    app_data_dir: &PathBuf,
    on_event: &Channel<StreamEvent>,
) -> Result<String, String> {
    match provider {
        Provider::Anthropic => send_to_anthropic(api_key, model, messages, app_data_dir, on_event).await,
        Provider::Ollama => send_to_ollama(ollama_url, model, messages, app_data_dir, on_event).await,
    }
}

// ── Anthropic streaming implementation ──

async fn send_to_anthropic(
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    app_data_dir: &PathBuf,
    on_event: &Channel<StreamEvent>,
) -> Result<String, String> {
    let client = Client::new();
    let mut current_messages = messages;
    let mut all_text = String::new();

    loop {
        let request_body = json!({
            "model": model,
            "max_tokens": 4096,
            "system": SYSTEM_PROMPT,
            "tools": get_anthropic_tools(),
            "messages": current_messages,
            "stream": true,
        });

        let mut response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.map_err(|e| format!("Read error: {}", e))?;
            return Err(format!("API error ({}): {}", status, error_text));
        }

        let mut iteration_text = String::new();
        let mut tool_uses: Vec<(String, String, Value)> = Vec::new(); // (id, name, input)
        let mut current_tool_id = String::new();
        let mut current_tool_name = String::new();
        let mut current_tool_input_json = String::new();
        let mut in_tool_use = false;
        let mut buffer = String::new();

        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Stream error: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete SSE events (separated by \n\n)
            while let Some(pos) = buffer.find("\n\n") {
                let event_block = buffer[..pos].to_string();
                buffer = buffer[pos + 2..].to_string();

                let mut event_type = String::new();
                let mut event_data = String::new();

                for line in event_block.lines() {
                    if let Some(t) = line.strip_prefix("event: ") {
                        event_type = t.to_string();
                    } else if let Some(d) = line.strip_prefix("data: ") {
                        event_data = d.to_string();
                    }
                }

                if event_data.is_empty() {
                    continue;
                }

                let data: Value = match serde_json::from_str(&event_data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                match event_type.as_str() {
                    "content_block_start" => {
                        if data["content_block"]["type"].as_str() == Some("tool_use") {
                            in_tool_use = true;
                            current_tool_id = data["content_block"]["id"].as_str().unwrap_or("").to_string();
                            current_tool_name = data["content_block"]["name"].as_str().unwrap_or("").to_string();
                            current_tool_input_json.clear();
                            let _ = on_event.send(StreamEvent::ToolUse { tool: current_tool_name.clone() });
                        }
                    }
                    "content_block_delta" => {
                        if let Some(delta_type) = data["delta"]["type"].as_str() {
                            match delta_type {
                                "text_delta" => {
                                    if let Some(text) = data["delta"]["text"].as_str() {
                                        if !text.is_empty() {
                                            iteration_text.push_str(text);
                                            let _ = on_event.send(StreamEvent::Token { token: text.to_string() });
                                        }
                                    }
                                }
                                "input_json_delta" => {
                                    if let Some(partial) = data["delta"]["partial_json"].as_str() {
                                        current_tool_input_json.push_str(partial);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    "content_block_stop" => {
                        if in_tool_use {
                            let input: Value = serde_json::from_str(&current_tool_input_json).unwrap_or(json!({}));
                            tool_uses.push((current_tool_id.clone(), current_tool_name.clone(), input));
                            in_tool_use = false;
                        }
                    }
                    _ => {}
                }
            }
        }

        if tool_uses.is_empty() {
            all_text.push_str(&iteration_text);
            return Ok(all_text);
        }

        // Handle tool use — build assistant message and tool results
        let mut assistant_content = Vec::new();
        if !iteration_text.is_empty() {
            assistant_content.push(json!({"type": "text", "text": iteration_text}));
            all_text.push_str(&iteration_text);
        }
        let mut tool_results = Vec::new();

        for (id, name, input) in &tool_uses {
            assistant_content.push(json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input,
            }));
            let result = execute_tool(name, input, app_data_dir);
            tool_results.push(json!({
                "type": "tool_result",
                "tool_use_id": id,
                "content": result,
            }));
        }

        current_messages.push(json!({"role": "assistant", "content": assistant_content}));
        current_messages.push(json!({"role": "user", "content": tool_results}));
    }
}

// ── Ollama streaming implementation ──

async fn send_to_ollama(
    ollama_url: &str,
    model: &str,
    messages: Vec<Value>,
    app_data_dir: &PathBuf,
    on_event: &Channel<StreamEvent>,
) -> Result<String, String> {
    let client = Client::new();
    let url = format!("{}/api/chat", ollama_url.trim_end_matches('/'));

    let mut ollama_messages: Vec<Value> = vec![
        json!({"role": "system", "content": SYSTEM_PROMPT}),
    ];
    for msg in &messages {
        ollama_messages.push(msg.clone());
    }

    let mut all_text = String::new();

    loop {
        let request_body = json!({
            "model": model,
            "messages": ollama_messages,
            "tools": get_ollama_tools(),
            "stream": true,
        });

        let mut response = client
            .post(&url)
            .header("content-type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Ollama connection error: {}. Is Ollama running at {}?", e, ollama_url))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.map_err(|e| format!("Read error: {}", e))?;
            return Err(format!("Ollama error ({}): {}", status, error_text));
        }

        let mut iteration_text = String::new();
        let mut tool_calls: Vec<OllamaToolCall> = Vec::new();
        let mut buffer = String::new();

        while let Some(chunk) = response.chunk().await.map_err(|e| format!("Stream error: {}", e))? {
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            // Process complete lines (NDJSON)
            while let Some(pos) = buffer.find('\n') {
                let line = buffer[..pos].trim().to_string();
                buffer = buffer[pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                let data: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Extract content token
                if let Some(content) = data["message"]["content"].as_str() {
                    if !content.is_empty() {
                        iteration_text.push_str(content);
                        let _ = on_event.send(StreamEvent::Token { token: content.to_string() });
                    }
                }

                // Check for tool calls in the message
                if let Some(tcs) = data["message"]["tool_calls"].as_array() {
                    for tc in tcs {
                        if let Some(name) = tc["function"]["name"].as_str() {
                            let arguments = tc["function"]["arguments"].clone();
                            let _ = on_event.send(StreamEvent::ToolUse { tool: name.to_string() });
                            tool_calls.push(OllamaToolCall {
                                function: OllamaFunctionCall {
                                    name: name.to_string(),
                                    arguments,
                                },
                            });
                        }
                    }
                }
            }
        }

        if tool_calls.is_empty() {
            all_text.push_str(&iteration_text);
            return Ok(all_text);
        }

        // Handle tool calls
        all_text.push_str(&iteration_text);

        ollama_messages.push(json!({
            "role": "assistant",
            "content": iteration_text,
            "tool_calls": tool_calls.iter().map(|tc| json!({
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                }
            })).collect::<Vec<Value>>(),
        }));

        for tc in &tool_calls {
            let result = execute_tool(&tc.function.name, &tc.function.arguments, app_data_dir);
            ollama_messages.push(json!({
                "role": "tool",
                "content": result,
            }));
        }
    }
}
