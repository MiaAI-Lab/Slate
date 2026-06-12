# Code review — md-editor

**Date:** 2026-05-14
**Scope:** Phases 6–12 of `PLAN.md` plus ~25 follow-up tweaks (Settings dialog,
OLED theme, accent picker, menu-text brightness, Search panel with replace /
Next-Previous / live editor highlight, draft autosave, tab context menu,
draggable/centered floating Search dialog, "New window" support, etc.).
**Reviewer:** general-purpose agent, prompted to find bugs / leaks / races /
broken edges only. Not a redesign.

Findings are grouped by severity. Each entry is `file:line — finding` followed
by 1–2 sentences of context.

---

## Critical

```
[critical] src-tauri/src/commands/search.rs:40-44 — walkdir does not exclude .git, node_modules, hidden dirs
  WalkDir traverses everything. Pointing at a project root will spend serious time + RAM walking .git/objects, node_modules, etc., and may surface text matches from inside them. Extension filtering is applied *after* descent, so the cost is incurred regardless.

[critical] src-tauri/capabilities/default.json:4 — "main-*" pattern won't match labels like "main-1747227..."
  Spawned windows use `main-${Date.now()}`. Tauri capability `windows` globs are limited — depending on version this either fails to match or matches loosely. If it doesn't match, the new window has zero permissions and every plugin call (fs / dialog / store / event) fails silently. Worth verifying at runtime; the file:// URL load in openNewWindow only works if core:webview perms apply to the spawner, but plugin perms inside the spawned window are the real issue.

[critical] src/lib/utils/fileService.ts:211-219 — openNewWindow uses url: 'index.html?spawned=1' which breaks under `tauri dev`
  In dev, the frontend is served from a Vite dev server (e.g., http://localhost:1420/). A bare relative `index.html?spawned=1` is resolved against the current page; with WebviewWindow's URL handling that frequently produces a tauri://localhost/index.html?spawned=1 path that 404s on dev. Use `getCurrent()`-derived origin or pass a full URL when WEBVIEW_URL is http(s).
```

## High

