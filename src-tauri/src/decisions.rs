use serde_json::{json, Value};

/// Merge new summary fields into existing summary JSON.
/// Arrays (options, variables, pros_cons) are merged by label/option.
/// Recommendation is replaced entirely if provided.
pub fn merge_summary(existing_json: Option<&str>, update: &Value) -> String {
    let mut existing: Value = existing_json
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| json!({}));

    // Merge options array (match by label)
    if let Some(new_options) = update.get("options").and_then(|v| v.as_array()) {
        let options = existing
            .get("options")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let merged = merge_array_by_key(options, new_options, "label");
        existing["options"] = Value::Array(merged);
    }

    // Merge variables array (match by label)
    if let Some(new_vars) = update.get("variables").and_then(|v| v.as_array()) {
        let vars = existing
            .get("variables")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let merged = merge_array_by_key(vars, new_vars, "label");
        existing["variables"] = Value::Array(merged);
    }

    // Merge pros_cons array (match by option)
    if let Some(new_pc) = update.get("pros_cons").and_then(|v| v.as_array()) {
        let pc = existing
            .get("pros_cons")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let merged = merge_array_by_key(pc, new_pc, "option");
        existing["pros_cons"] = Value::Array(merged);
    }

    // Recommendation: replace entirely
    if let Some(rec) = update.get("recommendation") {
        existing["recommendation"] = rec.clone();
    }

    serde_json::to_string(&existing).unwrap_or_else(|_| "{}".to_string())
}

/// Merge two arrays of objects by a key field.
/// If an item in `new_items` has the same key value as one in `existing`, it replaces it.
/// Otherwise, the new item is appended.
fn merge_array_by_key(existing: Vec<Value>, new_items: &[Value], key: &str) -> Vec<Value> {
    let mut result = existing;
    for new_item in new_items {
        let new_key = new_item.get(key).and_then(|v| v.as_str());
        if let Some(nk) = new_key {
            if let Some(pos) = result.iter().position(|item| {
                item.get(key).and_then(|v| v.as_str()) == Some(nk)
            }) {
                result[pos] = new_item.clone();
            } else {
                result.push(new_item.clone());
            }
        } else {
            result.push(new_item.clone());
        }
    }
    result
}
