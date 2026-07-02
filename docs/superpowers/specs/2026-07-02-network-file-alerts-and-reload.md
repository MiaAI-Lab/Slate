# Network File Alerts Suppression & Tab Reload

## Problem

1. "File changed on disk" alerts fire spuriously on network/SMB drives due to metadata refreshes, antivirus scans, and NTP skew — despite existing mitigations (startup grace period, content comparison).
2. Users need a manual "Reload" option to re-read a file from disk on demand.

## Solution Overview

Two features:

1. **Suppress external-change alerts for network files** — detect UNC paths and mapped network drives, skip both the native watcher event and the mtime polling fallback for those tabs.
2. **Add "Reload" to the tab context menu** — manually re-read the file from disk, with a confirmation dialog if the tab has unsaved changes.

## Architecture

### 1. Network Path Detection (Rust)

**Module:** `src-tauri/src/path_info.rs`

A single public function:

```rust
pub fn is_network_path(path: &str) -> bool;
```

Logic:
- If `path` starts with `\\` → UNC path → return `true`.
- If `path` matches `X:\...` (drive letter) → call `GetDriveTypeW` on Windows → return `true` if `DRIVE_REMOTE`.
- Otherwise → return `false`.

**Tauri command:** `get_path_info(path: String) -> bool` registered in `lib.rs`.

### 2. Tab Model

**File:** `src/types.ts`

Add optional field to `Tab`:

```typescript
isNetworkPath?: boolean
```

### 3. File Open Flow

**File:** `src/lib/utils/fileService.ts`

When a file is opened (in `openFile` or equivalent), call `invoke('get_path_info', { path })` and set `tab.isNetworkPath` on the newly created tab.

### 4. Suppress External Change Alerts

**File:** `src/App.svelte`

Two gating points:

- **Watcher event handler** (`file-changed-externally` listener): If `tab?.isNetworkPath === true`, skip setting `externallyChanged` and showing the toast.
- **Mtime polling interval** (4s interval checking `file_mtime`): If `tab.isNetworkPath === true`, skip the mtime check for that tab.

### 5. "Reload" Context Menu Item

**File:** `src/lib/components/TabBar.svelte`

Add a new menu item "Reload" in the context menu, placed after the Pin toggle and before the separator.

Behavior:
- Only visible for tabs with a `path` (not untitled/new tabs).
- On click:
  - If `tab.dirty === true`: show the existing confirm dialog with message "Reload file?" / "This file has unsaved changes. Reload from disk anyway?" (OK/Cancel mode). Pressing Enter confirms.
  - If `tab.dirty === false`: reload silently.
  - Reload action: `invoke('read_file', { path })` → `tabsState.loadContent(tab.id, content, path, title)`.

### 6. Confirm Dialog Enter Key Support

**File:** `src/lib/components/ConfirmDialog.svelte`

Add a `keydown` listener on the dialog overlay: pressing Enter triggers the confirm/OK button action.

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/path_info.rs` | **New** — `is_network_path()` function |
| `src-tauri/src/lib.rs` | Register `get_path_info` command |
| `src/types.ts` | Add `isNetworkPath` to `Tab` |
| `src/lib/utils/fileService.ts` | Call `get_path_info` on file open |
| `src/App.svelte` | Gate watcher event + mtime poll on `isNetworkPath` |
| `src/lib/components/TabBar.svelte` | Add "Reload" context menu item |
| `src/lib/components/ConfirmDialog.svelte` | Enter key support |

## Edge Cases

- **Untitled/new tabs** (no path): "Reload" is hidden; no network check needed.
- **File moved from local to network while open**: Won't be caught dynamically — user would need to close and reopen. Acceptable.
- **Mapped drive disconnected**: `GetDriveTypeW` may return `DRIVE_UNKNOWN`; treated as non-network (safe default — alerts may fire, but that's the conservative behavior).
- **Multiple tabs sharing the same network file**: Each tab independently stores `isNetworkPath`; consistent since they share the same path.
