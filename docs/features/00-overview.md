# Feature plans

Twenty implementation plans, one per file, ranked by usefulness. Each plan
is self-contained: scope, settings (if any), files touched, step-by-step
implementation, edge cases, and a test plan.

All plans assume the current architecture documented in `../../PLAN.md`
and `../../README.md`:

- Svelte 5 runes (`$state`, `$derived`, `$effect`) — no stores, no
  `writable()`. New state lives in `src/lib/state/<name>.svelte.ts` as a
  class instance.
- CodeMirror 6 with compartments in `src/lib/editor/compartments.ts`. New
  reconfigurable extensions slot into existing compartments or get a new
  one.
- Tauri 2 commands in `src-tauri/src/commands/`. New commands are added
  to a new file or an existing one, then registered in
  `src-tauri/src/lib.rs` (`invoke_handler![]`) and the relevant
  `src-tauri/capabilities/*.json` if a new plugin / permission is needed.
- Tabs state in `src/lib/state/tabs.svelte.ts`; persisted-tab fields must
  also be reflected in `src/types.ts` and (where they belong on disk) in
  `src-tauri/src/commands/session.rs`'s `Draft`.
- Settings in `src/lib/state/settings.svelte.ts` with defaults at the top
  and a `behavior` tab in `SettingsDialog.svelte`. New settings need a
  default and a migration-safe load path.

## Ranked index

| # | Plan | Settings? | Rust? | Est. size |
| - | ---- | --------- | ----- | --------- |
| 1 | [Image paste from clipboard](01-image-paste.md) | path | yes | M |
| 2 | [Outline / TOC sidebar](02-outline-toc.md) | toggle | no | M |
| 3 | [Folder sidebar (file tree)](03-folder-sidebar.md) | last-opened | yes | L |
| 4 | [Fuzzy quick-open](04-fuzzy-quick-open.md) | no | reuse | S |
| 5 | [Smart paste (HTML/RTF → Markdown)](05-smart-paste.md) | no | no | S |
| 6 | [Split-view sync scroll](06-split-sync-scroll.md) | toggle | no | M |
| 7 | [Markdown table auto-format](07-table-autoformat.md) | toggle | no | M |
| 8 | [Regex + whole-word in Find](08-search-regex-wholeword.md) | no | yes (search.rs) | S |
| 9 | [Frontmatter highlighting](09-frontmatter-highlight.md) | no | no | S |
| 10 | [Auto-link on paste](10-autolink-paste.md) | no | no | S |
| 11 | [Snippets / abbreviations](11-snippets.md) | yes | no | M |
| 12 | [Pin tabs](12-pin-tabs.md) | color | no | S |
| 13 | [Reveal in Explorer](13-reveal-in-explorer.md) | no | shell plugin | S |
| 14 | [KaTeX math](14-katex.md) | no | no | S |
| 15 | [Mermaid diagrams](15-mermaid.md) | no | no | S |
| 16 | [Copy as Rich-Text / HTML](16-copy-as-richtext.md) | no | no | S |
| 17 | [Native spell-check](17-spellcheck.md) | toggle | no | S |
| 18 | [Typewriter mode](18-typewriter-mode.md) | toggle | no | S |
| 19 | [Versioned backups](19-versioned-backups.md) | retention | yes | M |
| 20 | [Markdown lint](20-markdown-lint.md) | toggle | no | M |

S = ≤1 day. M = 1–3 days. L = 3–5 days.

## Conventions used in every plan

- **Files to add** — absolute path from repo root.
- **Files to edit** — absolute path + the function / section to touch.
- **Settings shape** — TypeScript snippet showing exactly what to merge
  into `AppSettings` (`src/types.ts`) + `defaults` in
  `settings.svelte.ts`. New nested objects must be filled in by the
  migration block in `initSettings`.
- **Rust capabilities** — list any new `permissions[]` entry needed in
  `src-tauri/capabilities/default.json`.
- **Test plan** — a manual smoke list; the project does not yet ship a
  Vitest harness (see `PLAN.md` § 12.6).

## Recommended implementation order

If you want to ship in order of impact-per-effort:

1. **05** (smart paste) — one file, instant win.
2. **10** (auto-link paste) — same paste-handler infrastructure as 05.
3. **08** (regex in Find) — two checkboxes, real value.
4. **13** (reveal in Explorer) — one menu item, one shell call.
5. **02** (outline) — first sidebar; carves the right-side dock pattern
   that 03 will reuse.
6. **12** (pin tabs) — small state change, common need.
7. **09** (frontmatter highlight) — one regex, one syntax-style.
8. **01** (image paste) — needs Rust `write_binary`; biggest UX leap.
9. **03** (folder sidebar) → **04** (fuzzy open) — pair them.
10. Everything else.
