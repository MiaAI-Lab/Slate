# 06. Split-view sync scroll

**Goal.** Side-by-side editor + preview, with synchronized scroll so the
preview tracks the editor's visible top line.

Background: the layout in `App.svelte:244-258` *already* renders both
panes when `viewMode === 'split'`. But `App.svelte:35-43` actively
demotes `'split'` to `'editor'` because no UI exposes the mode. Three
things need to happen: expose the mode, add the sync, gate it on a
setting.

## Settings

```ts
splitSyncScroll: boolean   // default true
```

Add to `AppSettings.behavior`-flavored section of `SettingsDialog.svelte`
**Behavior** tab.

## Files to edit

- `src/App.svelte` — REMOVE the split→editor demotion at lines 38-39.
  Leave the non-markdown guard in place.
- `src/lib/components/Toolbar.svelte` — add a "Split" toggle button
  beside "Preview". Pressed state when `viewMode === 'split'`.
- `src/lib/components/Editor.svelte` — expose a `view`-readable signal
  for "visible top line" (cheapest: an exported writable in a new state
  store, written on the editor's `viewport` updates).
- `src/lib/components/Preview.svelte` — consume that signal and scroll
  to the matching heading / nearest mapped element.
- `src/lib/state/settings.svelte.ts` — default + migration.

## Files to add

- `src/lib/state/splitScroll.svelte.ts`

## Mapping algorithm

Editor line ↔ preview element. Two viable approaches:

1. **Heading anchor map.** Walk the source for `^#{1,6} ` lines, take
   their line numbers. In preview, the rendered DOM contains
   `<h1>…<h6>` in source order. Build pairs
   `[{ sourceLine, headingEl }]`. On scroll, find the largest pair
   with `sourceLine <= viewportTop`, scroll preview so that heading is
   at the top.
2. **Per-block mapping.** marked tokens carry no line numbers; would
   require switching to `marked.lexer` + walking `raw` length. Not
   worth the complexity for v1.

Go with (1). Heading-granularity sync is what users actually want
anyway; per-paragraph sync produces twitchy preview behavior.

## Signal layer

```ts
// src/lib/state/splitScroll.svelte.ts
class SplitScrollState {
  /** 1-based line at the top of the editor's viewport. */
  editorTopLine = $state(1)
  /** True while preview is scripting its own scroll (suppress reverse). */
  programmaticScroll = $state(false)
}
export const splitScroll = new SplitScrollState()
```

## Editor side

In `createEditor.ts:buildExtensions`, append an update listener:

```ts
EditorView.updateListener.of(update => {
  if (!update.geometryChanged && !update.viewportChanged) return
  const { top } = update.view.scrollDOM.getBoundingClientRect()
  const pos = update.view.posAtCoords({ x: 0, y: top + 1 })
  if (pos == null) return
  const line = update.state.doc.lineAt(pos).number
  if (line !== splitScroll.editorTopLine) splitScroll.editorTopLine = line
}),
```

Gate the work cheaply — `scrollDOM` reads are fine but compute the line
only on geometry/viewport change.

## Preview side

```ts
// in Preview.svelte
const headingMap = $derived.by(() => {
  // walk previewState.content lines, pick heading line numbers
})

$effect(() => {
  if (!settingsState.values.splitSyncScroll) return
  const line = splitScroll.editorTopLine
  if (mode !== 'split') return
  const target = pickHeading(headingMap, line)  // largest sourceLine <= line
  if (!target) return
  const headings = articleEl.querySelectorAll('h1,h2,h3,h4,h5,h6')
  const el = headings[target.index] as HTMLElement | undefined
  if (!el) return
  // scrollIntoView is too aggressive; offset from top of scroll container.
  const top = el.offsetTop - 8
  articleEl.scrollTo({ top, behavior: 'instant' })
})
```

`'instant'` not `'smooth'`: smooth scroll fights the next update.

## Reverse direction (preview → editor)

Out of scope for v1. It introduces a feedback loop (each side's scroll
fires the other's listener) that needs debouncing + a "user-driven"
flag. Ship editor → preview first; users will tell you if they want
both.

## Toolbar button

In `Toolbar.svelte`, after the existing Preview button:

```svelte
<button
  class="tb-btn toggle"
  class:on={mode === 'split'}
  onclick={() => setMode(mode === 'split' ? 'editor' : 'split')}
  title="Split editor + preview"
  disabled={!isMd || !hasActive}
  aria-pressed={mode === 'split'}
>Split</button>
```

## Edge cases

1. **No headings in doc.** Sync degrades to "scroll preview to top"; OK.
2. **Editor in fenced code with `#` characters inside.** Heading-line
   collector must skip lines inside ``` ``` blocks (mirror the outline
   plan's `inFence` toggle).
3. **Preview just re-rendered (content changed).** `articleEl`'s
   children rebuild; old `headings` NodeList is stale. The `$effect`
   re-runs because it reads `previewState.content` indirectly via
   `headingMap`. Good.
4. **`viewMode === 'preview'` (preview-only).** No sync needed — only
   active in `split`. Gate the effect on `mode === 'split'`.
5. **Setting toggled off mid-session.** Effect simply no-ops; no
   teardown needed.

## Test plan

- Toggle Split → editor and preview side-by-side; demotion no longer
  fires.
- Scroll editor → preview's nearest heading anchors at top.
- Toggle "Sync scroll while split" off in Behavior settings → both
  panes scroll independently.
- Add/remove headings → sync still works on next scroll event.
- Switch to non-markdown file → split disabled (existing guard).
