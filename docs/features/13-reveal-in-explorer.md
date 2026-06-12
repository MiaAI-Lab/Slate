# 13. Reveal in Explorer / Copy path / Open containing folder

**Goal.** Three commonly-expected file-ops accessible from the tab
context menu, when the tab has a saved `path`:

- **Reveal in Explorer** — opens Windows Explorer with the file selected.
- **Open containing folder** — opens the folder in Explorer.
- **Copy file path** — full absolute path to clipboard.

## UX

Insert these as a new section in the tab context menu
(`TabBar.svelte:176-191`), between "Close tab" and the divider. Disable
all three when `tab.path == null` (untitled / unsaved tab).

```
Close tab
Close other tabs
Close all tabs
─────────────
Reveal in Explorer
Open containing folder
Copy file path
─────────────
Close all tabs (without saving)
```

Same gesture from the editor's right-click menu? Optional — feature 13
is scoped to the tab menu to avoid menu bloat. Folder-sidebar rows
(feature 03) get the same three entries.

## Files to edit

- `src/lib/components/TabBar.svelte` — three new context items + their
  handlers.

## Reveal-in-Explorer command

Windows: `explorer.exe /select,"C:\path\to\file.md"`. Use
`@tauri-apps/plugin-shell`'s `Command`:

```ts
import { Command } from '@tauri-apps/plugin-shell'

async function revealInExplorer(path: string) {
  // /select needs a comma immediately before the path, no space.
  await Command.create('explorer', [`/select,${path}`]).execute()
}
```

`Command.create` requires the executable be allowlisted via the shell
plugin scope. Add to `src-tauri/capabilities/default.json`:

```json
"permissions": [
  // … existing
  {
    "identifier": "shell:allow-execute",
    "allow": [
      { "name": "explorer", "cmd": "explorer", "args": true }
    ]
  }
]
```

Or simpler: use the OS `open` to point at the *parent folder* (which
the shell plugin's default capabilities already allow). For the
"reveal-and-select" effect, the `explorer /select,` invocation is the
canonical Windows path; permit it explicitly.

## Open containing folder

```ts
import { open as shellOpen } from '@tauri-apps/plugin-shell'
import { dirname } from '@tauri-apps/api/path'

async function openContainingFolder(path: string) {
  await shellOpen(await dirname(path))
}
```

`shellOpen` is allowed by `shell:default` (already in the capabilities
file).

## Copy file path

```ts
async function copyFilePath(path: string) {
  await navigator.clipboard.writeText(path)
  toast.info('Path copied', path)
}
```

## Wiring

In `TabBar.svelte`:

```ts
async function ctxRevealInExplorer() {
  const tab = tabsState.tabs.find(t => t.id === ctxMenu?.tabId)
  closeCtxMenu()
  if (!tab?.path) return
  try { await revealInExplorer(tab.path) }
  catch (e) { toast.error('Reveal failed', String(e)) }
}
async function ctxOpenContainingFolder() { /* mirror */ }
async function ctxCopyFilePath() { /* mirror */ }
```

And in the `{#if ctxMenu}` block, add three buttons with
`disabled={!hasPath}` where:

```ts
const hasPath = $derived(
  ctxMenu ? !!tabsState.tabs.find(t => t.id === ctxMenu.tabId)?.path : false
)
```

## Cross-platform note

This plan is Windows-first. macOS uses `open -R "path"`; Linux
varies (`xdg-open` for the folder, no universal "select"). The
README declares Windows as primary (`README.md:53-54`). If you want
cross-platform-clean code, gate on `import.meta.env.TAURI_PLATFORM` (or
runtime `platform()`).

## Edge cases

1. **Path with spaces / unicode.** `Command.create` quotes args.
   `explorer /select,…` is fussy — pass the path as a single arg,
   prefixed with `/select,` (no space). Verify with a path containing
   a comma — that's a known explorer bug; fall back to "open containing
   folder" if it trips.
2. **File deleted on disk between open and reveal.** `explorer
   /select,` silently opens the parent. OK — non-fatal.
3. **Multiple monitors / Explorer not the default.** Out of scope;
   shell out, let Windows handle.
4. **Untitled tab.** Items disabled — see `disabled={!hasPath}`.

## Test plan

- Right-click a saved tab → three new items. Untitled tab → disabled.
- Click "Reveal in Explorer" → Explorer opens, file selected.
- Click "Open containing folder" → Explorer opens at parent.
- Click "Copy file path" → toast confirms; paste somewhere shows the
  full path.
- Path containing spaces → still works.
