import { invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import { tabsState } from './tabs.svelte'
import { settingsState } from './settings.svelte'
import { toast } from './toast.svelte'

interface Draft {
  id: string
  path: string | null
  title: string
  // Optional. Present for dirty tabs and untitled tabs (where content is the
  // only source of truth). Omitted for clean+saved tabs — restore re-reads
  // those from disk so external edits between sessions aren't shadowed by a
  // stale snapshot.
  content?: string | null
  pinned?: boolean
  dirty?: boolean
  viewMode?: 'editor' | 'preview' | 'split'
  // Tab order at write time. Lower = earlier. Reconstructs original ordering.
  order?: number
  // Marks the tab that was focused at write time. Exactly one draft should
  // carry this; if none do, restore focuses the first tab.
  active?: boolean
}

// Snapshot of the last-written payload per tab id, keyed by serialized draft.
// Avoids re-writing identical content every 5s and covers all metadata
// (pinned, viewMode, active, order) — not just content.
const lastWritten = new Map<string, string>()

// Spawned secondary windows (File > New window) are "fresh workspaces" by
// design — they skip restore and must also skip writes, otherwise their
// tabs would silently merge into the primary window's session on next
// launch. Resolved once at module load; URL doesn't change after that.
const isSpawnedWindow = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('spawned')

// Guard against re-entry: HMR can re-run init callsites; without this, drafts
// would be re-restored as duplicate tabs on every code edit during dev.
let sessionInitialized = false

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try { return await invoke<T>(cmd, args) }
  catch (e) { console.warn('[session] safeInvoke failed:', cmd, e); return null }
}

async function readFromDisk(path: string): Promise<{ content: string; title: string } | null> {
  try {
    const content = await invoke<string>('read_file', { path })
    const title = await basename(path)
    return { content, title }
  } catch {
    return null
  }
}

