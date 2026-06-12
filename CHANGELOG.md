# Changelog

## [1.0.21] — 2026-06-13

### Added
- Multi-tab editing with drag-to-reorder, pinning, and right-click context menu.
- Live Markdown preview (GFM via marked, sanitized with DOMPurify).
- Three view modes: Editor, Preview, and Split with synced scroll.
- Theme system: Light, Dark, OLED, System, with configurable accent colors.
- Search panel with regex, whole-word, multiline; scope: current tab / all tabs / folder.
- Smart paste (Ctrl+Shift+V): converts clipboard HTML to Markdown via Turndown.
- Table auto-format: pipe-table alignment on save.
- Export to self-contained HTML and PDF (via system print dialog).
- Autosave drafts every 5 seconds with restore-on-relaunch.
- Multiple windows, fullscreen mode (F11).
- File association with .md, .markdown, .mdx, .txt, .log.
- Windows "Open with" integration (single-instance, argv file handling).
- Status bar: file path, word/char count, reading time, cursor position.
- Win11 title-bar text-color sync with theme accent.
- Snippet support, pin tabs, fuzzy quick-open, outline/TOC.
- Markdown linting, typewriter mode, versioned backups.
- Spellcheck support.

### Changed
- Initial public release.

### Fixed
- Initial release — no prior published versions.

[1.0.21]: https://github.com/MiaAI-Lab/slate/releases/tag/v1.0.21