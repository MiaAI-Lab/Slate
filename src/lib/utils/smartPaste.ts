import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import type { EditorView } from '@codemirror/view'

let _td: TurndownService | null = null

function td(): TurndownService {
  if (_td) return _td
  _td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    fence: '```',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })
  _td.use(gfm)
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
