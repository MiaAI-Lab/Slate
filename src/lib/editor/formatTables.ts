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

function isClosingFence(line: string, marker: string): boolean {
  // A closer is a run of the same character, at least as long as the opener,
  // with nothing after it. A line like ```js is an example inside the block.
  const trimmed = line.trim()
  const ch = marker[0]
  let i = 0
  while (i < trimmed.length && trimmed[i] === ch) i++
  return i >= marker.length && trimmed.slice(i).trim() === ''
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
      if (isClosingFence(line, fenceMarker)) {
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

      // Bail when pipe counts are inconsistent. Likely an in-progress edit
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
