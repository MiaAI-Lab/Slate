use crate::watcher::FileWatchers;
use std::path::Path;

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, String> {
    tokio::fs::read_to_string(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, content).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn file_mtime(path: String) -> Result<u64, String> {
    let meta = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?;
    let m = meta.modified().map_err(|e| e.to_string())?;
    let dur = m
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?;
    Ok(dur.as_secs())
}

#[tauri::command]
pub fn watch_file(
    path: String,
    content: String,
    state: tauri::State<'_, FileWatchers>,
) {
    state.watch(&path, &content);
}

#[tauri::command]
pub fn unwatch_file(path: String, state: tauri::State<'_, FileWatchers>) {
    state.unwatch(&path);
}

#[tauri::command]
pub fn record_save(path: String, content: String, state: tauri::State<'_, FileWatchers>) {
    state.record_save(&path, &content);
}
