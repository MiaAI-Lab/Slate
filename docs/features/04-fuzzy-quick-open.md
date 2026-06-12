# 04. Fuzzy quick-open

**Goal.** VSCode-style `Ctrl+E` modal that takes a fuzzy query and opens
the matching file in a tab. Scope: files under the currently-opened
folder (feature 03's `folderSidebar.lastFolder`); falls back to
**Recent files** if no folder is set.

## UX

- **Shortcut.** `Ctrl+E` (also expose via Toolbar "Open Recent" submenu
  as "Quick open…"). `Ctrl+P` is already taken by Print.
- **Layout.** Floating dialog, 560×360, centered. Mirror the
  draggable / centered pattern in `SearchPanel.svelte:54-77` —
  same defaults, no drag needed.
- **Input.** Single text input at top, autofocus on open.
- **List.** Up to 50 results below input. Each row: filename + dimmed
  relative path. Highlight matched characters with `--accent`.
- **Keys.** `↑/↓` to move; `Enter` opens active; `Esc` closes;
  `Shift+Enter` opens but keeps the dialog open.

## Files to add

- `src/lib/state/quickOpen.svelte.ts`
- `src/lib/components/QuickOpen.svelte`
- `src-tauri/src/commands/fs_tree.rs` — add `list_files_recursive`
  (or extend feature 03's file).

## Files to edit

- `src/App.svelte` — mount `<QuickOpen />` and add `Ctrl+E` to the
  global keymap.

## Rust: recursive file list

```rust
#[tauri::command]
pub async fn list_files_recursive(root: String, max: usize) -> Result<Vec<String>, String> {
    use walkdir::WalkDir;
    let limit = max.min(20_000);  // hard cap
    let walker = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(super::search::should_descend); // reuse skip-list

    let mut out = Vec::with_capacity(1024);
    for e in walker.filter_map(|x| x.ok()) {
        if !e.file_type().is_file() { continue }
        let p = e.path();
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        if !matches!(ext.as_str(),
            "md"|"markdown"|"mdx"|"txt"|"json"|"yaml"|"yml"|"toml"|
            "js"|"ts"|"rs"|"py"|"go"|"html"|"css"|"svelte") { continue }
        out.push(p.to_string_lossy().into_owned());
        if out.len() >= limit { break }
    }
    Ok(out)
}
```

Make `search::should_descend` public (`pub fn` in `search.rs`) so it can
be reused here. Cap at 20k files; warn on truncate.

## Fuzzy matcher

Don't pull in a library. A 60-line Sublime-style scorer is enough:

```ts
// inline in quickOpen.svelte.ts
export function fuzzyScore(query: string, target: string): { score: number, matched: number[] } | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0, ti = 0
  const matched: number[] = []
  let score = 0
  let prevMatch = -2
  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      score += 1 + (ti === prevMatch + 1 ? 5 : 0)        // adjacency bonus
      if (ti > 0 && /[\\/._\-]/.test(t[ti - 1])) score += 4 // word-boundary bonus
      matched.push(ti); prevMatch = ti; qi++
    }
    ti++
  }
  return qi === q.length ? { score, matched } : null
}
```

Match the basename harder than the full path: score basename + 0.5 ×
full-path score. Tie-break by shorter path.

## State

```ts
class QuickOpenState {
  open = $state(false)
  query = $state('')
  files = $state<string[]>([])    // cached recursive list
  activeIdx = $state(0)

  async load() {
    const root = settingsState.values.folderSidebar.lastFolder
    if (root) {
      this.files = await invoke<string[]>('list_files_recursive', { root, max: 20000 })
    } else {
      this.files = settingsState.values.recentFiles
    }
  }
  show() { this.open = true; this.activeIdx = 0; this.load() }
  hide() { this.open = false; this.query = '' }
}
```

Cache `files` until next open — recursive walk on every keystroke is
wasted. Add a "Refresh" button (`F5`) inside the dialog.

## Wiring

Add to `App.svelte` keydown handler:

```ts
} else if (key === 'e' && !e.shiftKey) {
  e.preventDefault()
  quickOpen.show()
}
```

In `QuickOpen.svelte`, compute results with `$derived`:

```ts
const results = $derived.by(() => {
  if (!quickOpen.query) return quickOpen.files.slice(0, 50)
  const scored = quickOpen.files
    .map(p => ({ p, score: fuzzyScore(quickOpen.query, basename(p)) }))
    .filter(x => x.score !== null)
    .sort((a, b) => b.score!.score - a.score!.score)
  return scored.slice(0, 50).map(x => x.p)
})
```

## Edge cases

1. **No folder, no recents.** Empty state: "No files. Open a folder or
   open files to populate Recent."
2. **Stale cache after files moved on disk.** Refresh on F5 inside
   dialog or on every open if walk is fast enough (<200ms for ~5k files
   typical).
3. **Query with spaces.** Treat as separate fuzzy subqueries (all must
   match the basename). Cheap: split on `/\s+/` and AND the matches.
4. **Mouse + keyboard.** Hovering a row sets activeIdx; click opens.

## Test plan

- Open with `Ctrl+E` → input focused, list populated.
- Type `red.m` → `README.md` ranks at top.
- `↓ ↓ Enter` → opens the third entry.
- Open from a tab that's already open → activates that tab instead of
  spawning a duplicate (already enforced by `openPathInTab`).
- Open without a folder set → list shows Recent files.
