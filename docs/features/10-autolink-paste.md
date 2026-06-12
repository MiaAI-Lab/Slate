# 10. Auto-link on paste

**Goal.** Paste a URL while text is selected → wraps the selection as
`[selection](pasted-url)`. No selection → unchanged plain paste.

## Trigger

Default `Ctrl+V` only. Trying to gate `Ctrl+Shift+V` on this would
collide with feature 05 (smart paste). Plain paste with a non-empty
selection that happens to be a URL → behave as today.

## Files to add

- (none — folds into smart-paste utility OR a standalone helper)

## Files to edit

- `src/lib/editor/createEditor.ts` — extend the existing
  `EditorView.domEventHandlers` (introduced for image paste in feature
  01; if both ship, share the handler) with a paste case for URL +
  selection.

Cleanest approach: install a single `domEventHandlers.paste` that
dispatches in this priority:

1. Image data → handled by feature 01.
2. Text data + non-empty editor selection + text looks like a URL →
   handled here.
3. Else → return `false`, let CodeMirror paste normally.

## Implementation

```ts
// inside buildExtensions, alongside the image-paste handler
const URL_RE = /^(https?:\/\/[^\s)]+|mailto:[^\s)]+)$/i

EditorView.domEventHandlers({
  paste(e, view) {
    const dt = e.clipboardData
    if (!dt) return false

    // (image-paste branch — see feature 01)

    const text = dt.getData('text/plain').trim()
    if (!text || !URL_RE.test(text)) return false

    const sel = view.state.selection.main
    if (sel.empty) return false  // fall through to plain paste

    const selText = view.state.doc.sliceString(sel.from, sel.to)
    // If the selection itself is also a URL, paste plain — replacing one
    // URL with [url1](url2) is almost never what the user wants.
    if (URL_RE.test(selText.trim())) return false

    e.preventDefault()
    const insert = `[${selText}](${text})`
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + insert.length },
      userEvent: 'input.paste',
    })
    return true
  },
})
```

## Edge cases

1. **URL with parens.** Closing-paren-aware: `URL_RE`'s
   `[^\s)]+` stops at `)`. Trade-off: a URL like
   `https://en.wikipedia.org/wiki/Foo_(bar)` will be truncated. That's
   acceptable for the common case; the user can manually fix the rare
   case.
2. **Multi-cursor selection.** Skip and fall through — don't try to
   wrap each range; the clipboard has one URL, semantics are unclear.
   Detect with `state.selection.ranges.length > 1`.
3. **Pasted text contains a URL plus prose.** `URL_RE` enforces the
   entire trimmed string is a single URL — prose-pasting is unaffected.
4. **Markdown links pasted over text.** If the user copied
   `[foo](bar)` and selects nothing, fall through. If they have a
   selection, the test fails because the pasted text isn't just a URL —
   fall through.
5. **Editor right-click → Paste menu item.** Goes through
   `navigator.clipboard.readText` then `view.dispatch`, bypassing the
   DOM paste event. Add the same wrap-logic to `ctxPaste` in
   `Editor.svelte:241-254`.

## Test plan

- Select "OpenAI", paste `https://openai.com/` → becomes
  `[OpenAI](https://openai.com/)`.
- Select nothing, paste a URL → URL inserted as-is.
- Select a URL, paste another URL → falls through to plain paste.
- Paste plain text "hello" over a selection → unchanged.
- Multi-cursor with one URL in clipboard → unchanged.
