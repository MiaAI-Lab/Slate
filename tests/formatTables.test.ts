import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTables } from '../src/lib/editor/formatTables.ts'

test('a line that only starts with the fence marker stays inside the block', () => {
  const src = [
    '```',
    '```js',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '```',
    '| c | d |',
    '|---|---|',
    '| 3 | 4 |',
  ].join('\n')
  const out = formatTables(src)
  assert.equal(out.includes('| a   |'), false)
  assert.ok(out.includes('| a | b |\n|---|---|\n| 1 | 2 |'))
  assert.ok(out.includes('| c   | d   |\n| --- | --- |\n| 3   | 4   |'))
})

test('a tilde fence with an info line keeps the sample table', () => {
  const src = [
    '~~~',
    '~~~py',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '~~~',
  ].join('\n')
  assert.equal(formatTables(src), src)
})

test('a longer closing fence still ends the block', () => {
  const src = [
    '```',
    'code',
    '````',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
  ].join('\n')
  const out = formatTables(src)
  assert.ok(out.includes('| a   | b   |'))
  assert.ok(out.includes('| --- | --- |'))
})

test('an ordinary table is still aligned', () => {
  const src = ['| a | b |', '|---|---|', '| 1 | 2 |'].join('\n')
  assert.equal(
    formatTables(src),
    ['| a   | b   |', '| --- | --- |', '| 1   | 2   |'].join('\n'),
  )
})
