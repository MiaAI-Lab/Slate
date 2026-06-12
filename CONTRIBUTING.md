# Contributing to Slate

Thanks for your interest in contributing! This is a small, focused project, so please keep changes aligned with the existing architecture.

## Getting started

1. Fork the repository.
2. Clone your fork.
3. Set up the development environment (see [README](README.md#development-setup)).
4. Create a branch: git checkout -b feat/your-feature-name.

## Development

`powershell
# Install dependencies
pnpm install

# Run in dev mode (hot-reload)
pnpm tauri dev

# Type-check Svelte/TypeScript
pnpm check

# Build production installers
.\build.ps1
`

## Pull request guidelines

- Keep PRs focused on one concern. Prefer small, incremental changes.
- Update the CHANGELOG.md under the "Unreleased" section if your change is user-facing.
- Ensure pnpm check passes.
- Test the app manually on Windows (the primary target).

## Code style

- TypeScript / Svelte: Prettier defaults (single quotes, trailing commas).
- Rust: cargo fmt (default style).
- Svelte 5 runes ($state, $derived, $effect) are preferred over old reactive declarations.

## Architecture notes

- Frontend state is managed in src/lib/state/ — each store is a standalone .svelte.ts module.
- Tauri commands live in src-tauri/src/commands/.
- The editor (CodeMirror) is initialized in src/lib/editor/createEditor.ts.
- See README.md for the full project layout.

## Reporting issues

Report bugs and feature requests on the [Issues](https://github.com/MiaAI-Lab/slate/issues) page. Include:
- A clear title and description.
- Steps to reproduce.
- Screenshots or logs (logs are in %APPDATA%/com.slate.app/logs/).
- Your Slate version (from Settings or the installer filename).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.