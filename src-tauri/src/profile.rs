use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub fn get_profile_dir(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("profile")
}

pub fn read_all_profiles(app_data_dir: &PathBuf) -> Result<HashMap<String, String>, String> {
    let dir = get_profile_dir(app_data_dir);
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        return Ok(HashMap::new());
    }
    let mut files = HashMap::new();
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let filename = path.file_name().unwrap().to_string_lossy().to_string();
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            files.insert(filename, content);
        }
    }
    Ok(files)
}

pub fn write_profile_file(app_data_dir: &PathBuf, filename: &str, content: &str) -> Result<String, String> {
    let dir = get_profile_dir(app_data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(filename);
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(format!("Successfully wrote {}", filename))
}

pub fn delete_profile_file(app_data_dir: &PathBuf, filename: &str) -> Result<String, String> {
    let dir = get_profile_dir(app_data_dir);
    let path = dir.join(filename);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        Ok(format!("Successfully deleted {}", filename))
    } else {
        Ok(format!("File {} does not exist", filename))
    }
}
