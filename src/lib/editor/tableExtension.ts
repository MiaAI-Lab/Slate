import type { EditorView, KeyBinding } from '@codemirror/view'
import { keymap } from '@codemirror/view'
import type { EditorState, Extension, Line } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { settingsState } from '$lib/state/settings.svelte'

// Separator-row body: optional leading pipe + run of dashes (with optional :)
// + zero-or-more `| dashes` cells + optional trailing pipe. isSeparatorLine
// also verifies that there are at least two unescaped pipes so a bare `---`
// horizontal rule isn't misclassified.
const SEPARATOR_BODY_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

function countUnescapedPipes(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|' && text[i - 1] !== '\\') count++
  }
  return count
}

export function isTableLine(text: string): boolean {
  let i = 0
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++
  if (text[i] !== '|') return false
  return countUnescapedPipes(text) >= 2
}

export function isSeparatorLine(text: string): boolean {
  if (countUnescapedPipes(text) < 2) return false
  return SEPARATOR_BODY_RE.test(text)
}

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

// ===== Align-on-save formatter ======================================

type Align = 'left' | 'right' | 'center' | 'none'

interface ParsedRow {
  cells: string[]
  leading: string
}

function parseRow(text: string): ParsedRow {
  const lead = /^\s*/.exec(text)?.[0] ?? ''
  let body = text.slice(lead.length)
  if (body.startsWith('|')) body = body.slice(1)
  body = body.replace(/\s+$/, '')
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells: string[] = []
  let buf = ''
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '|' && body[i - 1] !== '\\') {
      cells.push(buf.trim())
      buf = ''
    } else {
      buf += body[i]
    }
  }
  cells.push(buf.trim())
  return { cells, leading: lead }
}

function parseAligns(text: string): Align[] {
  return parseRow(text).cells.map(c => {
    const t = c.trim()
    const left = t.startsWith(':')
    const right = t.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return 'none'
  })
}

function emitDataRow(cells: string[], widths: number[], aligns: Align[]): string {
  const parts: string[] = []
  for (let c = 0; c < widths.length; c++) {
    const text = cells[c] ?? ''
    const w = widths[c]
    const a = aligns[c]
    let padded: string
    if (a === 'right') {
      padded = text.padStart(w, ' ')
    } else if (a === 'center') {
      const total = Math.max(0, w - text.length)
      const leftPad = Math.floor(total / 2)
      padded = ' '.repeat(leftPad) + text + ' '.repeat(total - leftPad)
    } else {
      padded = text.padEnd(w, ' ')
    }
    parts.push(' ' + padded + ' ')
  }
  return '|' + parts.join('|') + '|'
}

function emitSeparator(widths: number[], aligns: Align[]): string {
  const parts: string[] = []
  for (let c = 0; c < widths.length; c++) {
    const a = aligns[c]
    const w = widths[c]
    let inner: string
    if (a === 'center') inner = ':' + '-'.repeat(Math.max(1, w - 2)) + ':'
    else if (a === 'right') inner = '-'.repeat(Math.max(2, w - 1)) + ':'
    else if (a === 'left') inner = ':' + '-'.repeat(Math.max(2, w - 1))
    else inner = '-'.repeat(Math.max(3, w))
    parts.push(' ' + inner + ' ')
  }
  return '|' + parts.join('|') + '|'
}

export function formatTables(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0
  let inFence = false
  let fenceMarker = ''

  while (i < lines.length) {
    const line = lines[i]

    if (inFence) {
      out.push(line)
      if (line.trim().startsWith(fenceMarker)) {
        inFence = false
        fenceMarker = ''
      }
      i++
      continue
    }
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      out.push(line)
      inFence = true
      fenceMarker = fenceMatch[1]
      i++
      continue
    }

    if (
      i + 1 < lines.length &&
      isTableLine(line) &&
      isTableLine(lines[i + 1]) &&
      isSeparatorLine(lines[i + 1])
    ) {
      const headerPipeCount = countUnescapedPipes(line)
      const sepPipeCount = countUnescapedPipes(lines[i + 1])

      let j = i + 2
      while (j < lines.length && isTableLine(lines[j])) j++

      // Bail when pipe counts are inconsistent — likely an in-progress edit
      // we shouldn't rewrite.
      let pipeMismatch = sepPipeCount !== headerPipeCount
      for (let k = i + 2; !pipeMismatch && k < j; k++) {
        if (countUnescapedPipes(lines[k]) !== headerPipeCount) pipeMismatch = true
      }
      if (pipeMismatch) {
        for (let k = i; k < j; k++) out.push(lines[k])
        i = j
        continue
      }

      const header = parseRow(line)
      const aligns = parseAligns(lines[i + 1])
      const bodyRows: ParsedRow[] = []
      for (let k = i + 2; k < j; k++) bodyRows.push(parseRow(lines[k]))

      const numCols = header.cells.length
      const widths = new Array<number>(numCols).fill(0)
      for (let c = 0; c < numCols; c++) {
        widths[c] = Math.max(widths[c], header.cells[c].length)
        for (const r of bodyRows) widths[c] = Math.max(widths[c], (r.cells[c] ?? '').length)
      }
      // Minimum width per column so the separator can hold its alignment
      // markers: `---` (3), `:---`/`---:` (4), `:---:` (5).
      for (let c = 0; c < numCols; c++) {
        const a = aligns[c]
        const minSep = a === 'center' ? 5 : (a === 'left' || a === 'right' ? 4 : 3)
        if (widths[c] < minSep) widths[c] = minSep
      }

      const lead = header.leading
      out.push(lead + emitDataRow(header.cells, widths, aligns))
      out.push(lead + emitSeparator(widths, aligns))
      for (const r of bodyRows) out.push(lead + emitDataRow(r.cells, widths, aligns))
      i = j
      continue
    }

    out.push(line)
    i++
  }

  return out.join('\n')
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
