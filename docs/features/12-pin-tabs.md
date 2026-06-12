# 12. Pin tabs

**Goal.** A pinned tab:

- Sticks to the leftmost positions in the tab bar (pinned cluster first,
  then unpinned).
- Is excluded from "Close others" / "Close all (without saving)".
- Renders with a visible highlight (color configurable).
- Survives across session restore.

## UX

- **Pin gesture.** Right-click tab → "Pin tab" / "Unpin tab".
  Optional Ctrl-click (no shortcut otherwise).
- **Visual.** Configurable accent strip down the left edge of the tab
  (3px), plus a small pin glyph (📌 or `•` — match the rest of the
  chrome which avoids emoji; use `▎`).
- **Drag-reorder.** Pinned and unpinned can both be reordered, but
  pinned cannot be dragged into the unpinned cluster nor vice versa
  (clamp during `moveTab`).

## Data shape

```ts
// src/types.ts
export interface Tab {
  // … existing
  pinned: boolean
}
```

Default to `false` everywhere a Tab is constructed:

- `tabsState.newTab` literal in `src/lib/state/tabs.svelte.ts:13-28`.
- `Draft` deserialization in `src/lib/state/session.svelte.ts:42-48`
  — read `d.pinned ?? false`.
- `Draft` Rust struct in `src-tauri/src/commands/session.rs:4-10` —
  add `pub pinned: bool`. Older JSON without the field will fail
  `serde_json::from_str`; mark with `#[serde(default)]`.

## Settings

```ts
pinnedTabs: {
  highlight: 'accent' | 'custom'  // default 'accent'
  customColor: string             // default '#fbbf24' (amber)
  showStrip: boolean              // default true — colored bar on tab
}
```

Two controls in the **Appearance** tab (group them under a "Pinned tab"
heading):

- Radio: Use accent color vs Custom (color picker, same widget as the
  accent picker at `SettingsDialog.svelte:167-190`).
- Checkbox: "Show colored strip on pinned tabs".

Apply the resolved color via a CSS variable:

```ts
// in App.svelte's effect alongside applyAccent
document.documentElement.style.setProperty('--pin-color',
  settingsState.values.pinnedTabs.highlight === 'accent'
    ? 'var(--accent)'
    : settingsState.values.pinnedTabs.customColor)
```

## Files to edit

- `src/types.ts`, `src/lib/state/tabs.svelte.ts`,
  `src/lib/state/session.svelte.ts`,
  `src-tauri/src/commands/session.rs` — schema.
- `src/lib/components/TabBar.svelte` — render strip, add context-menu
  entry, gate move semantics.
- `src/lib/utils/fileService.ts` — `closeOtherTabs`, `closeAllTabs`,
  `closeAllTabsDiscardAll` skip pinned.
- `src/lib/state/settings.svelte.ts`,
  `src/lib/components/SettingsDialog.svelte` — settings.

## tabs.svelte.ts changes

```ts
togglePin(id: string) {
  const t = this.tabs.find(t => t.id === id)
  if (!t) return
  t.pinned = !t.pinned
  // Move pinned tabs to keep cluster contiguous.
  this.tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned))
}

// moveTab clamp:
moveTab(fromIdx: number, toIdx: number) {
  if (fromIdx === toIdx) return
  const from = this.tabs[fromIdx]
  // Compute pinned cluster boundary.
  const lastPinnedIdx = this.tabs.findLastIndex(t => t.pinned)
  const minIdx = from.pinned ? 0 : lastPinnedIdx + 1
  const maxIdx = from.pinned ? lastPinnedIdx : this.tabs.length - 1
  toIdx = Math.max(minIdx, Math.min(toIdx, maxIdx))
  // existing splice
}
```

`Array.prototype.findLastIndex` is ES2023; available on Chromium 97+
which WebView2 satisfies.

## TabBar.svelte

- Add a context-menu item before "Close tab":
  `{ctxMenu.tabId-tab.pinned ? 'Unpin' : 'Pin'}`. Call `togglePin`.
- Add a CSS class `pinned` to the tab button when `tab.pinned`. Style:

```css
button.pinned {
  border-left: 3px solid var(--pin-color, var(--accent));
}
```

Only if `settingsState.values.pinnedTabs.showStrip` is true — bind the
class conditionally.

## fileService changes

```ts
export async function closeOtherTabs(keepId: string): Promise<void> {
  const ids = tabsState.tabs
    .filter(t => t.id !== keepId && !t.pinned)
    .map(t => t.id)
  for (const id of ids) { /* … */ }
}

export async function closeAllTabs(): Promise<void> {
  const ids = tabsState.tabs.filter(t => !t.pinned).map(t => t.id)
  // …
}

export async function closeAllTabsDiscardAll(): Promise<void> {
  const targets = tabsState.tabs.filter(t => !t.pinned)
  // confirm, etc.
}
```

Tabbar "Close all" can stay enabled even when only pinned tabs exist;
it just becomes a no-op. Or disable when `tabs.every(t => t.pinned)`.

## Session

The `Draft` schema in Rust must carry `pinned` so restored tabs
preserve state:

```rust
#[derive(Serialize, Deserialize)]
pub struct Draft {
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub pinned: bool,
}
```

JS side, in `runDraftSweep`, include `pinned`:

```ts
const draft: Draft = { id: tab.id, path: tab.path, title: tab.title, content: tab.content, pinned: tab.pinned }
```

And in `initSession`, restore it:

```ts
const id = tabsState.newTab({
  id: d.id, path: d.path, title: d.title, content: d.content,
  pinned: d.pinned ?? false, dirty: true,
})
```

## Edge cases

1. **Pinned + dirty + Close all without saving** — the discard branch
   currently force-clears dirty and closes; honor pinned by excluding
   those.
2. **Pin-while-dragging.** TogglePin sorts the array; if the user is
   mid-drag, the indices flicker. Disable togglePin during drag (the
   context menu can't open mid-drag anyway).
3. **Middle-click on pinned tab.** Current `onMouseDown` (button 1) goes
   through `closeWithGuard`. Decision: middle-click *does* close pinned
   tabs — explicit gesture, the user knows what they're doing. Document
   this.
4. **Session restoring a pinned tab that's already open in another
   window.** Second window will also restore it pinned; harmless.

## Test plan

- Pin a tab → moves to leftmost. Strip visible. Setting toggle hides
  strip but keeps pin semantics.
- Close all → pinned tabs survive. Close others → ditto.
- Toggle accent color in settings → pin strip color follows.
- Custom color via picker → applied immediately.
- Restart app → pinned state restored from drafts.
- Drag pinned past unpinned cluster → clamped at cluster boundary.
