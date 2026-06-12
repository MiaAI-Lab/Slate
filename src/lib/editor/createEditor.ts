import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from '@codemirror/view'
import { EditorState, Annotation, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, LanguageDescription } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { openSearchPanel, gotoLine } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { githubLightInit } from '@uiw/codemirror-theme-github'
import { markdownShortcuts } from './markdownKeymap'
import { themeCompartment, wrapCompartment, fontCompartment, keymapCompartment, tableCompartment, langCompartment } from './compartments'
import { buildTableExt } from './tableExtension'
import { searchHighlightField } from './searchHighlight'
import { cursorState } from '$lib/state/cursor.svelte'
import { splitScroll } from '$lib/state/splitScroll.svelte'

export const SyncFromStore = Annotation.define<boolean>()

// Light-theme markdown overrides. githubLight's defaults map heading/strong/
// emphasis all to the foreground color, so markdown elements only get
// bold/italic with no visible hue change. Appending these styles inside
// githubLightInit folds them into the SAME HighlightStyle as the github
// rules — for tags we re-declare (heading/strong/emphasis) the later entry
// overwrites github's class in the tag→class map; for new tags
// (heading1-6, monospace, quote, list, etc.) the lookup's tag.set walk
// finds the more specific match first and breaks. Doing this in one style
// avoids the dual-HighlightStyle CSS-cascade race that left colors flat.
// Catppuccin Latte palette — soft pastel pop on a light background.
const markdownLightStyles = [
  { tag: t.heading1, color: '#8839ef', fontWeight: 'bold' },
  { tag: t.heading2, color: '#1e66f5', fontWeight: 'bold' },
  { tag: t.heading3, color: '#179299', fontWeight: 'bold' },
  { tag: t.heading4, color: '#40a02b', fontWeight: 'bold' },
  { tag: [t.heading5, t.heading6], color: '#fe640b', fontWeight: 'bold' },
  { tag: t.strong, color: '#4c4f69', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#4c4f69', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#9ca0b0', textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: '#1e66f5', textDecoration: 'underline' },
  // Inline code AND indented/fenced code body share t.monospace — keep them
  // foreground so multi-line code blocks don't flood the editor with a single
  // color. The editor's monospace font + active-line bg are enough cue.
  { tag: t.quote, color: '#6c6f85', fontStyle: 'italic' },
  { tag: t.list, color: '#df8e1d' },
  { tag: t.contentSeparator, color: '#9ca0b0' },
  { tag: t.processingInstruction, color: '#9ca0b0' },
  { tag: t.labelName, color: '#8839ef' },
]

const githubLightWithMarkdown = githubLightInit({ styles: markdownLightStyles })

export function buildThemeExt(dark: boolean): Extension {
  return dark
    ? [oneDark]
    : [
        githubLightWithMarkdown,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      ]
}

export function buildFontExt(sizePx: number, lineHeight: number, textColor: string): Extension {
  return EditorView.theme({
    '&': { height: '100%' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'var(--font-editor)',
      fontSize: `${sizePx}px`,
      lineHeight: String(lineHeight),
    },
    ...(textColor ? { '.cm-content': { color: textColor } } : {}),
  })
}

export interface EditorOpts {
  doc: string
  /** Path of the file backing this view. Used to seed the language compartment
   *  synchronously at mount so a freshly-restored markdown tab doesn't render
   *  with an empty syntax tree before the async language effect arrives —
   *  that race left the document in a partial-parse state until the user
   *  switched tabs and came back. */
  path: string | null
  dark: boolean
  fontSize: number
  lineHeight: number
  lineWrap: boolean
  editorTextColor: string
  onChange: (doc: string) => void
}

export function buildExtensions(opts: EditorOpts): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    bracketMatching(),
    langCompartment.of(initialLanguageExt(opts.path)),
    // tableCompartment precedes keymapCompartment so its Tab/Enter handlers
    // run before `indentWithTab` and the default Enter binding. The handlers
    // return false outside tables, which falls through to the next keymap.
    tableCompartment.of(buildTableExt()),
    keymapCompartment.of(keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      ...markdownShortcuts(),
    ])),
    themeCompartment.of(buildThemeExt(opts.dark)),
    wrapCompartment.of(opts.lineWrap ? EditorView.lineWrapping : []),
    fontCompartment.of(buildFontExt(opts.fontSize, opts.lineHeight, opts.editorTextColor)),
    searchHighlightField,
    EditorView.updateListener.of(update => {
      if (update.transactions.some(tr => tr.annotation(SyncFromStore))) return
      if (update.docChanged) opts.onChange(update.state.doc.toString())
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head
        const line = update.state.doc.lineAt(pos)
        cursorState.line = line.number
        cursorState.col = pos - line.from + 1
      }
    }),
    EditorView.updateListener.of(update => {
      if (!update.geometryChanged && !update.viewportChanged) return
      const { top } = update.view.scrollDOM.getBoundingClientRect()
      const pos = update.view.posAtCoords({ x: 0, y: top + 1 })
      if (pos == null) return
      const line = update.state.doc.lineAt(pos).number
      if (line !== splitScroll.editorTopLine) splitScroll.editorTopLine = line
    }),
    // Constrain selection highlights and active-line highlight to the content
    // area so they don't bleed into the line-number gutter.
    EditorView.updateListener.of(update => {
      const content = update.view.scrollDOM.querySelector('.cm-content') as HTMLElement | null
      const layer = update.view.scrollDOM.querySelector('.cm-selectionLayer') as HTMLElement | null
      if (!content || !layer) return
      const contentLeft = content.offsetLeft
      const contentRight = contentLeft + content.offsetWidth
      const hasSelection = !update.state.selection.main.empty

      // Clip the selection layer to the content area so selection backgrounds
      // don't bleed into the gutter.
      layer.style.clipPath = contentLeft > 0
        ? `inset(0 0 0 ${contentLeft}px)`
        : 'none'

      // Hide active-line backgrounds during selection so they don't visually
      // compete with the selection highlight (they span the full row width).
      update.view.scrollDOM.querySelectorAll('.cm-activeLine, .cm-activeLineGutter').forEach((el: Element) => {
        const h = el as HTMLElement
        h.style.setProperty('background', hasSelection ? 'transparent' : '', 'important')
      })
    }),
  ]
}

