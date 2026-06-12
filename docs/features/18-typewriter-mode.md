# 18. Typewriter mode

**Goal.** Keep the active line centered vertically while typing. Long
documents stop scrolling out from under the caret.

## UX

- **Toggle.** View menu (`Toolbar.svelte`) → "Typewriter mode" item.
- **Keyboard.** None by default. (Most users toggle it once and forget.)
- **Visual.** No indicator other than the centering itself.

## Settings

```ts
typewriterMode: boolean   // default false
```

In **Behavior** tab.

## Files to add

- `src/lib/editor/typewriter.ts` — a CodeMirror extension that pads the
  scroller so the active line ends up vertically centered.

## Files to edit

- `src/lib/editor/compartments.ts` — `typewriterCompartment`.
- `src/lib/editor/createEditor.ts` — include the compartment in
  `buildExtensions`, default off.
- `src/lib/components/Editor.svelte` — reconfigure on setting change.
- `src/lib/components/Toolbar.svelte` — View menu entry.

## Implementation

Two equivalent approaches; centering via `scrollIntoView({y:'center'})`
on every selection change is the simplest:

```ts
// src/lib/editor/typewriter.ts
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'

export function typewriterPlugin() {
  return ViewPlugin.fromClass(class {
    update(u: ViewUpdate) {
      if (!u.selectionSet && !u.docChanged) return
      const head = u.state.selection.main.head
      // Don't fight programmatic scrolls (SyncFromStore).
      if (u.transactions.some(t => t.annotation(SyncFromStore))) return
      const view = u.view
      requestAnimationFrame(() => {
        view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) })
      })
    }
  })
}
```

(Import `SyncFromStore` from `createEditor.ts`.) The `rAF` defers the
scroll so it doesn't fight the same-frame layout pass.

Alternative: bottom padding via a top/bottom decoration that pushes the
final line to mid-viewport, so users see what's coming below the
current line. Cleaner but more code. Defer to v2.

## Wiring

```ts
// createEditor.ts buildExtensions
typewriterCompartment.of([]),   // empty by default
```

In `Editor.svelte`:

```ts
$effect(() => {
  const on = settingsState.values.typewriterMode
  if (!viewReady || !view) return
  view.dispatch({
    effects: typewriterCompartment.reconfigure(on ? typewriterPlugin() : []),
  })
})
```

## Edge cases

1. **Search-jump.** `Editor.svelte:131-150` already scrolls to a search
   match. The typewriter plugin will then re-center on the caret —
   which lands on the match. Harmless duplicate scroll.
2. **Click to move caret.** Triggers `selectionSet`; the plugin
   centers. Good.
3. **Multi-cursor.** Centers on `selection.main.head`. Acceptable.
4. **First line / last line.** `scrollIntoView({y:'center'})` clamps
   naturally — last few lines bottom-anchor; first lines top-anchor.
   Document the gentle degradation; alternative is to *pad* the
   scroller, which avoids the clamp but adds complexity.
5. **Performance.** rAF + one transaction per keystroke is fine even on
   huge docs.

## Test plan

- Toggle on, type a long doc → caret stays at vertical center.
- Click to a line near the top → page scrolls so the line is centered.
- Toggle off mid-session → next typing returns to normal scroll
  behavior.
- Click on first or last line — line is at the natural top/bottom
  (no infinite scroll).
