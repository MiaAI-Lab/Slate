# 05. Smart paste: HTML/RTF → Markdown

**Goal.** Convert HTML in the clipboard to clean Markdown before insert.
Triggered by:

- **Keyboard.** `Ctrl+Shift+V` always pastes-as-markdown when HTML
  is present (regardless of any global setting).
- **Right-click → "Paste as Markdown".** New entry in the editor's
  context menu (`src/lib/components/Editor.svelte:289-311`).
- **(Optional later) Auto.** Make plain `Ctrl+V` smart if a setting is on
  — out of scope for v1; the explicit gesture is enough and avoids
  surprise.

## Dependency

```bash
pnpm add turndown turndown-plugin-gfm
```

`turndown` ships its own types. `turndown-plugin-gfm` adds GitHub
tables, strikethrough, and task lists — match how the renderer is set
up (`marked` with `gfm: true`).

## Files to add

- `src/lib/utils/smartPaste.ts` — Turndown configuration + the conversion
  helper.

## Files to edit

- `src/lib/components/Editor.svelte`
  - Add a new context-menu row (between Paste and Select All).
  - Add a CodeMirror keybinding for `Ctrl+Shift+V` via
    `markdownShortcuts()` OR a new dedicated key in `createEditor.ts`.
    Adding it to `markdownShortcuts` is cleanest — that file already
    holds editor-specific bindings.
- `src/lib/editor/markdownKeymap.ts` — export a new shortcut.

## Turndown setup

```ts
// src/lib/utils/smartPaste.ts
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import type { EditorView } from '@codemirror/view'

let _td: TurndownService | null = null

function td(): TurndownService {
  if (_td) return _td
  _td = new TurndownService({
    headingStyle: 'atx',         // `## h` not setext
    codeBlockStyle: 'fenced',
    fence: '```',
    bulletListMarker: '-',
    emDelimiter: '_',            // matches markdownKeymap's `_italic_`
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  _td.use(gfm)
  // Strip Office/Google noise: <o:p>, mso-* spans, font tags.
  _td.remove(['style', 'script'])
  _td.addRule('strip-noise', {
    filter: (node) => /^(o:p|w:|m:)/i.test(node.nodeName) || node.nodeName === 'FONT',
    replacement: (content) => content,
  })
  return _td
}

export function htmlToMarkdown(html: string): string {
  return td().turndown(html).trim() + '\n'
}

export async function pasteAsMarkdown(view: EditorView): Promise<boolean> {
  // navigator.clipboard.read() returns ClipboardItems; pick the first item
  // and prefer text/html, fall back to text/plain.
  let html: string | null = null
  let plain: string | null = null
  try {
    const items = await navigator.clipboard.read()
    for (const it of items) {
      if (it.types.includes('text/html') && !html) {
        const blob = await it.getType('text/html')
        html = await blob.text()
      }
      if (it.types.includes('text/plain') && !plain) {
        const blob = await it.getType('text/plain')
        plain = await blob.text()
      }
    }
  } catch {
    try { plain = await navigator.clipboard.readText() } catch {}
  }
  const text = html ? htmlToMarkdown(html) : plain
  if (!text) return false
  const sel = view.state.selection.main
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
    userEvent: 'input.paste',
  })
  return true
}
```

## CodeMirror keybinding

```ts
// src/lib/editor/markdownKeymap.ts — add to the returned array
{ key: 'Ctrl-Shift-v', mac: 'Mod-Shift-v',
  run: v => { import('$lib/utils/smartPaste').then(m => m.pasteAsMarkdown(v)); return true } },
```

The dynamic `import()` keeps Turndown out of the initial bundle. First
paste-as-markdown trips a ~30KB chunk load; acceptable.

## Context menu entry

In `Editor.svelte`, near `ctxPaste`:

```ts
async function ctxPasteAsMarkdown() {
  if (!view) return closeCtxMenu()
  const { pasteAsMarkdown } = await import('$lib/utils/smartPaste')
  await pasteAsMarkdown(view)
  closeCtxMenu()
  view.focus()
}
```

And add the menu row after the existing Paste row (line ~304):

```svelte
<button class="ctx-item" role="menuitem" onclick={ctxPasteAsMarkdown}>
  <span>Paste as Markdown</span><span class="ctx-kbd">Ctrl+Shift+V</span>
</button>
```

## Edge cases

1. **Clipboard has only `text/plain`.** Fall through and paste plain.
   This is the right behavior — converting plain text via Turndown is a
   no-op and a wasted import.
2. **Permission denied** (`navigator.clipboard.read` requires a user
   gesture in some contexts). Both triggers (kbd + ctxmenu) are user
   gestures so we're fine; if the read still fails, toast and abort.
3. **Office-paste noise.** The two `addRule`/`remove` calls strip the
   worst offenders. Acceptable not to chase every `mso-*` attribute.
4. **Tables.** GFM plugin handles them. Office "Word" tables sometimes
   render as nested tables — Turndown collapses them, you get one
   markdown table. Good enough.
5. **Conflict with global Ctrl+Shift+V.** Windows itself doesn't claim
   this binding inside an app; safe.

## Test plan

- Copy a section of `https://www.markdownguide.org/cheat-sheet/` from
  Chrome → `Ctrl+Shift+V` in an empty doc → preview renders the same
  structure (headings, code blocks, lists, tables).
- Copy from Word → tables and bold/italic survive; font tags drop.
- Copy plain text from Notepad → `Ctrl+Shift+V` falls through to plain
  insert.
- Right-click in editor → "Paste as Markdown" present; disabled state
  not required (plain-text fallback handles empty-html case).
- Regular `Ctrl+V` still pastes as plain — unchanged.
