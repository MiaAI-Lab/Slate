import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view'

export const setSearchHighlight = StateEffect.define<{
  matches: { from: number; to: number }[]
  currentIdx: number
}>()

function buildHighlights(
  matches: { from: number; to: number }[],
  currentIdx: number,
  docLen: number,
): DecorationSet {
  if (!matches.length) return Decoration.none
  // RangeSetBuilder requires ranges in non-decreasing from order. We pair each
  // match with its original index so the sort doesn't lose the "is this the
  // current match?" information. Using indexOf inside the loop was O(n²) and
  // ran on every keystroke for large docs.
  const indexed = matches.map((m, i) => ({ from: m.from, to: m.to, origIdx: i }))
  indexed.sort((a, b) => a.from - b.from)
  const builder = new RangeSetBuilder<Decoration>()
  for (let i = 0; i < indexed.length; i++) {
    const m = indexed[i]
    if (m.from >= docLen) continue
    const to = Math.min(m.to, docLen)
    if (m.from >= to) continue
    builder.add(m.from, to, Decoration.mark({
      class: m.origIdx === currentIdx ? 'cm-search-current' : 'cm-search-match',
    }))
  }
  return builder.finish()
}

export const searchHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setSearchHighlight)) {
        return buildHighlights(e.value.matches, e.value.currentIdx, tr.state.doc.length)
      }
    }
    return decos
  },
  provide: f => EditorView.decorations.from(f),
})