```
[high] src/lib/state/settings.svelte.ts:142-147 — $effect.root persists every reactive write but on init persists the loaded snapshot back over itself
  After Object.assign + migration, the root-level $effect fires immediately and writes the just-loaded object back into the store. On a stale on-disk file with extra keys, those keys are preserved by Object.assign and then re-saved — no harm — but on an *older* file missing fields, defaults are merged in and an unrelated user-edit-less write happens on every startup. Cheap, but masks real semantics.

[high] src/lib/state/settings.svelte.ts:142 — $effect.root never disposed; leak under HMR + accumulating subscribers
  initSettings is awaited at module top-level in main.ts; HMR / re-entry into the module creates additional $effect.root subscribers that each write on every settings change. Each reload doubles write traffic to the store. Guard with a module-level `initialized` flag like session.svelte.ts does.

[high] src/lib/state/session.svelte.ts:32-48 — initSession restores drafts even after the user previously chose Discard/Save
  After saveActive/closeTabById, `clearDraftFor` is fired but not awaited, and write_draft fires on the next 5-second sweep. If the user saves + immediately quits within 5s, the lingering draft file persists. On next launch initSession will restore it as a duplicate "(Restored unsaved changes)" tab, even though the file was saved cleanly. The sweep's clear-pass only clears IDs it has in lastWritten — which is empty at relaunch.

[high] src/lib/editor/searchHighlight.ts:24 — `matches.indexOf(m)` inside the sort loop is O(n²)
  For a 5k-match document (easy on a big README), this is 25M comparisons per highlight rebuild, which runs every keystroke. Pre-compute a Map<ref|fromKey, originalIdx> before the loop, or store the original index on the sorted copy.

[high] src/lib/components/Editor.svelte:111-116 — search highlight dispatch fires before docLen catches up after typing
  The matches effect depends on searchPanel.matches/currentIdx; tabsState.updateContent fires before the SearchPanel $effect recomputes matches. When typing rapidly, the EditorView dispatches stale match ranges; buildHighlights clamps to docLen so it's safe, but the *current* match selection $effect (line 119-132) also dispatches a selection at `m.from` which may now point past doc end. The guard `m.from >= docLen` rejects only when from is beyond the end — a from that is valid but to that is beyond will silently select fewer chars; benign. The bigger issue: this $effect annotates SyncFromStore but still moves the selection during user typing, which fights the user's caret.

[high] src/lib/components/Editor.svelte:62-85 — switching tabs after the view mounts may double-dispatch on first tick
  When mountedTabId is set inside untrack on the mount effect, but the tab-change effect also runs once with tabId===mountedTabId on initial flush and falls into syncFromStoreIfDiverged. If activeTab differs from the tab whose content was passed to currentOpts (only possible if a tab is created between mount-schedule and mount-run, but happens during HMR / fast multi-mount), it'll dispatch a sync. Low impact in practice but a real divergence path.

[high] src-tauri/src/commands/export.rs:24-31 — initialization_script with literal title sentinel is safe, but afterprint may never fire on cancel in some Chromium builds
  Chrome only fires `afterprint` when the print preview is actively closed; if the window is closed via the OS X-button before the print sheet appears or beforeprint hangs, the title is never flipped and the temp file leaks until the 5-minute timeout. Add a webview close listener that also triggers cleanup.

[high] src-tauri/src/commands/export.rs:10 — temp file path is predictable (millis+monotonic counter); HTML written world-readable in /tmp
  Not really a uuid; collisions across windows + symlink attacks possible on multi-user machines. Tauri runs as user so the risk is low, but content may include the user's draft material. Prefer the `uuid` crate already in tree.

[high] src-tauri/capabilities/pdf-export.json:7 — pdf-export window has *only* `core:window:allow-close`; the init script calls `window.print()` and document.fonts.ready
  Those don't need Tauri perms (they're DOM APIs), so OK. But there's no `core:webview:allow-internal-toggle` or input event scope — fine in current code, just call out so future additions don't expect IPC.

[high] src/lib/components/SearchPanel.svelte:138-139 — currentIdx clamp can flicker between 0 and stale value when the user is mid-typing
  When matches transitions from 3→0→2 across keystrokes, currentIdx >=0 keeps the previous index for one tick if the new positions array length exceeds it, otherwise resets to 0. With the Editor's selection-on-currentIdx effect, this scrolls the caret around per-keystroke even when the user only added a character. Consider holding the previous match position when possible.

[high] src/App.svelte:131 — `tabsState.jumpTo(Number(e.key))` is blocked when focus is in CodeMirror, but `!inCm` is checked only for digit keys
  The earlier branches (Ctrl+N etc.) all run regardless of focus — that's fine for save/open/new. But Ctrl+1..9 in CodeMirror would have been a useful shortcut. Inconsistent; intentional? At minimum confirm in PLAN.
```

## Medium

