# 09. Frontmatter syntax highlighting

**Goal.** When a doc opens with `---\n…\n---` (YAML) or `+++\n…\n+++`
(TOML) on the very first line, color the block as YAML/TOML inside the
editor, and either hide it from preview or render it as a styled
metadata block.

## Scope

- **Editor.** Distinct styling (muted color + light background tint).
- **Preview.** By default, **suppress** the block from rendered output.
  This matches Jekyll / Hugo / Astro behavior. Future: render as a
  toggleable card.

## Files to edit

- `src/lib/editor/createEditor.ts` — extend the markdown language with
  a frontmatter parser.
- `src/lib/renderer/render.ts` — strip frontmatter before
  `marked.parse`.

## Editor: nested language

`@codemirror/lang-markdown` accepts `extensions` and `codeLanguages`;
for top-of-file frontmatter, the trick is a small parser extension
that recognizes the fence and switches into the YAML/TOML language.

Both languages need adding:

```bash
pnpm add @codemirror/lang-yaml
# TOML: there's no first-party lang. Use @ddietr/codemirror-themes? No —
# simpler: highlight TOML as plain text with a frontmatter background tint.
```

Drop TOML language support; render the block in a dimmed-background
style without inner syntax coloring. YAML is 95% of frontmatter in the
wild.

```ts
// createEditor.ts — inside buildExtensions
import { yaml } from '@codemirror/lang-yaml'
import { Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const frontmatterTheme = EditorView.baseTheme({
  '.cm-frontmatter': { backgroundColor: 'var(--bg-elev-2, rgba(0,0,0,0.04))' },
  '.cm-frontmatter-fence': { color: 'var(--fg-muted)' },
})

const frontmatterDeco = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged) this.decorations = this.build(u.view) }
  build(view: EditorView): DecorationSet {
    const doc = view.state.doc
    if (doc.lines < 2) return Decoration.none
    const first = doc.line(1).text
    const fence = first === '---' ? '---' : (first === '+++' ? '+++' : null)
    if (!fence) return Decoration.none
    let endLine = -1
    for (let i = 2; i <= doc.lines; i++) {
      if (doc.line(i).text === fence) { endLine = i; break }
    }
    if (endLine < 0) return Decoration.none
    const from = doc.line(1).from, to = doc.line(endLine).to
    return Decoration.set([
      Decoration.line({ class: 'cm-frontmatter-fence' }).range(doc.line(1).from),
      Decoration.line({ class: 'cm-frontmatter-fence' }).range(doc.line(endLine).from),
      Decoration.mark({ class: 'cm-frontmatter' }).range(from, to),
    ])
  }
}, { decorations: v => v.decorations })

// in buildExtensions array, append:
frontmatterTheme,
frontmatterDeco,
```

The proper-syntax approach (using `markdown`'s `extensions` API to nest
a YAML parser) is the "correct" way but adds 30+ lines of parser
plumbing. The decoration-only approach above gets you the visual win
with zero parser work.

If you want real YAML highlighting *inside* the block, swap the mark
decoration for a nested-parser extension via
`@lezer/markdown`'s `parseBlock` API — defer to v2.

## Preview: strip the block

```ts
// src/lib/renderer/render.ts
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?|^\+\+\+\n[\s\S]*?\n\+\+\+\n?/

export function renderMarkdown(md: string): string {
  const stripped = md.replace(FRONTMATTER_RE, '')
  const raw = marked.parse(stripped) as string
  return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] })
}
```

Single regex strip, anchored at start. No need to parse YAML — the
fence is unambiguous when it appears as the first non-empty content.

## Edge cases

1. **Body starts with `---`** that's actually a thematic break, not
   frontmatter. The closing `---` requirement protects this — if there
   isn't a matching closer near the top, the block isn't a frontmatter
   block and the decoration plugin no-ops.
2. **Whitespace before the opening fence.** Reject. Frontmatter must
   start at byte 0.
3. **Trailing newline after closing `---`.** Optional in the regex.
4. **Saving a file via Export to HTML.** The exporter calls
   `renderMarkdown` (transitively); frontmatter is already stripped.
   Good.
5. **Editing the fence mid-block.** `update.docChanged` triggers a
   rebuild — cheap, plain text scan.

## Test plan

- Open a Jekyll post (`---\ntitle: x\n---\nbody`). Editor: top block is
  dimmed; preview: body only.
- Type a closing `---` to introduce frontmatter on an existing doc →
  decoration appears.
- Delete the closer → decoration disappears, preview shows everything.
- TOML `+++` fence styled (no inner highlighting, but background tint).
- `---` thematic break in the middle of the doc → untouched.
