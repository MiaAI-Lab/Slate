# 02. Outline / TOC sidebar

**Goal.** Right-side dockable panel listing every heading in the active
tab. Click → caret jumps + scrolls; updates live as the user types.

## UX

- **Toggle.** Toolbar button labeled "Outline" + `Ctrl+\` keyboard.
- **Layout.** Right-side column, fixed `240px` (resizable later), shown
  only when toggled on AND active tab is markdown (`isMarkdownPath`).
  Hidden in fullscreen by default (matches Toolbar/TabBar gating in
  `App.svelte:238-241`).
- **Items.** `H1`–`H6` indented by depth. Each row shows the heading
  text; collapsed to 1 line with ellipsis. Active heading (caret line)
  is highlighted with `--accent`.
- **Empty state.** "No headings yet" placeholder centered in the panel.

## Settings

```ts
outline: { open: boolean }  // default false; persists toggle state
```

Add to `AppSettings` and `defaults`. Migration:
`if (!saved.outline) settingsState.values.outline = defaults.outline`.

## Files to add

- `src/lib/state/outline.svelte.ts` — derived list of headings + open flag.
- `src/lib/components/OutlineSidebar.svelte` — the panel.

## Files to edit

- `src/App.svelte` — mount `OutlineSidebar` to the right of the
  editor/preview grid; gate visibility on
  `settingsState.values.outline.open && isMarkdownPath(activeTab.path)`.
- `src/lib/components/Toolbar.svelte` — add toggle button beside Wrap.
- `src/lib/state/settings.svelte.ts` — defaults + migration.
- `src/App.svelte` global keydown handler — add `Ctrl+\` branch (the
  large `if`/`else if` chain in the `handler` closure).

## Heading parser

```ts
// src/lib/state/outline.svelte.ts
import { marked } from 'marked'
import { tabsState } from './tabs.svelte'

export interface Heading {
  depth: 1|2|3|4|5|6
  text: string
  line: number    // 1-based, the line of the heading in source
}

class OutlineState {
  open = $state(false)

  headings = $derived.by((): Heading[] => {
    const md = tabsState.activeTab?.content ?? ''
    if (!md) return []
    const tokens = marked.lexer(md) as marked.Token[]
    const out: Heading[] = []
    let lineCursor = 1
    // marked tokens don't carry a line number — recompute by walking
    // `token.raw` lengths against the source.
    // Cheaper alternative: regex /^(#{1,6})\s+(.+)$/gm; do that instead.
    const lines = md.split('\n')
    const re = /^(#{1,6})\s+(.+?)\s*#*\s*$/
    for (let i = 0; i < lines.length; i++) {
      // Skip fenced code blocks.
      // (Track ``` toggle; ATX headings inside code don't count.)
      const m = re.exec(lines[i])
      if (m) out.push({ depth: m[1].length as Heading['depth'], text: m[2], line: i + 1 })
    }
    return out
  })
}
export const outlineState = new OutlineState()
```

Use the regex approach — `marked.lexer` doesn't expose line numbers and
re-walking `raw` lengths is finicky. Track a `inFence` boolean to skip
headings inside ``` ``` ``` blocks.

## Click → jump

The existing pattern uses `tabsState.setPendingScrollLine(tab.id, line)`
(see `src/lib/components/Editor.svelte:98-109` `consumePendingScroll`).
On row click:

```ts
tabsState.setPendingScrollLine(tabsState.activeTab!.id, heading.line)
```

The Editor effect will pick it up and scroll the caret into view.

## Active-heading tracking

Use `cursorState.line` (already maintained in `createEditor.ts:69-73`).
The active heading is the largest `heading.line <= cursorState.line`.
Compute as `$derived`. Highlight with `aria-current="true"` + a CSS rule.

## Layout change in `App.svelte`

Today's grid (line 244):

```svelte
<div class="grid h-full w-full"
  class:grid-cols-2={mode === 'split'}
  class:grid-cols-1={mode !== 'split'}>
```

Switch to a two-column outer flex: `[editor/preview] [outline]`, with
the outline rendered conditionally. Don't try to fold it into the
existing grid — split-mode already uses grid-cols, and stacking two
grid layers will confuse the layout.

```svelte
<div class="flex h-full w-full">
  <div class="flex-1 min-w-0">
    <!-- existing grid: editor + preview -->
  </div>
  {#if settingsState.values.outline.open && isMarkdownPath(activeTab?.path ?? null)}
    <OutlineSidebar />
  {/if}
</div>
```

## Edge cases

1. **Headings inside fenced code blocks** must be skipped — see parser
   note above.
2. **Setext headings** (`text\n====`) — support if you want; v1 can
   accept ATX-only (`#`) since most docs use them.
3. **Very large docs (10k lines).** Regex walk is O(n) per keystroke
   via `$derived`. Acceptable up to ~50k lines; if perf bites, debounce
   the derivation (mirror `preview.svelte.ts`).
4. **HMR.** No special handling — `outlineState` is a module singleton,
   shares the existing pattern.

## Test plan

- Type `# A\n## B\n### C` → three rows nested correctly.
- Click row B → caret moves to that line, editor scrolls.
- Move caret manually onto C → row C highlights.
- Wrap headings in ` ``` ` → outline empties.
- Toggle off → panel disappears, setting persists across restart.
