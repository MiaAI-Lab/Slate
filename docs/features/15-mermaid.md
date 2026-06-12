# 15. Mermaid diagrams

**Goal.** Render `mermaid` code fences as diagrams in the preview.

This is `PLAN.md` § 11.2; below is the operational version.

## Dependency

```bash
pnpm add mermaid
```

~2MB. Lazy-import inside the Preview component so initial load isn't
penalized for users who never write a diagram.

## Files to edit

- `src/lib/renderer/render.ts` — leave the code fence alone (so
  DOMPurify keeps `<pre><code class="hljs language-mermaid">…</code></pre>`),
  but optionally skip highlight.js for the `mermaid` language.
- `src/lib/components/Preview.svelte` — after the `{@html html}` is in
  the DOM, find `pre > code.language-mermaid`, replace each `<pre>`
  with a `<div class="mermaid">` containing the source text, then call
  `mermaid.run({ nodes: divs })`.

## Skip highlight for mermaid

```ts
// src/lib/renderer/render.ts — modify the existing markedHighlight
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    if (lang === 'mermaid') return code   // pass through unchanged
    const language = hljs.getLanguage(lang) ? lang : 'plaintext'
    return hljs.highlight(code, { language }).value
  },
}))
```

Otherwise highlight.js will splice `<span>`s into the mermaid source
and break the diagram.

## Preview.svelte render

```svelte
<script lang="ts">
  import { renderMarkdown } from '$lib/renderer/render'
  import { previewState } from '$lib/state/preview.svelte'
  import { settingsState, resolvedDark } from '$lib/state/settings.svelte'

  let articleEl = $state<HTMLElement | undefined>()
  const html = $derived(renderMarkdown(previewState.content))

  $effect(() => {
    // Touch `html` so the effect re-runs after re-render.
    void html
    if (!articleEl) return
    const codes = articleEl.querySelectorAll('pre > code.language-mermaid')
    if (codes.length === 0) return
    const divs: HTMLElement[] = []
    codes.forEach((code) => {
      const div = document.createElement('div')
      div.className = 'mermaid'
      div.textContent = code.textContent ?? ''
      code.parentElement!.replaceWith(div)
      divs.push(div)
    })
    ;(async () => {
      const { default: mermaid } = await import('mermaid')
      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedDark(settingsState.values.theme) ? 'dark' : 'default',
        securityLevel: 'strict',  // disallow inline JS in diagrams
      })
      await mermaid.run({ nodes: divs })
    })().catch(err => console.error('Mermaid render failed', err))
  })
</script>

<div class="h-full overflow-auto" onwheel={onWheel}>
  <article bind:this={articleEl} class="prose dark:prose-invert mx-auto px-8 py-8" …>
    {@html html}
  </article>
</div>
```

`securityLevel: 'strict'` is important — without it, mermaid can
execute arbitrary HTML in node labels. The strict level renders text
nodes as plain strings.

## Theme reactivity

Re-running `mermaid.initialize` with a different theme requires
re-running the diagram. The current effect re-runs on every preview
render (debounced ~150ms), so theme changes hit it on the next
keystroke. To re-render *immediately* on theme toggle, add an
`$effect` that reads `settingsState.values.theme` and re-runs the
mermaid pass against the existing DOM.

## Export HTML

`exportHtml.ts` emits sanitized HTML and inlines CSS. To include
mermaid in exports:

- **Option A (cheap):** in the export pipeline, run mermaid against a
  detached DOM via `jsdom`-style (Tauri-side) — out of scope for v1.
- **Option B (recommended):** export shows `mermaid` blocks as raw
  code (the unrendered fence). Good enough; the user printed the doc
  for offline reading, not interactive diagrams.

Document this trade-off in the Export menu tooltip if you ship the
feature.

## Error handling

If `mermaid.run` rejects (syntax error), the div is filled with an
error message by mermaid itself. No further work needed; we only catch
to keep the console clean.

## Edge cases

1. **Multiple mermaid blocks per document.** The effect picks all up
   in one pass.
2. **Re-render on edit.** Each re-render replaces all `<pre>` with new
   `<div>`s; previous `<div>`s are discarded. No leak — the GC cleans
   the orphans.
3. **`marked-highlight` calling `hljs.highlight('mermaid', …)`.** The
   pass-through fix above prevents corruption.
4. **DOMPurify class allowlist.** `class` is in default ALLOWED_ATTR
   for `<code>`; survives.
5. **Bundle size.** Mermaid is lazy-imported on first render that
   contains a mermaid block. Initial load stays fast.

## Test plan

- ` ```mermaid\ngraph TD; A-->B\n``` ` → renders.
- Wrap inside a list / blockquote → still renders.
- Type a syntax error → block shows mermaid's red error block.
- Toggle dark/light theme → next preview re-render uses correct
  theme.
- Export HTML → mermaid block appears as raw code (documented).