```
[medium] src/lib/state/session.svelte.ts:51-65 — runDraftSweep is not mutex-protected
  Runs every 5s. If a sweep takes >5s (slow disk, many tabs), the next setInterval tick will start a second sweep that races on lastWritten. tokio::fs::write is atomic per-call but the JS-side lastWritten.set after await can be reordered relative to the second sweep's read. Wrap with a "sweeping" flag.

[medium] src/lib/state/session.svelte.ts:67-74 — clear-pass walks `lastWritten.keys()` but a tab present in tabs with dirty=false also clears its draft — fine; but a draft restored at startup with dirty=true is now in lastWritten, and the moment the user clears their changes (undo back to original), no draft removal until next sweep
  Acceptable, but document.

[medium] src/lib/components/SearchPanel.svelte:121-140 — matches effect re-runs on every keystroke in CodeMirror (deep reactivity on tab.content), good — but it allocates a new positions array every time
  For a Wikipedia-sized doc with 'a' as query this is millions of pushes per keystroke. Add a debounce or cap (e.g., stop after 5,000 matches and set truncated state).

[medium] src/lib/components/Editor.svelte:31-34 — onChange closure captures mountedTabId by reference (correct), but currentOpts is rebuilt only during initial mount
  When `view.setState(buildState(currentOpts(tabContent)))` is called for a tab switch (line 80), it captures `mountedTabId` *as it is at that call time*. But mountedTabId is set on line 82 — *after* buildState. So the updateListener for the new state momentarily sees the previous mountedTabId; the next user keystroke updates the *old* tab. Verify: the next line writes mountedTabId, and updateListener only fires on user input (not on setState), so practically OK because no input happens between line 80 and 82. Subtle.

[medium] src/lib/components/SearchPanel.svelte:103-107 — Position-on-open uses PANEL_W/PANEL_H_SINGLE before panelEl is rendered; with `position: fixed` over a relative editor parent
  position:fixed is viewport-relative so the editor's relative parent doesn't affect it — that part is fine. But the panel is mounted *inside* the editor's overflow:hidden grid wrapper (App.svelte:193), so the dragged panel is clipped by the wrapper's overflow on screens where it's pushed out of the wrapper bounds. With position:fixed Chromium does still clip when a parent has `transform`/`filter` creating a stacking context, but `overflow:hidden` alone does not — usually safe. Re-test on Linux WebView.

[medium] src/lib/components/SearchPanel.svelte:269 — clampToViewport uses `window.innerWidth - 160` (not - PANEL_W); panel can be dragged offscreen on the right
  Intentional (only forces 160px visible) but inconsistent with bottom clamp `- 40`. The 160 keeps the X button reachable; comment it.

[medium] src/lib/components/SearchPanel.svelte:300-307 — Replace All applies the same regex to all targetTabs, then re-runs search — but tabsState.updateContent does not run if a tab is in stateByTab and CodeMirror holds different content
  After replace, the Editor's tab-switch effect line 77-81 sees stateByTab existing for the tab with the *pre-replace* doc, and `existing.doc.toString() === tabContent` is false, so it rebuilds the state — correct. But if the active tab is unchanged, the syncFromStoreIfDiverged path handles it. Verify with a focused test.

[medium] src/lib/state/settings.svelte.ts:5-9 — LEGACY_PREVIEW_FONTS misses earlier defaults
  Before phase 12 the default was 'Cambria, "Times New Roman", serif' (per PLAN.md if it exists). The set has 'Georgia, serif' / 'Cambria, Georgia, serif' / '"Times New Roman", serif' — confirm against your git history. Any string not in the set silently survives.

[medium] src/App.svelte:138-140 — capture-phase keydown handler also blocks Ctrl+F inside <input> fields (the SearchPanel input!)
  Once the search panel opens, Ctrl+F inside the find-input is intercepted by App handler with preventDefault → toggle, *closing* the panel. The fix is to check `target?.tagName === 'INPUT'/'TEXTAREA'` and let the panel's onKeydown decide.

[medium] src/lib/components/ConfirmDialog.svelte:74-81 — mnemonic 'c' collides between "Cancel" (close-mode) and Cancel (confirm-mode) — fine — but 'n' for "No" overlaps with the global Ctrl+N. Without ctrl modifier the global handler ignores it, so OK. Worth a unit test.
```

## Low

```
[low] src/lib/state/tabs.svelte.ts:13 — newTab accepts init.id; if caller passes an id already in use, the duplicate is silently inserted
  session.svelte.ts calls newTab({ id: d.id }) per draft; if two draft files share the same id (corruption / manual edit), two tabs collide and stateByTab.delete(id) on close destroys both. De-dupe in initSession or assert uniqueness here.

[low] src/lib/utils/fileService.ts:97-110 — saveActive swallows clearDraftFor errors silently; same for saveActiveAs:120
  Acceptable, but if the draft never clears the user gets a phantom restore next launch. Log at debug.

[low] src/lib/components/SearchPanel.svelte:159-178 — searchInTabs caps to 50/file and 500 total but reports only `truncated`; user can't tell what got dropped per-file
  Cosmetic; copy-paste of the Rust counterpart.

[low] src-tauri/src/commands/session.rs:58-62 — sanitize_id collapses all unsafe chars to '_'; two different ids with non-ASCII content produce the same filename
  Could overwrite each other's drafts. UUIDs are ASCII-safe so in practice fine, but if a user-supplied tab title leaks into the id path some day, regression risk.

[low] src/lib/utils/exportHtml.ts:18 — embeds the full `app.css` (tailwind + everything) into every exported HTML
  Bloats output by ~hundreds of KB. Use a minimal hand-rolled prose stylesheet for export.

[low] src/lib/components/Editor.svelte:115 — `view.dispatch({ effects: setSearchHighlight.of(...) })` fires even when matches is empty and previous decos were also empty
  Wasted transaction. Track previous and short-circuit.

[low] src/lib/state/tabs.svelte.ts:47 — updateContent same-content guard prevents the rare "Replace 'abc' with 'abc'" dirty-flag case
  As you suspected, moot — but if you ever add "Strip trailing whitespace" hotkey that no-ops, dirty won't fire. Document the contract.

[low] src/App.svelte:81-89 — every Tab content change triggers a dynamic import('@tauri-apps/api/window') + setTitle
  The import is module-cached after first, but setTitle IPC fires on every keystroke. Debounce, or only call on activeId/title/dirty change (right now tabContent is *not* a dep of the title effect, so this is actually fine — false alarm).
```

