# 16. Copy as Rich-Text / HTML

**Goal.** Copy the rendered version of the current selection (or the
whole doc) as `text/html` to the clipboard so the user can paste it
into Word, Gmail, Outlook, Notion as styled content.

## UX

Two new entries:

- **Editor right-click menu** — "Copy as Rich Text" (disabled if no
  selection). Renders only the selected source through `marked`.
- **Edit / Export menu** — "Copy as Rich Text (whole document)".
  Renders the entire doc.

Keyboard: optional, no obvious shortcut available — skip.

## Files to add

- `src/lib/utils/copyRichText.ts`

## Files to edit

- `src/lib/components/Editor.svelte` — add a context-menu entry under
  Copy.
- `src/lib/components/Toolbar.svelte` — add an entry under the Export
  menu (after "Print").

## Helper

```ts
// src/lib/utils/copyRichText.ts
import { renderMarkdown } from '$lib/renderer/render'

export async function copyMarkdownAsHtml(md: string): Promise<void> {
  const html = renderMarkdown(md)
  // Some target apps prefer plain-text fallback. Provide both.
  const blobHtml = new Blob([html], { type: 'text/html' })
  const blobText = new Blob([md], { type: 'text/plain' })
  // The async Clipboard API: write multiple representations atomically.
  await navigator.clipboard.write([
    new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText }),
  ])
}
```

`ClipboardItem` is widely supported on Chromium (WebView2 included).

## Wiring — Editor.svelte

Add after the existing `ctxCopy`:

```ts
async function ctxCopyAsRichText() {
  if (!view) return closeCtxMenu()
  const sel = view.state.selection.main
  if (sel.empty) return closeCtxMenu()
  const md = view.state.doc.sliceString(sel.from, sel.to)
  const { copyMarkdownAsHtml } = await import('$lib/utils/copyRichText')
  try { await copyMarkdownAsHtml(md); toast.success('Copied as rich text') }
  catch (e) { toast.error('Copy failed', String(e)) }
  closeCtxMenu()
  view.focus()
}
```

Add row in the context menu after Copy:

```svelte
<button class="ctx-item" role="menuitem" onclick={ctxCopyAsRichText} disabled={!ctxMenu.hasSelection}>
  <span>Copy as Rich Text</span>
</button>
```

## Wiring — Toolbar Export menu

```svelte
<button class="menu-item" role="menuitem" onclick={doCopyRichText}>
  <span>Copy as Rich Text (whole doc)</span>
</button>
```

```ts
async function doCopyRichText() {
  exportOpen = false
  const tab = tabsState.activeTab
  if (!tab) return
  const { copyMarkdownAsHtml } = await import('$lib/utils/copyRichText')
  try { await copyMarkdownAsHtml(tab.content); toast.success('Copied as rich text') }
  catch (e) { toast.error('Copy failed', String(e)) }
}
```

## Styling

Word / Gmail honor inline styles but ignore most class-based CSS.
`renderMarkdown` already returns class-styled HTML (`hljs` for code,
`prose` parent in Preview only). For the clipboard payload, consider
inlining a tiny stylesheet via `<style>` *inside* the copied HTML —
`marked` doesn't do that automatically.

The pragmatic v1: emit the HTML as-is; tables and lists come through
fine. Bold / italic / code spans get inline-respected by the renderer
in the target app. Skip the inline-CSS pass; revisit if users complain.

## Edge cases

1. **Permission.** Clipboard write requires a user gesture. Both
   triggers are gestures — fine.
2. **Empty selection in editor.** Menu item disabled.
3. **Selection contains an unfinished code fence.** `renderMarkdown`
   still emits something — usually a `<pre>` containing the fragment.
   Acceptable.
4. **Privacy.** The clipboard payload includes the rendered HTML; if
   the doc has frontmatter (after feature 09), it's already stripped by
   the renderer.
5. **No HTML clipboard receiver** (e.g. paste into Notepad). The
   `text/plain` fallback lands the source markdown — usable.

## Test plan

- Select `## Hello\n- a\n- b`, "Copy as Rich Text". Paste into Gmail →
  heading + bullets render styled.
- Paste into Notepad → plain markdown text appears.
- Empty selection → menu item disabled.
- Whole-doc copy from Export menu → entire doc rendered.
- Copy code blocks → highlight.js classes don't help in Gmail but the
  monospace + indentation survives.
