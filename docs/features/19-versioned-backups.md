# 19. Versioned backups

**Goal.** Every successful save also writes a timestamped copy under
`$APPDATA/com.mdeditor.app/backups/<hash>/`. A configurable retention
keeps the last N versions per file.

This sits alongside the existing 5-second draft autosave
(`src/lib/state/session.svelte.ts`, Rust `write_draft`). Drafts protect
against crash; backups protect against bad save / typo / regret.

## UX

- **Automatic.** Every `saveFile` triggers a backup write.
- **List.** New File-menu entry "History…" opens a dialog showing
  versions of the active tab's file. Each row: timestamp + size +
  "Restore" + "Open in new tab" buttons.
- **Restore.** Restoring replaces tab content (creates a new draft, no
  immediate overwrite of disk — user can decide whether to save).

## Settings

```ts
backups: {
  enabled: boolean         // default true
  keepCount: number        // default 20
  // No size cap; keepCount caps growth.
}
```

In **Behavior** tab: checkbox + number input ("Keep last N versions per
file", min 1, max 200).

## Storage layout

```
$APPDATA/com.mdeditor.app/backups/
  <sha256(path)[0..12]>/
    path.txt              # the original absolute path, for restore-by-id
    2026-05-14T08-30-12.md
    2026-05-14T08-31-04.md
    …
```

Using a short hash directory keeps it filesystem-safe and avoids leaking
the original path into a directory name with weird characters. The
`path.txt` sidecar lets the History UI show the original path even if
the source file moved.

## Files to add

- `src-tauri/src/commands/backup.rs` — `write_backup`, `list_backups`,
  `read_backup`, `prune_backups`.

## Files to edit

- `src-tauri/src/commands/mod.rs`, `lib.rs` — register handlers.
- `src/lib/utils/fileService.ts:saveActive` — call `write_backup` after
  successful `write_file`.
- `src/lib/state/settings.svelte.ts` — defaults + migration.
- `src/lib/components/SettingsDialog.svelte` — UI.
- (New) `src/lib/components/HistoryDialog.svelte` — version list.
- `src/lib/components/Toolbar.svelte` — File-menu "History…" entry.

## Rust commands

```rust
// src-tauri/src/commands/backup.rs
use sha2::{Sha256, Digest};
use serde::Serialize;
use tauri::{AppHandle, Manager};

fn dir_for(app: &AppHandle, path: &str) -> Result<std::path::PathBuf, String> {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let hash = hex::encode(&hasher.finalize()[..6]); // first 12 hex chars
    let mut p = app.path().app_data_dir().map_err(|e| e.to_string())?;
    p.push("backups");
    p.push(hash);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    let path_sidecar = p.join("path.txt");
    if !path_sidecar.exists() {
        let _ = std::fs::write(&path_sidecar, path);
    }
    Ok(p)
}

#[tauri::command]
pub async fn write_backup(app: AppHandle, path: String, content: String, keep: usize)
    -> Result<(), String>
{
    let dir = dir_for(&app, &path)?;
    let stamp = chrono::Local::now().format("%Y-%m-%dT%H-%M-%S").to_string();
    let ext = std::path::Path::new(&path).extension()
        .and_then(|e| e.to_str()).unwrap_or("md");
    let file = dir.join(format!("{stamp}.{ext}"));
    tokio::fs::write(&file, content).await.map_err(|e| e.to_string())?;

    // Prune.
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name() != "path.txt")
        .collect();
    entries.sort_by_key(|e| e.file_name());
    while entries.len() > keep {
        let oldest = entries.remove(0);
        let _ = std::fs::remove_file(oldest.path());
    }
    Ok(())
}

#[derive(Serialize)]
pub struct BackupEntry {
    pub name: String,       // 2026-05-14T08-30-12.md
    pub size: u64,
    pub mtime: u64,
}

#[tauri::command]
pub async fn list_backups(app: AppHandle, path: String) -> Result<Vec<BackupEntry>, String> {
    let dir = dir_for(&app, &path)?;
    let mut out = vec![];
    let mut rd = tokio::fs::read_dir(&dir).await.map_err(|e| e.to_string())?;
    while let Some(e) = rd.next_entry().await.map_err(|e| e.to_string())? {
        let name = e.file_name().to_string_lossy().into_owned();
        if name == "path.txt" { continue }
        let meta = e.metadata().await.map_err(|e| e.to_string())?;
        let mtime = meta.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs()).unwrap_or(0);
        out.push(BackupEntry { name, size: meta.len(), mtime });
    }
    out.sort_by(|a, b| b.name.cmp(&a.name)); // newest first
    Ok(out)
}

#[tauri::command]
pub async fn read_backup(app: AppHandle, path: String, name: String) -> Result<String, String> {
    let dir = dir_for(&app, &path)?;
    let p = dir.join(&name);
    // Defense: name must not escape the backup dir.
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("invalid backup name".into())
    }
    tokio::fs::read_to_string(p).await.map_err(|e| e.to_string())
}
```

Add `sha2 = "0.10"`, `hex = "0.4"`, `chrono = { version = "0.4", default-features = false, features = ["clock"] }` to `Cargo.toml`.

## Wiring saveActive

```ts
// fileService.ts:saveActive after a successful saveFile
if (settingsState.values.backups.enabled) {
  invoke('write_backup', {
    path: tab.path,
    content: tab.content,
    keep: settingsState.values.backups.keepCount,
  }).catch((e) => console.warn('Backup failed', e))
}
```

Don't block the save on the backup. Log on failure; user already has
their save on disk.

## HistoryDialog

A modal listing entries from `list_backups`. Each row:

- Timestamp (parsed from filename).
- Size (KB).
- Buttons: "Restore" (writes content to active tab via
  `tabsState.updateContent`, leaving tab dirty), "Open as new tab"
  (`tabsState.newTab` with the backup content).

Reuse `ConfirmDialog` shell or mirror `SettingsDialog`'s dialog frame.

## Edge cases

1. **Backup growth.** 20 versions × typical doc size = manageable.
   `keepCount` cap is the only retention; no per-doc disk quota.
   Document the location so power users can purge manually.
2. **File-path moves.** A renamed file gets a new hash dir;
   historical versions stay under the old hash. Acceptable for v1.
   Future: a "merge two backup folders" admin command.
3. **Hash collisions.** SHA-256 truncated to 12 hex chars = 48 bits.
   Collision probability negligible for human-scale paths.
4. **Save-As to a new path.** First save into a new path writes the
   first backup there; the old path's backups stay untouched.
5. **Untitled tabs.** No path → don't back up. Drafts cover that case.
6. **Race with quick consecutive saves.** Timestamp filename has
   second precision; two saves in the same second would collide. Add a
   millisecond suffix if you hit it: `%Y-%m-%dT%H-%M-%S-%3f`.

## Test plan

- Save a file 5 times → 5 entries in History.
- Save 25 times with keep=20 → only 20 newest entries remain.
- Click "Restore" on an older version → editor content replaced, tab
  marked dirty, no auto-overwrite of disk.
- Disable backups, save → no new file written; existing backups
  untouched.
- Rename a file on disk; History shows old backups under old path
  (open via "Open as new tab").
