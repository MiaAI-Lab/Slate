import type { EditorView, KeyBinding } from '@codemirror/view'
import { keymap } from '@codemirror/view'
import type { EditorState, Extension, Line } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { settingsState } from '$lib/state/settings.svelte'
import { isSeparatorLine, isTableLine } from './formatTables'

export { formatTables, isSeparatorLine, isTableLine } from './formatTables'

function pipePositions(text: string): number[] {
  const out: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && (i === 0 || text[i - 1] !== '\\')) out.push(i)
  }
  return out
}

function isInsideCodeFence(state: EditorState, pos: number): boolean {
  try {
    let node = syntaxTree(state).resolveInner(pos, 1) as { name: string; parent: unknown } | null
    while (node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') return true
      node = node.parent as typeof node
    }
    return false
  } catch {
    return false
  }
}

function findTableBounds(state: EditorState, lineNum: number): { start: number; end: number } | null {
  const line = state.doc.line(lineNum)
  if (!isTableLine(line.text)) return null
  let start = lineNum
  let end = lineNum
  while (start > 1 && isTableLine(state.doc.line(start - 1).text)) start--
  const total = state.doc.lines
  while (end < total && isTableLine(state.doc.line(end + 1).text)) end++
  if (end - start < 1) return null
  if (!isSeparatorLine(state.doc.line(start + 1).text)) return null
  return { start, end }
}

function cellStartAfterPipe(text: string, pipePos: number): number {
  return text[pipePos + 1] === ' ' ? pipePos + 2 : pipePos + 1
}

function tabInTable(view: EditorView, forward: boolean): boolean {
  const { state } = view
  if (state.selection.ranges.length > 1) return false
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!isTableLine(line.text)) return false
  if (isInsideCodeFence(state, head)) return false
  const bounds = findTableBounds(state, line.number)
  if (!bounds) return false

  const pipes = pipePositions(line.text)
  if (pipes.length < 2) return false

  const colInLine = head - line.from
  // `nextPipe` = index in `pipes[]` of the first pipe at or after the cursor.
  // The cell containing the cursor is bounded by pipes[nextPipe - 1] (left)
  // and pipes[nextPipe] (right). Forward target is the cell whose left pipe
  // is pipes[nextPipe]; backward target's left pipe is pipes[nextPipe - 2].
  let nextPipe = pipes.findIndex(p => p >= colInLine)
  if (nextPipe < 0) nextPipe = pipes.length
  const targetLeftPipeIdx = forward ? nextPipe : nextPipe - 2

  if (targetLeftPipeIdx >= 0 && targetLeftPipeIdx < pipes.length - 1) {
    const newCol = cellStartAfterPipe(line.text, pipes[targetLeftPipeIdx])
    view.dispatch({
      selection: { anchor: line.from + newCol },
      scrollIntoView: true,
    })
    return true
  }

  return forward
    ? tabIntoNextRow(view, line, bounds)
    : tabIntoPrevRow(view, line, bounds)
}

function buildEmptyRow(numPipes: number): string {
  // numPipes pipes → numPipes - 1 cells. Each cell renders as two spaces so
  // there's room for a cursor between them; align-on-save normalises later.
  const parts: string[] = []
  for (let i = 0; i < numPipes - 1; i++) parts.push('  ')
  return '|' + parts.join('|') + '|'
}

function firstCellOffsetInRow(row: string): number {
  const firstPipe = row.indexOf('|')
  if (firstPipe < 0) return 0
  return cellStartAfterPipe(row, firstPipe)
}

function tabIntoNextRow(
  view: EditorView,
  line: Line,
  bounds: { start: number; end: number },
): boolean {
  const { state } = view
  let targetLine = line.number + 1
  // Step over the separator row.
  if (targetLine === bounds.start + 1) targetLine = bounds.start + 2

  if (targetLine <= bounds.end) {
    const t = state.doc.line(targetLine)
    const pipes = pipePositions(t.text)
    if (pipes.length >= 2) {
      const newCol = cellStartAfterPipe(t.text, pipes[0])
      view.dispatch({
        selection: { anchor: t.from + newCol },
        scrollIntoView: true,
      })
      return true
    }
  }

  // Past the last row → append a new row matching the header's pipe count.
  const headerPipes = pipePositions(state.doc.line(bounds.start).text).length
  if (headerPipes < 2) return false
  const lastLine = state.doc.line(bounds.end)
  const newRow = buildEmptyRow(headerPipes)
  view.dispatch({
    changes: { from: lastLine.to, insert: '\n' + newRow },
    selection: { anchor: lastLine.to + 1 + firstCellOffsetInRow(newRow) },
    scrollIntoView: true,
    userEvent: 'input.table',
  })
  return true
}

function tabIntoPrevRow(
  view: EditorView,
  line: Line,
  bounds: { start: number; end: number },
): boolean {
  const { state } = view
  let targetLine = line.number - 1
  // Step over the separator row when moving up out of the body.
  if (targetLine === bounds.start + 1) targetLine = bounds.start

  if (targetLine >= bounds.start) {
    const t = state.doc.line(targetLine)
    const pipes = pipePositions(t.text)
    if (pipes.length >= 2) {
      const lastLeftPipe = pipes[pipes.length - 2]
      const newCol = cellStartAfterPipe(t.text, lastLeftPipe)
      view.dispatch({
        selection: { anchor: t.from + newCol },
        scrollIntoView: true,
      })
      return true
    }
  }
  return false
}

function enterInTable(view: EditorView): boolean {
  const { state } = view
  if (state.selection.ranges.length > 1) return false
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!isTableLine(line.text)) return false
  if (isSeparatorLine(line.text)) return false
  if (isInsideCodeFence(state, head)) return false
  const bounds = findTableBounds(state, line.number)
  if (!bounds) return false

  // Allow exiting when the user is on the table's last row and that row is
  // visually empty (only pipes and whitespace) — Enter should not re-trap.
  if (line.number === bounds.end) {
    const stripped = line.text.replace(/[|\s]/g, '')
    if (stripped === '') return false
  }

  const headerPipes = pipePositions(state.doc.line(bounds.start).text).length
  if (headerPipes < 2) return false

  // If on the header row, insert after the separator so the new row joins the
  // body rather than wedging itself between header and separator.
  const afterLineNum = line.number === bounds.start ? bounds.start + 1 : line.number
  const afterLine = state.doc.line(afterLineNum)
  const newRow = buildEmptyRow(headerPipes)
  view.dispatch({
    changes: { from: afterLine.to, insert: '\n' + newRow },
    selection: { anchor: afterLine.to + 1 + firstCellOffsetInRow(newRow) },
    scrollIntoView: true,
    userEvent: 'input.table',
  })
  return true
}

// ===== Wiring =======================================================

export function buildTableExt(): Extension {
  if (!settingsState.values.tableAutoFormat.enabled) return []
  const bindings: KeyBinding[] = [
    { key: 'Tab', run: v => tabInTable(v, true) },
    { key: 'Shift-Tab', run: v => tabInTable(v, false) },
    { key: 'Enter', run: v => enterInTable(v) },
  ]
  return keymap.of(bindings)
}
