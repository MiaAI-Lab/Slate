# 01. Image paste from clipboard

**Goal.** When the user pastes (`Ctrl+V`, paste menu, or DnD) an image,
save the bytes to a configurable asset folder and insert
`![](relative/path.png)` at the caret instead of the binary blob.

## UX

- **Trigger.** Paste with `image/*` in the clipboard, OR drag-and-drop
  an image file into the editor area.
- **Where the file lands.**
  - If the active tab has a saved path: `<doc-dir>/<assetsSubdir>/<name>`
    where `assetsSubdir` is a setting (default `assets`).
  - If the tab is unsaved: prompt to save the doc first, then write.
    (Cheaper alternative: write under `$APPDATA/com.mdeditor.app/orphan-assets/`
    and warn via toast — but that splits the asset across machines, so
    prompt instead.)
- **Filename.** `paste-<yyyyMMdd-HHmmss>-<8hex>.png`. PNG always, even
  for JPEG clipboards: Chromium normalizes screenshots to PNG anyway, and
  one format keeps the link template simple.
- **Inserted markdown.** `![](assets/paste-20260514-103022-1a2b3c4d.png)`
  using a POSIX-style relative path even on Windows (markdown convention,
  also keeps cross-platform docs readable).

## Settings

```ts
// src/types.ts → AppSettings
imagePaste: {
  enabled: boolean        // default true
  assetsSubdir: string    // default 'assets'
}
```

Add a row to the **Behavior** tab in `SettingsDialog.svelte`:

- Checkbox "Save pasted images to disk"
- Text input "Assets subfolder" (disabled when checkbox off)

## Files to add

- `src-tauri/src/commands/binary.rs` — new Rust command `write_binary`.
- `src/lib/utils/imagePaste.ts` — JS-side handler (clipboard sniffing,
  filename, invoke, insert).

## Files to edit

- `src-tauri/src/commands/mod.rs` — `pub mod binary;`.
- `src-tauri/src/lib.rs` — register `binary::write_binary` in
  `invoke_handler![]`.
- `src/lib/components/Editor.svelte` — install paste + drop handlers on
  the editor host element (around the existing `onContextMenu` wiring
  near line 173).
- `src/lib/state/settings.svelte.ts` — add default + migration
  (`if (!saved.imagePaste) settingsState.values.imagePaste = defaults.imagePaste`).
- `src/lib/components/SettingsDialog.svelte` — add the two controls under
  the Behavior tab (after the "Restore tabs on launch" row).

## Rust command

```rust
// src-tauri/src/commands/binary.rs
use std::path::Path;

#[tauri::command]
pub async fn write_binary(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&path, bytes).await.map_err(|e| e.to_string())
}
```

Tauri 2 serializes `Vec<u8>` as a number array by default; payload size
is fine for screenshots (a few MB). If perf bites, switch to base64 with
`serde_with` later.

## JS handler outline

```ts
// src/lib/utils/imagePaste.ts
import { invoke } from '@tauri-apps/api/core'
import { dirname, join } from '@tauri-apps/api/path'
import { tabsState } from '$lib/state/tabs.svelte'
import { settingsState } from '$lib/state/settings.svelte'
import { saveActiveAs } from '$lib/utils/fileService'
import { toast } from '$lib/state/toast.svelte'
import type { EditorView } from '@codemirror/view'

function timestamp(): string { /* yyyyMMdd-HHmmss */ }
function rand8(): string    { /* 8 hex chars */ }

export async function handleImagePaste(view: EditorView, blob: Blob): Promise<boolean> {
  if (!settingsState.values.imagePaste.enabled) return false
  const tab = tabsState.activeTab
  if (!tab) return false
  if (!tab.path) {
    toast.info('Save the document first', 'Image will be saved next to the file.')
    const ok = await saveActiveAs(tab)
    if (!ok) return true // we handled it (by aborting)
  }
  const docDir = await dirname(tab.path!)
  const sub = settingsState.values.imagePaste.assetsSubdir
  const name = `paste-${timestamp()}-${rand8()}.png`
  const full = await join(docDir, sub, name)

  const buf = new Uint8Array(await blob.arrayBuffer())
  await invoke('write_binary', { path: full, bytes: Array.from(buf) })

  const rel = `${sub.replace(/\\/g, '/')}/${name}`
  const sel = view.state.selection.main
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: `![](${rel})` },
    selection: { anchor: sel.from + rel.length + 4 }, // caret after `(`+rel+`)`
  })
  return true
}
```

## Wiring the paste / drop events in `Editor.svelte`

CodeMirror swallows the DOM `paste`; install a `DOMEventHandlers` ext or
attach to `host` before CM does. Cleanest is an `EditorView.domEventHandlers`
extension in `createEditor.ts`'s `buildExtensions`:

```ts
EditorView.domEventHandlers({
  paste(e, view) {
    const items = e.clipboardData?.items
    if (!items) return false
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const blob = it.getAsFile()
        if (blob) {
          e.preventDefault()
          handleImagePaste(view, blob).catch(err => toast.error('Image paste failed', String(err)))
          return true
        }
      }
    }
    return false
  },
  drop(e, view) { /* mirror for DataTransfer.files with image/* */ }
})
```

Import `handleImagePaste` lazily inside the handler (`await import(...)`)
to keep CM extensions side-effect-free.

## Rust capability

`fs:scope` already permits `$HOME/**`, `$DOCUMENT/**`, `$DESKTOP/**` —
covers nearly all "Documents/Notes" cases. Pasting into a doc under e.g.
`C:\dev\…` requires the user-picked path; consider adding `"$RESOURCE/**"`
or a runtime-asserted scope if you find users hitting denied writes.
`write_binary` itself doesn't need a new permission (it's a custom
command, not the fs plugin).

## Edge cases

1. **Already-on-disk image dragged from Explorer.** The DnD event has a
   real path; just insert `![](file:///…)` or a normalized relative path
   without copying — gated by a setting? Keep it simple for v1: always
   copy, treat DnD same as paste.
2. **Multiple images in clipboard.** Rare; loop and insert each on its
   own line.
3. **Tab path changes after paste.** Asset folder is anchored on
   `tab.path` at paste time — fine, no need to track moves.
4. **Symbolic links / read-only doc dir.** `write_binary` will surface
   the OS error → toast.

## Test plan

- Take a screenshot (`Win+Shift+S`), focus the editor, `Ctrl+V`. Asset
  file appears under `assets/`, markdown link inserted at caret.
- Paste with `imagePaste.enabled = false` → falls through to text paste
  (or "no image data" — silent).
- Paste into a brand-new untitled tab → save-as prompt fires; cancel →
  paste aborted without writing junk.
- Paste a 5 MB image — write completes, link inserts, preview renders.
- Drag a PNG from Explorer onto the editor → same behavior as paste.
