use crate::commands::AppState;
use crate::config::Provider;
use crate::decisions;
use crate::profile;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::{Emitter, Manager};

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

const DECISION_SYSTEM_PROMPT: &str = r#"You are a personal decision-making assistant. The user is working through a specific decision and needs your help analyzing it thoroughly.

You have access to the user's profile files — markdown files that contain everything you've learned about them: their values, priorities, life situation, constraints, finances, career, family, and goals. READ THESE FIRST before engaging with the decision.

Your job is to:

1. UNDERSTAND THE DECISION
   - What are they deciding between? (Surface all options, including ones they haven't considered)
   - What's the timeline? Is this reversible?
   - What triggered this decision now?

2. MAP ALL VARIABLES
   - What factors are at play? (financial, career, emotional, relational, health, etc.)
   - What are the second and third-order effects of each option?
   - What are they not seeing? What blind spots might they have?
   - What assumptions are they making?

3. ANALYZE AGAINST THEIR PROFILE
   - How does each option align with their stated values and priorities?
   - How does each option interact with their current constraints (financial, family, etc.)?
   - What does their risk tolerance suggest?
   - What would matter most to them based on what you know?

4. RECOMMEND
   - Give a CLEAR, COMMITTED recommendation. Do not hedge with "it depends" or "only you can decide."
   - Explain your reasoning transparently — which values and factors drove the recommendation
   - Explicitly state what they'd be giving up with your recommended choice
   - Rate your confidence (high/medium/low) and explain why

5. UPDATE THE DECISION SUMMARY
   After each significant exchange, update the decision summary by calling the `update_decision_summary` tool. This populates the structured panel the user sees alongside the chat. Update it progressively — don't wait until the end.

Guidelines:
- Ask focused questions, one or two at a time. Don't overwhelm.
- Push back if the user is framing the decision too narrowly ("should I quit?" is rarely binary)
- Name cognitive biases if you spot them (sunk cost, anchoring, status quo bias, etc.)
- Be honest even if it's not what they want to hear
- If you don't have enough information from the profile files, ask for it
- If new information emerges that should be saved to the profile, update the profile files too

6. REFLECT ON OUTCOMES
   When you see a message starting with "[DECISION OUTCOME LOGGED]", the user has reported how their decision turned out. This is a critical learning moment:

   a) READ PROFILE FILES first to understand the full context of who this person is
   b) COMPARE: your recommendation vs. what the user chose vs. what actually happened
   c) ANALYZE: factors you over/underweighted, biases at play, what the user's intuition captured that your analysis missed (or vice versa), unpredictable external factors vs foreseeable outcomes
   d) UPDATE PROFILE FILES with lessons learned — create or update a "decision-patterns.md" file tracking what works for this user and what doesn't, and update other relevant profiles if the outcome reveals new info about their values, risk tolerance, or priorities. Be specific — e.g. "user's read on organizational culture tends to be more reliable than quantitative analysis" rather than "user trusts gut feelings"
   e) SHARE your reflection transparently in the chat. Be honest about what you got right, what you got wrong, and how this will change your future recommendations for this user"#;

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

fn get_anthropic_tools(is_decision: bool) -> Value {
    let mut tools = json!([
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
    ]);

    if is_decision {
        if let Some(arr) = tools.as_array_mut() {
            arr.push(json!({
                "name": "update_decision_summary",
                "description": "Update the structured decision summary panel. Call this after each significant exchange to keep the summary current. You can update any combination of fields. Arrays are merged by key — new items are appended, existing items (matched by label/option) are updated.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "options": {
                            "type": "array",
                            "description": "The options being considered",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": { "type": "string" },
                                    "description": { "type": "string" }
                                },
                                "required": ["label"]
                            }
                        },
                        "variables": {
                            "type": "array",
                            "description": "Key variables/factors at play",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "label": { "type": "string" },
                                    "value": { "type": "string" },
                                    "impact": { "type": "string", "enum": ["high", "medium", "low"] }
                                },
                                "required": ["label", "value"]
                            }
                        },
                        "pros_cons": {
                            "type": "array",
                            "description": "Pros and cons per option, weighted by user's values",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "option": { "type": "string" },
                                    "pros": { "type": "array", "items": { "type": "string" } },
                                    "cons": { "type": "array", "items": { "type": "string" } },
                                    "alignment_score": { "type": "integer", "minimum": 1, "maximum": 10 },
                                    "alignment_reasoning": { "type": "string" }
                                },
                                "required": ["option"]
                            }
                        },
                        "recommendation": {
                            "type": "object",
                            "description": "The AI's final recommendation",
                            "properties": {
                                "choice": { "type": "string" },
                                "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
                                "reasoning": { "type": "string" },
                                "tradeoffs": { "type": "string" },
                                "next_steps": { "type": "array", "items": { "type": "string" } }
                            },
                            "required": ["choice", "confidence", "reasoning"]
                        },
                        "status": {
                            "type": "string",
                            "description": "Update the decision status",
                            "enum": ["exploring", "analyzing", "recommended"]
                        }
                    }
                }
            }));
        }
    }

    tools
}

