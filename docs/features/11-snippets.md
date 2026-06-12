# 11. Snippets / abbreviations

**Goal.** Type a trigger like `:date` followed by `Tab` and have it
expanded to the current date. Built-ins ship with sensible defaults
(`:date`, `:time`, `:datetime`, `:uuid`); users can add their own in
Settings.

## UX

- **Triggers** are short tokens starting with `:` (configurable) and
  expanded on `Tab`, only when the cursor sits immediately after the
  trigger (no trailing whitespace).
- If no snippet matches, `Tab` falls through to `indentWithTab`.
- **Multi-cursor** is supported — every cursor expands its own snippet
  independently (skip if any cursor isn't on a snippet).
- **Discoverability:** typing `:` while not inside a code fence opens a
  tiny inline picker (autocomplete popup). v1 can skip this and rely on
  Tab-expansion alone; document the snippets in Settings.

## Built-ins

| Trigger | Output |
| --- | --- |
| `:date` | `YYYY-MM-DD` |
| `:time` | `HH:mm` |
| `:datetime` | `YYYY-MM-DD HH:mm` |
| `:uuid` | new v4 |
| `:cb` | code-block scaffold `` ``` \n\n``` `` with caret on the empty line |
| `:tbl` | a small 2×2 GFM table scaffold |

User-defined snippets are static strings (no templating in v1; no `$1`
caret placeholders). Keep it simple. A v2 can add tabstops via
CodeMirror's `@codemirror/autocomplete` snippet primitives.

## Settings

```ts
snippets: {
  enabled: boolean                   // default true
  triggerKey: 'Tab' | 'Enter'        // default 'Tab'
  custom: Array<{ trigger: string; body: string }>   // default []
}
```

In the **Behavior** tab, add a list-edit row: name (trigger), body (textarea),
add/remove buttons. Use the existing `.input` styling from
`SettingsDialog.svelte:379-388`.

## Files to add

- `src/lib/editor/snippets.ts` — built-ins table + expand function +
  keybinding.

## Files to edit

- `src/lib/editor/createEditor.ts` — include the snippet keymap in
  `markdownShortcuts` OR before `indentWithTab` so Tab is intercepted
  first.
- `src/lib/state/settings.svelte.ts` — defaults + migration.
- `src/lib/components/SettingsDialog.svelte` — editor for `custom`.

## Expand function

```ts
// src/lib/editor/snippets.ts
import type { KeyBinding } from '@codemirror/view'
import { settingsState } from '$lib/state/settings.svelte'
import { v4 as uuid } from 'uuid'

type Snippet = { trigger: string; body: () => string }

const BUILT_INS: Snippet[] = [
  { trigger: ':date',     body: () => fmtDate(new Date()) },
  { trigger: ':time',     body: () => fmtTime(new Date()) },
  { trigger: ':datetime', body: () => `${fmtDate(new Date())} ${fmtTime(new Date())}` },
  { trigger: ':uuid',     body: () => uuid() },
  { trigger: ':cb',       body: () => '```\n\n```' },
  { trigger: ':tbl',      body: () => '| col1 | col2 |\n|------|------|\n|      |      |' },
]

function fmtDate(d: Date) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}
function fmtTime(d: Date) {
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function lookupTrigger(token: string): Snippet | null {
  if (!settingsState.values.snippets.enabled) return null
  const custom = settingsState.values.snippets.custom.find(s => s.trigger === token)
  if (custom) return { trigger: token, body: () => custom.body }
  return BUILT_INS.find(s => s.trigger === token) ?? null
}

export function snippetKeymap(): KeyBinding[] {
  return [{
    key: settingsState.values.snippets.triggerKey === 'Enter' ? 'Enter' : 'Tab',
    run: (view) => {
      const { state } = view
      const ranges = state.selection.ranges
      // Only expand when every cursor has a trigger preceding it.
      const replacements: { from: number; to: number; insert: string }[] = []
      for (const r of ranges) {
        if (!r.empty) return false
        const line = state.doc.lineAt(r.head)
        const before = state.sliceDoc(line.from, r.head)
        const m = /(:[a-zA-Z][a-zA-Z0-9_-]*)$/.exec(before)
        if (!m) return false
        const snip = lookupTrigger(m[1])
        if (!snip) return false
        const from = r.head - m[1].length
        replacements.push({ from, to: r.head, insert: snip.body() })
      }
      if (replacements.length === 0) return false
      // Build a transaction. Avoid clobbering ranges by sorting from end → start.
      replacements.sort((a, b) => b.from - a.from)
      let tr = state.update({ changes: replacements })
      view.dispatch(tr)
      return true
    },
  }]
}
```

Snippet keymap must come **before** `indentWithTab` in the keymap array
so it gets the first shot at Tab; CodeMirror tries each binding in
order and stops at the first `run` returning `true`.

## Wiring

In `createEditor.ts:buildExtensions`, change:

```ts
keymapCompartment.of(keymap.of([
  ...defaultKeymap,
  ...historyKeymap,
  ...searchKeymap,
  ...snippetKeymap(),          // ← new
  indentWithTab,
  ...markdownShortcuts(),
])),
```

Wrap `snippetKeymap()` in a compartment if you want live toggles
without rebuilding the state. For v1 just rebuild on setting change —
add a reconfigure effect mirroring the table feature's pattern.

## Settings UI

A small repeater under **Behavior**:

```svelte
{#each settingsState.values.snippets.custom as snip, i}
  <div class="flex gap-2 items-start">
    <input class="input w-32" placeholder=":mytrigger" bind:value={snip.trigger} />
    <textarea class="input flex-1" rows="2" bind:value={snip.body}></textarea>
    <button class="dlg-btn ghost" onclick={() => removeAt(i)}>×</button>
  </div>
{/each}
<button class="dlg-btn ghost" onclick={addBlank}>+ Add snippet</button>
```

Validation: trigger must match `/^:[a-z][a-z0-9_-]*$/i`. Strip
duplicates by keeping the first.

## Edge cases

1. **Trigger collides with built-in.** Custom wins (lookup hits custom
   first). Show a warning glyph in the list when this happens.
2. **Cursor in the middle of a word.** Regex anchors to `$` (end of
   text-before-cursor); if non-trigger chars follow, no expansion.
3. **Tab inside table.** Feature 07's table-Tab handler runs before
   `indentWithTab`. Order to settle: table-Tab → snippet-Tab →
   indent. Or snippet-Tab first; table-Tab handles its own cells. Doc
   the precedence.
4. **Empty trigger / empty body.** Skip in lookup.
5. **Privacy.** Custom snippets persist in `settings.json` —
   plaintext. Don't suggest storing tokens there.

## Test plan

- `:date<Tab>` → `2026-05-14` (today).
- `:uuid<Tab>` → new UUID inserted.
- Add a custom snippet `:sig → -- \nBest,\nYou`. Save settings.
  `:sig<Tab>` inserts the multiline body.
- Cursor in the middle of `foo:date<Tab>` → still expands the trigger
  at the cursor's end (regex anchored). Confirm or refuse based on
  taste — refusal is more conservative; add a `\s|^` boundary to the
  regex if you want strict mode.
- Disable feature → Tab falls back to indent everywhere.
