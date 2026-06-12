import type { KeyBinding } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'

function wrap(view: EditorView, before: string, after = before): boolean {
  const { state } = view
  const changes = state.changeByRange(range => ({
    changes: [
      { from: range.from, insert: before },
      { from: range.to, insert: after },
    ],
    range: range.empty
      ? range.map(state.changes({ from: range.from, insert: before }))
      : range,
  }))
  view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

function insertLink(view: EditorView): boolean {
  const { state } = view
  const { from, to } = state.selection.main
  const sel = state.sliceDoc(from, to) || 'text'
  view.dispatch(state.update({
    changes: { from, to, insert: `[${sel}](url)` },
    selection: { anchor: from + sel.length + 3, head: from + sel.length + 6 },
  }))
  return true
}

export function markdownShortcuts(): KeyBinding[] {
  return [
    { key: 'Ctrl-b', mac: 'Mod-b', run: v => wrap(v, '**') },
    { key: 'Ctrl-i', mac: 'Mod-i', run: v => wrap(v, '_') },
    { key: 'Ctrl-`', mac: 'Mod-`', run: v => wrap(v, '`') },
    { key: 'Ctrl-k', mac: 'Mod-k', run: insertLink },
    { key: 'Ctrl-Shift-v', mac: 'Mod-Shift-v',
      run: v => { import('$lib/utils/smartPaste').then(m => m.pasteAsMarkdown(v)); return true } },
  ]
}
