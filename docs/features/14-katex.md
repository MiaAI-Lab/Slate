# 14. KaTeX math

**Goal.** Render `$inline$` and `$$display$$` math blocks in the
preview using KaTeX.

This is `PLAN.md` § 11.1; the plan below is the operational version.

## Dependency

```bash
pnpm add katex
```

KaTeX is ~270KB compressed; ships its own CSS (`katex/dist/katex.min.css`).
No types package needed.

## Files to edit

- `src/lib/renderer/render.ts` — register a `marked` extension that
  emits KaTeX output before sanitization.
- `src/app.css` — `@import 'katex/dist/katex.min.css';` at the top.
- `src/lib/utils/exportHtml.ts` — inline KaTeX CSS into exports.

## Math extension

Use a custom `marked` extension rather than a plugin package — math
parsing is small and a third-party plugin pulls in surprising
dependencies.

```ts
// src/lib/renderer/render.ts
import katex from 'katex'

const INLINE_RE = /\$([^$\n]+?)\$/
const BLOCK_RE  = /\$\$([\s\S]+?)\$\$/

marked.use({
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(src) { return src.indexOf('$$') },
      tokenizer(src) {
        const m = /^\$\$([\s\S]+?)\$\$\s*(?:\n|$)/.exec(src)
        if (!m) return undefined
        return { type: 'mathBlock', raw: m[0], text: m[1] }
      },
      renderer(token) {
        try { return katex.renderToString(token.text, { displayMode: true, throwOnError: false }) }
        catch { return `<pre class="math-error">${escapeHtml(token.text)}</pre>` }
      },
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(src) { return src.indexOf('$') },
      tokenizer(src) {
        const m = /^\$([^$\n]+?)\$/.exec(src)
        if (!m) return undefined
        return { type: 'mathInline', raw: m[0], text: m[1] }
      },
      renderer(token) {
        try { return katex.renderToString(token.text, { displayMode: false, throwOnError: false }) }
        catch { return `<code>${escapeHtml(token.text)}</code>` }
      },
    },
  ],
})
```

Order matters: block-level extension must precede inline so `$$…$$`
isn't eaten by the inline matcher.

## DOMPurify allowance

KaTeX emits `<span class="katex">…<math>…</math>…</span>`. DOMPurify
sanitizes by default; allow KaTeX's MathML / SVG tags:

```ts
DOMPurify.sanitize(raw, {
  ADD_ATTR: ['target'],
  ADD_TAGS: ['math','mrow','mi','mn','mo','msup','msub','mfrac','mtext','mspace','annotation','semantics'],
  ADD_ATTR: ['target','xmlns','encoding'],
})
```

Don't go down the path of allowing arbitrary SVG; KaTeX uses HTML+CSS by
default. Confirm `katex.renderToString({ output: 'html' })` if MathML
output causes sanitizer drops.

## Export inlining

`src/lib/utils/exportHtml.ts` embeds `app.css` already (per code review
`docs/code-review-14-05-2026.md:114-115`). With the KaTeX import added
to `app.css`, the export carries it for free — but the file gets ~250KB
larger. Acceptable for "self-contained HTML".

## Edge cases

1. **`$` used as currency.** `Cost is $5 and $10` would match
   `$5 and $10` as inline math. Mitigate by requiring no whitespace
   right after the opening `$` and no whitespace right before the
   closing `$` — `/\$\S([^$\n]*?\S)?\$/`. Document the trade-off.
2. **Math inside code fences.** Block-level extension runs before code
   block parsing? marked tries extensions before built-in rules. Test:
   ``` ```\n$$x$$\n``` ``` must remain literal. If broken, restrict
   the math extension's `start` to bail when inside a code context — or
   move math to a `marked.tokenizer` override on `text`.
3. **Performance on big docs.** KaTeX rendering is fast (~1ms per
   inline expression) but `renderToString` is sync. Big docs with many
   formulas can stutter the preview; deferred to the worker-based
   render path mentioned in `PLAN.md` § 12.3.
4. **Errors.** `throwOnError: false` makes KaTeX emit a red-colored
   string with the LaTeX source — preferable to a thrown exception
   breaking the preview.

## Test plan

- `$E = mc^2$` inline → renders.
- `$$\\int_0^\\infty e^{-x} dx$$` block → centered display block.
- `Cost is $5 and $10` → not eaten (with the no-whitespace-anchor
  variant of the regex).
- Inside ``` ``` ``` → literal.
- Export HTML → math renders without internet (CSS embedded).
- Print/PDF → math renders.