// ── Ollama/OpenAI tool format ──

fn get_ollama_tools(is_decision: bool) -> Value {
    let mut tools = json!([
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
    ]);

    if is_decision {
        if let Some(arr) = tools.as_array_mut() {
            arr.push(json!({
                "type": "function",
                "function": {
                    "name": "update_decision_summary",
                    "description": "Update the structured decision summary panel. Call this after each significant exchange to keep the summary current.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "options": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": { "type": "string" },
                                        "description": { "type": "string" }
                                    },
                                    "required": ["label"]
                                }
                            },
                            "variables": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": { "type": "string" },
                                        "value": { "type": "string" },
                                        "impact": { "type": "string" }
                                    },
                                    "required": ["label", "value"]
                                }
                            },
                            "pros_cons": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "option": { "type": "string" },
                                        "pros": { "type": "array", "items": { "type": "string" } },
                                        "cons": { "type": "array", "items": { "type": "string" } },
                                        "alignment_score": { "type": "integer" },
                                        "alignment_reasoning": { "type": "string" }
                                    },
                                    "required": ["option"]
                                }
                            },
                            "recommendation": {
                                "type": "object",
                                "properties": {
                                    "choice": { "type": "string" },
                                    "confidence": { "type": "string" },
                                    "reasoning": { "type": "string" },
                                    "tradeoffs": { "type": "string" },
                                    "next_steps": { "type": "array", "items": { "type": "string" } }
                                },
                                "required": ["choice", "confidence", "reasoning"]
                            },
                            "status": {
                                "type": "string",
                                "enum": ["exploring", "analyzing", "recommended"]
                            }
                        }
                    }
                }
            }));
        }
    }

    tools
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

fn execute_tool(
    name: &str,
    input: &Value,
    app_data_dir: &PathBuf,
    decision_id: Option<&str>,
    app_handle: &tauri::AppHandle,
) -> String {
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
        "update_decision_summary" => {
            let Some(dec_id) = decision_id else {
                return "Error: no decision context for update_decision_summary".to_string();
            };
            // Get current summary from DB, merge, save back
            let state: tauri::State<'_, Mutex<AppState>> = app_handle.state();
            let state_guard = match state.lock() {
                Ok(s) => s,
                Err(e) => return format!("Error locking state: {}", e),
            };

            let existing_summary = state_guard.db
                .get_decision(dec_id)
                .ok()
                .flatten()
                .and_then(|d| d.summary_json);

            let merged = decisions::merge_summary(existing_summary.as_deref(), input);

            if let Err(e) = state_guard.db.update_decision_summary(dec_id, &merged) {
                return format!("Error saving summary: {}", e);
            }

            // Update status if provided
            if let Some(status) = input.get("status").and_then(|v| v.as_str()) {
                if let Err(e) = state_guard.db.update_decision_status(dec_id, status) {
                    return format!("Error updating status: {}", e);
                }
            }

            // Emit event to frontend
            let _ = app_handle.emit("decision-summary-updated", json!({
                "decision_id": dec_id,
                "summary": merged,
                "status": input.get("status").and_then(|v| v.as_str()),
            }));

            "Decision summary updated successfully.".to_string()
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
    conv_type: &str,
    decision_id: Option<&str>,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    match provider {
        Provider::Anthropic => send_to_anthropic(api_key, model, messages, app_data_dir, on_event, conv_type, decision_id, app_handle).await,
        Provider::Ollama => send_to_ollama(ollama_url, model, messages, app_data_dir, on_event, conv_type, decision_id, app_handle).await,
    }
}

// ── Anthropic streaming implementation ──

async fn send_to_anthropic(
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    app_data_dir: &PathBuf,
    on_event: &Channel<StreamEvent>,
    conv_type: &str,
    decision_id: Option<&str>,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let client = Client::new();
    let mut current_messages = messages;
    let mut all_text = String::new();
    let is_decision = conv_type == "decision";
    let system_prompt = if is_decision { DECISION_SYSTEM_PROMPT } else { SYSTEM_PROMPT };

    loop {
        let request_body = json!({
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "tools": get_anthropic_tools(is_decision),
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
            let result = execute_tool(name, input, app_data_dir, decision_id, app_handle);
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
    conv_type: &str,
    decision_id: Option<&str>,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let client = Client::new();
    let url = format!("{}/api/chat", ollama_url.trim_end_matches('/'));
    let is_decision = conv_type == "decision";
    let system_prompt = if is_decision { DECISION_SYSTEM_PROMPT } else { SYSTEM_PROMPT };

    let mut ollama_messages: Vec<Value> = vec![
        json!({"role": "system", "content": system_prompt}),
    ];
    for msg in &messages {
        ollama_messages.push(msg.clone());
    }

    let mut all_text = String::new();

    loop {
        let request_body = json!({
            "model": model,
            "messages": ollama_messages,
            "tools": get_ollama_tools(is_decision),
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
            let result = execute_tool(&tc.function.name, &tc.function.arguments, app_data_dir, decision_id, app_handle);
            ollama_messages.push(json!({
                "role": "tool",
                "content": result,
            }));
        }
    }
}
