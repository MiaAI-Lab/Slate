# 20. Inline markdown lint

**Goal.** Surface authoring problems inline in the editor: broken
relative links, missing alt text, unmatched fenced code, very long
lines (optional). Squigglies in the gutter; hover shows the message;
click jumps to the line.

Off by default. Three checkboxes in Behavior to opt into each rule
class.

## Settings

```ts
lint: {
  enabled: boolean              // default false
  brokenRelativeLinks: boolean  // default true (only when enabled)
  missingAltText: boolean       // default true
  unmatchedFences: boolean      // default true
}
```

## Rules (v1)

| Rule | Detect | Notes |
| --- | --- | --- |
| broken-relative-link | `[…](path)` where `path` is relative + doesn't exist on disk | Async — uses `fs:allow-exists`. Skip for absolute URLs and `#` anchors. |
| missing-alt-text | `![](url)` with empty alt | Easy pure-text check. |
| unmatched-fence | `\`\`\`` count is odd | Whole-doc scan. |

Don't try to replicate `markdownlint`'s 50+ rules. The three above
cover the highest-signal issues.

## Files to add

- `src/lib/editor/lintExtension.ts` — uses CodeMirror's
  `@codemirror/lint` (`linter` API).

## Files to edit

- `package.json` — `pnpm add @codemirror/lint`.
- `src/lib/editor/createEditor.ts` — include the linter compartment.
- `src/lib/editor/compartments.ts` — `lintCompartment`.
- `src/lib/components/Editor.svelte` — reconfigure on setting change.
- `src/lib/state/settings.svelte.ts` — defaults + migration.
- `src/lib/components/SettingsDialog.svelte` — Behavior controls.

## Linter

```ts
// src/lib/editor/lintExtension.ts
import { linter, type Diagnostic } from '@codemirror/lint'
import { settingsState } from '$lib/state/settings.svelte'
import { tabsState } from '$lib/state/tabs.svelte'
import { invoke } from '@tauri-apps/api/core'
import { dirname, join } from '@tauri-apps/api/path'

const LINK_RE = /(?<!\!)\[[^\]]*\]\(([^)]+)\)/g
const IMG_RE  = /!\[([^\]]*)\]\(([^)]+)\)/g

async function mdLint(view): Promise<Diagnostic[]> {
  const cfg = settingsState.values.lint
  if (!cfg.enabled) return []
  const text = view.state.doc.toString()
  const out: Diagnostic[] = []
  const tab = tabsState.activeTab
  const docDir = tab?.path ? await dirname(tab.path) : null

  if (cfg.missingAltText) {
    for (const m of text.matchAll(IMG_RE)) {
      if (m[1].trim() === '') {
        out.push({
          from: m.index!,
          to: m.index! + m[0].length,
          severity: 'warning',
          message: 'Image missing alt text. Add a description for accessibility.',
        })
      }
    }
  }

  if (cfg.unmatchedFences) {
    let count = 0
    for (const _ of text.matchAll(/^```/gm)) count++
    if (count % 2 === 1) {
      // No good single-line range — point at the first opening fence.
      const first = text.indexOf('```')
      out.push({
        from: first,
        to: first + 3,
        severity: 'error',
        message: 'Unmatched fenced code block (odd number of ```).',
      })
    }
  }

  if (cfg.brokenRelativeLinks && docDir) {
    for (const m of text.matchAll(LINK_RE)) {
      const url = m[1].trim()
      if (/^[a-z]+:\/\//i.test(url) || url.startsWith('#') || url.startsWith('mailto:')) continue
      const abs = await join(docDir, url.split('#')[0])
      const exists = await invoke<boolean>('plugin:fs|exists', { path: abs }).catch(() => false)
      if (!exists) {
        out.push({
          from: m.index!,
          to: m.index! + m[0].length,
          severity: 'warning',
          message: `Link target not found: ${url}`,
        })
      }
    }
  }

  return out
}

export function buildLinter() {
  return linter(mdLint, { delay: 800 })
}
```

`linter`'s `delay` debounces; with the async exists check, 800ms is a
reasonable compromise.

## Wiring

In `Editor.svelte`, mirror the existing reconfigure effects:

```ts
$effect(() => {
  const _ = settingsState.values.lint.enabled
  // touch sub-flags as deps too
  void settingsState.values.lint.brokenRelativeLinks
  void settingsState.values.lint.missingAltText
  void settingsState.values.lint.unmatchedFences
  if (!viewReady || !view) return
  view.dispatch({
    effects: lintCompartment.reconfigure(buildLinter()),
  })
})
```

Re-creating the linter on every setting flip is fine; CodeMirror cleans
up the old one.

## Performance

Each lint pass is O(content) regex scans + (broken-link rule) N async
file-exists checks. Cap link checks at 200 per pass; show a footer
"N more links unchecked" if exceeded.

`fs:allow-exists` is already in the capabilities file
(`src-tauri/capabilities/default.json:25`). Reuses the existing
permission.

## Edge cases

1. **Image inside link.** `![alt](img)` inside `[ ](href)` — both
   regexes still match the inner image; OK.
2. **Auto-links (`<https://…>`).** Not handled; only `[](…)` links.
3. **Reference-style links (`[text][ref]`).** Not handled in v1.
   Document.
4. **Windows path separators in `path`.** `join` handles them on
   Tauri's Windows host; for cross-doc portability, recommend POSIX
   separators in source — but lint doesn't enforce style.
5. **Anchors (`./foo.md#bar`).** Strip `#…` before exists check; don't
   try to verify the anchor.

## Test plan

- Enable lint. Insert `![](foo.png)` → squiggle, hover shows "missing
  alt text".
- Insert `[link](./does-not-exist.md)` next to a saved tab → squiggle
  on the link.
- Insert `[link](https://example.com)` → no warning (URL skipped).
- Add a single ``` ``` `` `` → file-level error reported.
- Toggle individual rules off → corresponding squigglies disappear.
- Untitled tab with `[](rel.md)` → broken-link rule silent (no docDir).
