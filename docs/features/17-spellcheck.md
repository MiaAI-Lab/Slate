# 17. Native spell check

**Goal.** Enable WebView2's built-in spell checker on the CodeMirror
editor. Native squigglies, native suggestions on right-click.

Currently listed as out-of-scope (`PLAN.md` § "Out of scope":
"Native spell check inside CodeMirror …"). This plan re-evaluates and
proposes a minimal opt-in implementation.

## Why it's cheap

CodeMirror's `contentDOM` is `contenteditable`. Setting `spellcheck="true"`
on it makes WebView2 / Chromium pick the right language from
`navigator.language` and show squigglies. The native context menu's
suggestion list works out of the box on a right-click.

Cost: tiny CPU overhead per typed word; no dependencies.

## Conflict with our custom right-click menu

`Editor.svelte:173-187` calls `e.preventDefault()` on contextmenu to
replace the native menu with a themed one. That blocks the spell-check
suggestions menu.

Resolution: when right-clicking inside a misspelled-word range, fall
back to the native menu instead of showing our custom one. Detect via
`window.getSelection()` and `document.caretRangeFromPoint` to read the
word at the cursor; check `Intl.Segmenter` or just sniff the
`::-webkit-grammar-error` / `::-webkit-spelling-error` pseudo-class.

Practical heuristic: when the user holds **Shift** while right-clicking,
show the native menu. Document the shortcut. Cheap; avoids the
detection mess.

## Settings

```ts
spellCheck: {
  enabled: boolean    // default false
}
```

Place in **Behavior** tab. Tooltip:
"Uses your OS spell-check language. Shift-right-click for suggestions."

## Files to add

- `src/lib/editor/spellCheck.ts` — a CodeMirror plugin that sets
  `spellcheck` on `contentDOM` reactively.

## Files to edit

- `src/lib/editor/createEditor.ts` — add the spellcheck extension
  into a new compartment.
- `src/lib/editor/compartments.ts` — `export const spellCompartment = new Compartment()`.
- `src/lib/components/Editor.svelte` — reconfigure on
  `settingsState.values.spellCheck.enabled` change.
- `src/lib/components/Editor.svelte:173-187` — handle Shift-right-click
  exception.

## Implementation

```ts
// src/lib/editor/spellCheck.ts
import { ViewPlugin } from '@codemirror/view'

export function spellCheckPlugin(enabled: boolean) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      view.contentDOM.spellcheck = enabled
      // Markdown can include source code; spellcheck inside code fences is
      // mostly noise. Toggling per-line is impractical with contenteditable's
      // spellcheck attribute — accept the trade-off and document it.
    }
    update(u) { /* no-op; readonly per mount */ }
  })
}
```

Reconfigure via `spellCompartment.reconfigure(spellCheckPlugin(enabled))`.

## Context menu

```ts
function onContextMenu(e: MouseEvent) {
  if (e.shiftKey) return  // let native menu show
  e.preventDefault()
  e.stopPropagation()
  // … existing custom menu logic
}
```

## Edge cases

1. **Code blocks.** WebView2 doesn't know about Markdown structure; it
   spellchecks identifiers as plain words. Suppress via a CodeMirror
   decoration that sets `spellcheck="false"` on `<pre>`s? Not feasible
   — CodeMirror's rendered lines aren't real `<pre>` elements.
   Document this as a known limitation; users who want pristine code
   blocks can leave spell-check off.
2. **Performance.** Trivial. Chromium throttles spell-check on long
   docs.
3. **Language.** Determined by `navigator.language`. Users on
   non-English systems get their native dictionary automatically.
4. **Custom dictionaries.** Out of scope — managed by the OS / browser.

## Test plan

- Toggle setting on → squigglies appear under misspelled words.
- Shift-right-click on a misspelled word → native menu with
  suggestions; click one → word replaced.
- Plain right-click → our custom menu shows; spell suggestions hidden
  (trade-off).
- Toggle off → squigglies disappear immediately.
- OS language switched (`navigator.language` change) → next launch
  picks up the new dictionary.
