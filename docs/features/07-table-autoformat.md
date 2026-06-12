# 07. Markdown table auto-format

**Goal.** Editing GFM tables stops being painful:

- `Tab` / `Shift+Tab` inside a table moves between cells (creates a new
  row when leaving the rightmost cell of the last row).
- `Enter` at end of any row inserts a new row with matching pipe count.
- On save (or `Ctrl+Alt+T`), all tables in the doc get aligned: pipes
  vertical, padding equalized.

## Settings

```ts
tableAutoFormat: {
  enabled: boolean      // default true
  alignOnSave: boolean  // default true
}
```

Two checkboxes in **Behavior** tab:

- "Auto-format Markdown tables"
- "Align tables on save" (disabled when first is off)

## Files to add

- `src/lib/editor/tableExtension.ts` — table detection + Tab/Enter
  keybindings + format command.

## Files to edit

- `src/lib/editor/createEditor.ts` — include the table extension
  inside the `buildExtensions` array. Use a compartment if the user
  needs live toggling; or rebuild state on setting change (already the
  pattern in `Editor.svelte:263-278` for theme/font/wrap — add a
  `tableCompartment`).
- `src/lib/editor/compartments.ts` — add `tableCompartment`.
- `src/lib/utils/fileService.ts:saveActive` — call format-all-tables
  before `write_file` when `alignOnSave` is true.
- `src/lib/state/settings.svelte.ts` — default + migration.

## Detection

A "table line" is a line that starts with optional whitespace then a
pipe and contains at least one more pipe. A table is a contiguous block
of ≥2 table lines whose second line is a separator
(`/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/`).

Don't try to parse with `markdown-language` from CodeMirror — it
exposes node positions, but the separator-row check is easier in
straight string land.

## Tab navigation logic

```ts
function tabInTable(view: EditorView, forward: boolean): boolean {
  const { state } = view
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!isTableLine(line.text)) return false  // let default Tab fire (indent)

  // Find pipe positions on this line.
  const pipes = pipePositions(line.text)
  const colInLine = head - line.from
  let cellIdx = pipes.findIndex(p => p >= colInLine)
  if (cellIdx < 0) cellIdx = pipes.length

  const targetCell = forward ? cellIdx : cellIdx - 1
  if (targetCell >= 0 && targetCell < pipes.length - 1) {
    // Jump to the start of the next/prev cell on the same row.
    const newCol = pipes[targetCell] + 2 // skip "| "
    view.dispatch({ selection: { anchor: line.from + newCol } })
    return true
  }
  if (forward) {
    // Past last cell → move to next row's first cell, or insert one.
    return tabIntoNextRow(view, line)
  }
  return tabIntoPrevRow(view, line)
}
```

Trade-offs: this is ~100 lines of careful code. Keep it tested via
manual smoke first; add a unit test once a Vitest harness lands.

## Enter handler

When `Enter` is pressed on a non-separator table row, insert
`\n| <spaces matching first row's cells> |` with `|` count matching the
header. Caret lands in the first cell of the new row.

Skip the behavior if the user is on the **last** line of the table and
the line is empty — i.e. they were exiting the table; Enter should not
re-trap them.

## Align-on-save

```ts
function formatTables(md: string): string {
  // Split into blocks. For each table block:
  //   - Tokenize each row into cells (split by '|', trim).
  //   - Compute max width per column (over both header and body, NOT
  //     including the separator row).
  //   - Re-emit:
  //       | cell1pad | cell2pad |
  //       |:---------|---------:|
  //       | …
  //   - Preserve separator-row alignment markers (:--, --:, :--:).
  // Bail on rows whose pipe count differs from the header — likely an
  // in-progress edit; leave the block alone.
}
```

This is well-trodden territory; reference the format used by
`prettier`'s markdown printer if you want to crib alignment rules.

## Wiring

```ts
// src/lib/editor/tableExtension.ts
import { keymap } from '@codemirror/view'
import { Compartment } from '@codemirror/state'
import { settingsState } from '$lib/state/settings.svelte'

export function buildTableExt() {
  if (!settingsState.values.tableAutoFormat.enabled) return []
  return [
    keymap.of([
      { key: 'Tab',       run: v => tabInTable(v, true)  },
      { key: 'Shift-Tab', run: v => tabInTable(v, false) },
      { key: 'Enter',     run: v => enterInTable(v)      },
    ]),
  ]
}
```

In `Editor.svelte` add an effect mirroring the theme/font reconfigure:

```ts
$effect(() => {
  const _flag = settingsState.values.tableAutoFormat.enabled
  if (!viewReady || !view) return
  view.dispatch({ effects: tableCompartment.reconfigure(buildTableExt()) })
})
```

## fileService integration

```ts
// saveActive in fileService.ts
const out = settingsState.values.tableAutoFormat.alignOnSave
  ? formatTables(tab.content)
  : tab.content
await saveFile(tab.path, out)
if (out !== tab.content) {
  // Push reformatted content back into the editor (via tabsState +
  // editor view) so the user sees it.
  tabsState.updateContent(tab.id, out)
}
```

Update through `tabsState.updateContent` triggers the Editor's
`syncFromStoreIfDiverged` path; safe.

## Edge cases

1. **Pipe character inside cell content (`\|`).** GFM allows escaped
   pipes. Tokenizer must respect `\|`.
2. **CJK / wide characters in cells.** Padding by `.length` mis-aligns.
   Compute width with `Intl.Segmenter` once and cache, or accept
   approximation — most users are ASCII-heavy.
3. **`Tab` outside a table.** Must fall through to `indentWithTab`
   (already registered in `createEditor.ts:58`). The keymap should
   precede `indentWithTab` — keymap returns `false` to chain.
4. **Multi-cursor.** Skip Tab/Enter interception if
   `state.selection.ranges.length > 1`; let defaults handle.
5. **Tables in fenced code blocks.** `isTableLine` must return false
   inside code. Track fence depth on the doc when walking, or use
   `markdownLanguage`'s syntax tree (`syntaxTree(state)`) to bail when
   the parent node is `FencedCode`.

## Test plan

- Type `| a | b |\n|---|---|\n| 1 | 2 |` → cursor in cell `1` →
  `Tab` jumps to `2`, `Tab` again creates a new row.
- `Shift+Tab` from cell `2` returns to `1`.
- `Enter` on row 1 of body → inserts new row with same pipe count.
- Misaligned table + save with alignOnSave on → pipes line up.
- Toggle the feature off → Tab returns to default `indentWithTab`.
- Table inside ``` ``` ``` block → untouched.