export function buildState(opts: EditorOpts): EditorState {
  return EditorState.create({ doc: opts.doc, extensions: buildExtensions(opts) })
}

export function createEditor(parent: HTMLElement, opts: EditorOpts): EditorView {
  return new EditorView({ state: buildState(opts), parent })
}

const MD_EXT = new Set(['md', 'markdown', 'mdx'])
const PLAIN_EXT = new Set(['txt', 'log'])

// Extensions absent from @codemirror/language-data; mapped to the closest
// available language name in that registry.
const EXT_FALLBACK: Record<string, string> = {
  bat: 'Shell', cmd: 'Shell',
  env: 'Shell', sh: 'Shell', bash: 'Shell', ksh: 'Shell', zsh: 'Shell',
  svelte: 'HTML',
  ini: 'TOML', cfg: 'TOML',
}

/** Sync subset of buildLanguageExt — covers the cases where the answer is
 *  immediately available (markdown, plaintext, untitled). For everything else
 *  (Python, Rust, .bat, etc.) we still need the async loader. Used to seed the
 *  initial state so the first paint isn't unstyled. */
export function initialLanguageExt(path: string | null): Extension {
  const m = path && /\.([^./\\]+)$/.exec(path)
  const ext = m ? m[1].toLowerCase() : null
  if (PLAIN_EXT.has(ext ?? '')) return []
  if (!ext || MD_EXT.has(ext)) return markdown({ base: markdownLanguage, codeLanguages: languages })
  return []
}

/** Whether initialLanguageExt's answer is final for this path. When false, the
 *  caller must let the async buildLanguageExt fill in the actual language —
 *  otherwise non-markdown files (Python, Rust, .bat, …) render unstyled. */
export function isLanguageSyncResolved(path: string | null): boolean {
  const m = path && /\.([^./\\]+)$/.exec(path)
  const ext = m ? m[1].toLowerCase() : null
  if (PLAIN_EXT.has(ext ?? '')) return true
  if (!ext || MD_EXT.has(ext)) return true
  return false
}

export async function buildLanguageExt(path: string | null): Promise<Extension> {
  const m = path && /\.([^./\\]+)$/.exec(path)
  const ext = m ? m[1].toLowerCase() : null

  if (PLAIN_EXT.has(ext ?? '')) return []
  if (!ext || MD_EXT.has(ext)) return markdown({ base: markdownLanguage, codeLanguages: languages })

  const filename = path!
  let desc = LanguageDescription.matchFilename(languages, filename)
  if (!desc && ext) {
    const fallbackName = EXT_FALLBACK[ext]
    if (fallbackName) desc = languages.find(l => l.name === fallbackName) ?? null
  }
  if (!desc) return []
  const lang = await desc.load()
  return lang.extension
}

export { openSearchPanel, gotoLine }