export async function initSession(): Promise<void> {
  if (sessionInitialized) return
  sessionInitialized = true
  if (!settingsState.values.restoreSession) return
  const drafts = await safeInvoke<Draft[]>('list_drafts')
  if (!drafts || drafts.length === 0) return

  // Sort by stored order; ties (legacy drafts without `order`) fall back to
  // load order from the directory listing.
  const sorted = [...drafts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  const seenIds = new Set<string>()
  let activeId: string | null = null
  let restoredUnsaved = 0
  let droppedPaths = 0

  for (const d of sorted) {
    // Defensive: two drafts colliding on the same id (manual edit / corruption
    // on disk) would otherwise both insert tabs sharing the same id, and
    // closing one would destroy the other via stateByTab.delete.
    if (seenIds.has(d.id)) continue
    seenIds.add(d.id)

    const isDirty = d.dirty ?? (d.content != null)
    let content = d.content ?? ''
    let title = d.title

    // For clean+saved tabs, content was omitted — re-read from disk. If the
    // file is gone or unreadable, drop the tab silently and prune from
    // recents so the next session doesn't keep tripping on it.
    if (!isDirty && d.path && (d.content == null || d.content === '')) {
      const fresh = await readFromDisk(d.path)
      if (!fresh) {
        droppedPaths++
        settingsState.removeRecent(d.path)
        await safeInvoke('clear_draft', { id: d.id })
        continue
      }
      content = fresh.content
      title = fresh.title
    }

    // Reuse the draft's id as the tab id so future sweeps overwrite the
    // SAME draft file. Without this, the old draft file is orphaned and
    // gets re-restored on every relaunch, multiplying tabs over time.
    const id = tabsState.newTab({
      id: d.id,
      path: d.path,
      title,
      content,
      pinned: d.pinned ?? false,
      dirty: isDirty,
      viewMode: d.viewMode ?? 'editor',
      // Restored tabs must not grab focus on launch — the user didn't just
      // create them. The active tab will still be focused organically once
      // the user clicks anywhere, and the editor is keyboard-reachable via
      // tab navigation.
      pendingFocus: false,
    })
    // Snapshot what's now on disk so the next sweep doesn't immediately
    // re-write an identical draft.
    lastWritten.set(id, serializeDraft({
      id: d.id,
      path: d.path,
      title,
      content: isDirty ? content : null,
      pinned: d.pinned ?? false,
      dirty: isDirty,
      viewMode: d.viewMode ?? 'editor',
      order: d.order ?? 0,
      active: d.active ?? false,
    }))

    if (d.active) activeId = id
    if (isDirty && d.path) restoredUnsaved++
  }

  if (activeId) tabsState.activeId = activeId
  if (restoredUnsaved > 0) {
    toast.info('Restored unsaved changes', `${restoredUnsaved} ${restoredUnsaved === 1 ? 'tab' : 'tabs'}`)
  }
  if (droppedPaths > 0) {
    toast.info('Skipped missing files', `${droppedPaths} ${droppedPaths === 1 ? 'file' : 'files'} no longer found`)
  }

  // Start watching restored tabs for external changes.
  for (const tab of tabsState.tabs) {
    if (tab.path) {
      invoke('watch_file', { path: tab.path, content: tab.content }).catch(() => {})
    }
  }
}

// Re-entrancy guard for the autosave sweep. setInterval at 5s can fire again
// before the previous sweep finishes on slow disks; without this guard, two
// sweeps would interleave reads/writes of `lastWritten` and produce torn
// state (e.g. a tab cleaned mid-write would get re-cleared by the next pass).
let sweeping = false

function serializeDraft(d: Draft): string {
  // Deterministic key order for stable comparisons in lastWritten.
  return JSON.stringify({
    id: d.id,
    path: d.path,
    title: d.title,
    content: d.content ?? null,
    pinned: !!d.pinned,
    dirty: !!d.dirty,
    viewMode: d.viewMode ?? 'editor',
    order: d.order ?? 0,
    active: !!d.active,
  })
}

export async function runDraftSweep(): Promise<void> {
  if (sweeping) return
  // Spawned windows must not write — see comment on isSpawnedWindow above.
  if (isSpawnedWindow) return
  sweeping = true
  try {
    // Setting turned off — clear everything and bail. Crash recovery for
    // unsaved work is part of this same toggle, so the user accepted that
    // trade-off when disabling "Restore tabs on launch".
    if (!settingsState.values.restoreSession) {
      for (const id of [...lastWritten.keys()]) {
        await safeInvoke('clear_draft', { id })
        lastWritten.delete(id)
      }
      return
    }

    const liveIds = new Set<string>()
    for (let i = 0; i < tabsState.tabs.length; i++) {
      const tab = tabsState.tabs[i]
      liveIds.add(tab.id)
      const isActive = tabsState.activeId === tab.id
      // Untitled tabs (no path) are always treated as content-bearing — they
      // have no disk file to fall back to on restore.
      const includeContent = tab.dirty || !tab.path
      const draft: Draft = {
        id: tab.id,
        path: tab.path,
        title: tab.title,
        content: includeContent ? tab.content : null,
        pinned: tab.pinned,
        dirty: tab.dirty,
        viewMode: tab.viewMode,
        order: i,
        active: isActive,
      }
      const key = serializeDraft(draft)
      if (lastWritten.get(tab.id) === key) continue
      await safeInvoke('write_draft', { draft })
      lastWritten.set(tab.id, key)
    }

    // Clear drafts for tabs that have been closed since the last sweep.
    for (const id of [...lastWritten.keys()]) {
      if (liveIds.has(id)) continue
      await safeInvoke('clear_draft', { id })
      lastWritten.delete(id)
    }
  } finally {
    sweeping = false
  }
}

export async function clearDraftFor(id: string): Promise<void> {
  await safeInvoke('clear_draft', { id })
  lastWritten.delete(id)
}
