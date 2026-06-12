# Security Policy

## Reporting a vulnerability

Slate is a local-first desktop application. It does **not** communicate with any cloud service or send telemetry.

If you discover a security vulnerability — especially one involving file-system access, cross-site scripting through the Markdown preview, or unsafe deserialization in the export path — please report it privately.

**Do not report security vulnerabilities via public GitHub issues.**

Instead, send a detailed report to the maintainer via email or direct message. Provide:
- A description of the vulnerability.
- Steps to reproduce.
- The affected version(s).
- Any potential impact (local file read, XSS, etc.).

## What to expect

- You will receive an acknowledgment within 48 hours.
- The issue will be investigated and a fix prepared for the next release.
- You will be credited in the release notes (unless you prefer to remain anonymous).

## Scope

- **In scope**: The Rust backend (src-tauri/), the frontend editor (src/), the build/installer pipeline.
- **Out of scope**: Transitive npm/Cargo dependencies (please report those to the respective maintainers).

## Safe harbor

We will not pursue legal action against researchers who follow this policy and act in good faith.