## Nit

```
[nit] src-tauri/src/commands/export.rs:84-93 — `uuid_short` reimplements a uuid; uuid crate already imported via cargo (session.svelte.ts uses one; Rust side may not). If absent, fine.

[nit] src/lib/state/searchPanel.svelte.ts:8 — `query = $state('')` initialized to empty; on close() it's cleared anyway. Consider keeping it on close for "Find again" UX.

[nit] src/lib/components/SearchPanel.svelte:209 — after Enter, both runSearch *and* nextMatch fire; on first Enter with no prior search, runSearch sets results then nextMatch increments through whatever was already in `searchPanel.matches` (live ones), which can desync the result-list "current" indicator.
```

---

## Reviewer's summary of real bugs vs red herrings

**Confirmed real bugs (priority):**
- `walkdir` not excluding hidden / build dirs — **critical**
- `index.html?spawned=1` URL handling in dev mode — **high**
- Capability `main-*` glob — needs runtime verification but **high-risk** if Tauri's matcher rejects it
- Ctrl+F captured even when focus is inside the Search panel's find input — **medium/high**
- `searchHighlight.ts` `indexOf` O(n²) — **high** for large docs
- Current-match selection effect re-fires on every keystroke and fights the caret — **high**

**Theoretical but ruled out:**
- "Race in `initSettings` writing back stale snapshot" — Object.assign-then-effect.root is fine; the *first* root-effect run reads the post-assign snapshot. It does write a no-op back on startup but doesn't corrupt anything.
- "OLED `.cm-editor !important` leaks into PDF export window" — OLED override is scoped to `.oled .cm-editor`; PDF export window has `class="dark"`, not `.oled`. No leak.
- `tab.content` deep-reactivity in the SearchPanel match-recompute effect — works via Svelte's `$state` proxy.
- `setTitle` IPC per-keystroke — `tab.content` isn't a dep of that effect; was a false alarm.

## Recommended fix tranche

If you want a single batch of fixes that buys the biggest behavior wins:

1. `search.rs`: skip hidden dirs (`.git`, `.svn`, `node_modules`, `target`, `dist`, `build`, anything starting with `.`).
2. `openNewWindow`: derive the base URL from `window.location.origin` so dev and prod both work; pass full URL to `WebviewWindow`.
3. Capability glob: replace `"main-*"` with explicit per-window capabilities or use a wildcard the running Tauri version actually supports (verify with a smoke test).
4. App.svelte capture-phase Ctrl+F: bail when `target` is inside the Search panel inputs.
5. `searchHighlight.ts`: store the original index alongside the sorted copy (one allocation, O(n)).
6. Editor.svelte current-match scroll effect: gate on `searchPanel.open` and only dispatch when `currentIdx` actually changed (skip on doc-change).
7. `export.rs`: use the `uuid` crate (add to Cargo.toml if not already there) for temp filenames.
8. `runDraftSweep`: add a `sweeping` boolean guard.

Items 1, 2, 3, 4, 6 are the user-visible ones. The rest are robustness / perf.
