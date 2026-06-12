use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    // Optional so clean+saved tabs can be persisted without their content
    // (re-read from disk on restore — avoids stale snapshots if the file
    // changed externally between sessions).
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub dirty: bool,
    #[serde(default)]
    pub view_mode: Option<String>,
    // Tab ordering at write time. Lower = earlier in the bar. Used to
    // reconstruct the original tab order on restore.
    #[serde(default)]
    pub order: i32,
    // Exactly one draft should have this true (the focused tab at write
    // time). If none do, restore falls back to the first tab.
    #[serde(default)]
    pub active: bool,
}

fn drafts_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let mut p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    p.push("drafts");
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

#[tauri::command]
pub async fn write_draft(app: AppHandle, draft: Draft) -> Result<(), String> {
    let mut p = drafts_dir(&app)?;
    p.push(format!("{}.json", sanitize_id(&draft.id)));
    let json = serde_json::to_string(&draft).map_err(|e| e.to_string())?;
    tokio::fs::write(p, json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_drafts(app: AppHandle) -> Result<Vec<Draft>, String> {
    let p = drafts_dir(&app)?;
    let mut entries = tokio::fs::read_dir(p)
        .await
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    while let Some(e) = entries
        .next_entry()
        .await
        .map_err(|e| e.to_string())?
    {
        if let Ok(content) = tokio::fs::read_to_string(e.path()).await {
            if let Ok(d) = serde_json::from_str::<Draft>(&content) {
                out.push(d);
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn clear_draft(app: AppHandle, id: String) -> Result<(), String> {
    let mut p = drafts_dir(&app)?;
    p.push(format!("{}.json", sanitize_id(&id)));
    let _ = tokio::fs::remove_file(p).await;
    Ok(())
}

fn sanitize_id(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
