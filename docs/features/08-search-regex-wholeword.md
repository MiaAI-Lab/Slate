# 08. Regex + whole-word in Find

**Goal.** Current Find is literal-only (`escapeRegex` at
`src/lib/components/SearchPanel.svelte:99-101`). Add two checkboxes:
**.\*** (regex) and **W** (whole word). Apply across both the in-tab
live-highlight path and the cross-folder Rust search.

## UX

- Two new checkbox toggles in the search panel header row beside
  case-sensitive: **`.*`** and **`W`**, matching VS Code glyphs.
- Invalid regex (e.g. `[`) → red border on input + tooltip with error.
- Tab indicator clears highlight when regex is invalid (don't fall back
  to literal — confusing).

## State changes

```ts
// src/lib/state/searchPanel.svelte.ts
class SearchPanelState {
  // … existing fields
  regex = $state(false)
  wholeWord = $state(false)
  regexError = $state<string | null>(null)
}
```

## Files to edit

- `src/lib/state/searchPanel.svelte.ts` — add the new flags.
- `src/lib/components/SearchPanel.svelte` — UI controls + replace the
  matcher.
- `src-tauri/src/commands/search.rs` — extend `search_files` to accept
  `regex` and `whole_word` booleans and apply them.

## Matcher

Drop `escapeRegex` and compute the live regex from the flags:

```ts
function compileQuery(): RegExp | null {
  const q = searchPanel.query
  if (!q) return null
  let pattern = searchPanel.regex ? q : escapeForRegex(q)
  if (searchPanel.wholeWord) pattern = `\\b(?:${pattern})\\b`
  const flags = searchPanel.caseSensitive ? 'g' : 'gi'
  try {
    const re = new RegExp(pattern, flags)
    searchPanel.regexError = null
    return re
  } catch (e) {
    searchPanel.regexError = (e as Error).message
    return null
  }
}
```

`escapeForRegex` mirrors the current `escapeRegex` body; keep it
inline. Replace the three `new RegExp(escapeRegex(q), …)` callsites
(`SearchPanel.svelte:130`, `:276`, `:301`) with `compileQuery()`.

## Replace-all safety

`replaceAll` already uses the regex (`SearchPanel.svelte:301`). With
user-authored regex, a `$1` in the replacement string suddenly *means*
something. That's the desired behavior — call it out in a tiny help
hover (`title="$1 = first capture group"`) on the replacement input
when regex mode is on.

## Folder search (Rust)

Today's `search_files` lowercases haystack + needle for `case_sensitive
== false` and `contains`. Add regex via the `regex` crate.

```toml
# src-tauri/Cargo.toml
regex = "1"
```

```rust
#[tauri::command]
pub async fn search_files(
    folder: String,
    query: String,
    case_sensitive: bool,
    regex: bool,
    whole_word: bool,
) -> Result<SearchResult, String> {
    let pattern = if regex { query.clone() } else { regex::escape(&query) };
    let pattern = if whole_word { format!(r"\b(?:{pattern})\b") } else { pattern };
    let re = regex::RegexBuilder::new(&pattern)
        .case_insensitive(!case_sensitive)
        .build()
        .map_err(|e| e.to_string())?;
    // … existing walker, but call `re.is_match(line)` instead of `contains`
}
```

Add params to the JS invoke at `SearchPanel.svelte:187-194`. The
existing Rust `search_files` signature changes — update both ends in
the same commit to avoid a runtime mismatch.

## Visual

```svelte
<label class="opt" title=".* — regex">
  <input type="checkbox" checked={searchPanel.regex} onchange={e => searchPanel.regex = e.currentTarget.checked} />
  <span class="opt-glyph">.*</span>
</label>
<label class="opt" title="W — whole word">
  <input type="checkbox" checked={searchPanel.wholeWord} onchange={e => searchPanel.wholeWord = e.currentTarget.checked} />
  <span class="opt-glyph">W</span>
</label>
```

Style `.opt-glyph` as 18×18 px box; tinted with `--accent` when checked.
Reuse the existing case-sensitive checkbox stylesheet pattern in
`SearchPanel.svelte`.

## Error display

When `regexError` is non-null:

- Add `input-error` class to the find input (style already exists in
  `SettingsDialog.svelte:464-469` — copy or extract).
- Tooltip: `title={searchPanel.regexError}`.

## Edge cases

1. **`\b` and Unicode.** JavaScript's `\b` is ASCII-only without the
   `u` flag and the `\b{...}` syntax (which isn't widely supported in
   Chromium's V8). For v1, document "Whole word matches ASCII word
   boundaries" in a tooltip and move on.
2. **Empty query with regex on.** Suppress matches; don't try to match
   the empty string everywhere.
3. **Replacement with backreferences.** Native `String.replace(re, …)`
   handles `$1` automatically — no extra work.
4. **Huge regex backtracking blowup.** Wrap `re.exec()` in the Rust
   side with a count cap (already at 500). On JS side, the existing
   per-tab match cap discussion (PLAN.md / code review) applies.

## Test plan

- Off / on / off across the two new toggles: literal search still works.
- Type `foo|bar` with regex on → matches both.
- Type `[` with regex on → red input border, tooltip shows error,
  highlights cleared.
- Whole-word "foo" → does not match "foobar".
- Cross-folder search with regex on returns results consistent with
  in-tab highlight.
- Replace with `$1` works when regex on.
