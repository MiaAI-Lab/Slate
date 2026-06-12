# 03. Folder sidebar (file tree)

**Goal.** Left-side sidebar showing a chosen folder as a tree of `.md` /
text files. Click → open in tab (reusing `openPathInTab`). Remembers
the last-opened folder across launches.

## UX

- **Open folder.** New File-menu item "Open Folder…" + `Ctrl+K Ctrl+O`
  (VSCode parity) launches the native folder picker.
- **Tree.** Lazy-expanding directories. Files shown if extension is
  in `MD_EXT` ∪ `TEXT_EXT` (reuse the lists from `fileService.ts`).
  Hidden dirs (`.git`, `.svn`, `node_modules`, `target`, `dist`, etc.)
  match the skip-list in `src-tauri/src/commands/search.rs:13-22`.
- **Active file indicator.** The row matching `activeTab.path` is
  highlighted with `--accent`.
- **Width.** Resizable via a 4px grab handle, persisted as
  `folderSidebar.width`. Defaults to 240px. Min 160, max 480.
- **Close.** Toolbar toggle + `Ctrl+B`.
- **Right-click on row.** "Open in new tab" (default click already does
  that), "Reveal in Explorer" (overlaps with feature 13), "Copy path".

## Settings

```ts
folderSidebar: {
  open: boolean         // default false
  width: number         // default 240
  lastFolder: string|null // default null
}
```

## Files to add

- `src-tauri/src/commands/fs_tree.rs`
- `src/lib/state/folderSidebar.svelte.ts`
- `src/lib/components/FolderSidebar.svelte`
- `src/lib/components/FolderSidebarRow.svelte` (recursive)

## Files to edit

- `src-tauri/src/commands/mod.rs`, `lib.rs` — register `fs_tree::*`.
- `src/types.ts`, `src/lib/state/settings.svelte.ts` — settings shape +
  migration.
- `src/lib/components/Toolbar.svelte` — toggle button + Ctrl+B branch
  in App.svelte's global keymap.
- `src/lib/components/Toolbar.svelte` File menu — add "Open Folder…".
- `src/App.svelte` — slot the sidebar to the left of the editor/preview
  grid.

## Rust: list_dir command

Two commands, both lazy:

```rust
// src-tauri/src/commands/fs_tree.rs
use serde::Serialize;

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

const SKIP: &[&str] = &[
    "node_modules", "target", "dist", "build", "out",
    "__pycache__", ".venv", "venv",
];
const TEXT_EXT: &[&str] = &[
    "md","markdown","mdx","txt","log","json","yaml","yml","toml",
    "csv","tsv","ini","cfg","js","ts","rs","py","go",
    // …mirror fileService.ts
];

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut rd = tokio::fs::read_dir(&path).await.map_err(|e| e.to_string())?;
    let mut out: Vec<DirEntry> = vec![];
    while let Some(entry) = rd.next_entry().await.map_err(|e| e.to_string())? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') { continue }
        let ft = entry.file_type().await.map_err(|e| e.to_string())?;
        let is_dir = ft.is_dir();
        if is_dir && SKIP.iter().any(|s| s.eq_ignore_ascii_case(&name)) { continue }
        if !is_dir {
            let ext = entry.path().extension()
                .and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
            if !TEXT_EXT.iter().any(|e| *e == ext) { continue }
        }
        out.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}
```

`list_dir` already covers everything the tree needs (no recursive
walk — directories expand on click and fetch their own children).

## State

```ts
// src/lib/state/folderSidebar.svelte.ts
class FolderSidebarState {
  root = $state<string | null>(null)        // mirrors settings.lastFolder
  expanded = $state(new Set<string>())      // directory paths that are open
  childrenCache = $state(new Map<string, DirEntry[]>())

  async loadRoot(path: string) { this.root = path; await this.refresh(path) }
  async refresh(path: string) {
    const list = await invoke<DirEntry[]>('list_dir', { path })
    this.childrenCache.set(path, list)
  }
  async toggle(path: string) {
    if (this.expanded.has(path)) { this.expanded.delete(path); return }
    this.expanded.add(path)
    if (!this.childrenCache.has(path)) await this.refresh(path)
  }
}
```

## Component sketch

```svelte
<!-- FolderSidebar.svelte -->
<aside class="flex flex-col h-full border-r" style:width="{width}px">
  <header class="flex items-center justify-between h-8 px-2 text-xs">
    <span class="truncate" title={folder.root}>{basename(folder.root ?? '')}</span>
    <button onclick={pickFolder}>📁</button>
  </header>
  <div class="flex-1 overflow-auto py-1">
    {#each rootChildren as child (child.path)}
      <FolderSidebarRow entry={child} depth={0} />
    {/each}
  </div>
</aside>
<!-- Drag handle on the right edge -->
```

`FolderSidebarRow.svelte` recurses on `expanded.has(entry.path)`.
Click on file → `openPathInTab(entry.path)`; click on dir →
`folder.toggle(entry.path)`. Use `▸ / ▾` glyphs for fold state, not
chevron SVG icons — match the rest of the chrome's plain-text style.

## File-system watching (optional v2)

Live updates would need `notify` crate + a Tauri event stream. v1 can
add a "refresh" button (`F5` on the sidebar) and skip the watcher.

## Resizable width

Plain drag-handle pattern. Mirror the floating SearchPanel drag setup
in `src/lib/components/SearchPanel.svelte:63-90` — pointerdown captures
offset, window mousemove updates `width`, mouseup releases. Clamp
[160, 480]. Persist by writing to `settingsState.values.folderSidebar.width`
on mouseup (don't write per-frame — bloats the store file).

## Edge cases

1. **Folder deleted between open and click.** `list_dir` returns Err →
   toast, leave node in expanded state but show "(unavailable)".
2. **Huge directories.** `list_dir` is unbounded; consider cap at 5000
   entries with a "more…" sentinel.
3. **Symbolic links.** `read_dir` follows by default on Windows; skip
   `entry.file_type().is_symlink()` if cycles matter.
4. **Active tab not under sidebar root.** Just don't highlight anything;
   no breadcrumb is needed for v1.

## Test plan

- Open Folder → tree appears. Expand → children load lazily.
- Click a file → opens as tab. Reopen same → reuses existing tab
  (existing `openPathInTab` already de-dupes).
- Close folder, reopen app → `lastFolder` restored.
- Drag the right-edge handle → width updates, persists.
- Hidden dirs and `node_modules` never appear.
