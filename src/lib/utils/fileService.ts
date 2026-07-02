import { open, save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import { tabsState } from '$lib/state/tabs.svelte'
import { settingsState } from '$lib/state/settings.svelte'
import { confirmDialog, type CloseChoice as DialogChoice } from '$lib/state/confirmDialog.svelte'
import { toast } from '$lib/state/toast.svelte'
import { runDraftSweep } from '$lib/state/session.svelte'
import { formatTables } from '$lib/editor/tableExtension'
import type { Tab } from '../../types'
import { mtimeDelete } from '$lib/state/mtimeCache.svelte'

const MD_EXT = ['md', 'markdown', 'mdx']
const TEXT_EXT = ['txt', 'log', 'json', 'yaml', 'yml', 'toml', 'csv', 'tsv', 'ini', 'cfg', 'env', 'sh', 'bat', 'ps1', 'js', 'ts', 'jsx', 'tsx', 'svelte', 'css', 'scss', 'html', 'xml', 'rs', 'py', 'go', 'java', 'c', 'h', 'cpp', 'hpp', 'rb', 'php', 'lua', 'sql']

export function isMarkdownPath(path: string | null): boolean {
  if (!path) return true // untitled tabs default to markdown
  const m = /\.([^./\\]+)$/.exec(path)
  if (!m) return false
  return MD_EXT.includes(m[1].toLowerCase())
}

export async function openFile(): Promise<{ path: string; content: string; title: string } | null> {
  await invoke('prepare_open_dialog').catch(() => {})
  const picked = await open({
    filters: [
      { name: 'All files', extensions: ['*'] },
      { name: 'Markdown', extensions: MD_EXT },
      { name: 'Text', extensions: [...MD_EXT, ...TEXT_EXT] },
    ],
    multiple: false,
  })
  invoke('dialog_done').catch(() => {})
  const path = typeof picked === 'string' ? picked : null
  if (!path) return null
  try {
    const content = await invoke<string>('read_file', { path })
    const title = await basename(path)
    return { path, content, title }
  } catch (e) {
    toast.error('Open failed', String(e))
    return null
  }
}

export async function readPath(path: string): Promise<{ path: string; content: string; title: string }> {
  const content = await invoke<string>('read_file', { path })
  const title = await basename(path)
  return { path, content, title }
}

export async function saveFile(path: string, content: string): Promise<void> {
  await invoke('write_file', { path, content })
}

export async function saveFileAs(content: string, defaultName = 'untitled.md'): Promise<{ path: string; title: string } | null> {
  const extMatch = /\.([^./\\]+)$/.exec(defaultName)
  const ext = extMatch ? extMatch[1].toLowerCase() : 'md'
  const filters = MD_EXT.includes(ext)
    ? [{ name: 'Markdown', extensions: MD_EXT }, { name: 'All files', extensions: ['*'] }]
    : [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }]
  const picked = await save({ filters, defaultPath: defaultName })
  const path = typeof picked === 'string' ? picked : null
  if (!path) return null
  await invoke('write_file', { path, content })
  return { path, title: await basename(path) }
}

export async function openAndFocus() {
  const result = await openFile()
  if (!result) return
  const existing = tabsState.tabs.find(t => t.path === result.path)
  if (existing) {
    tabsState.activeId = existing.id
    return
  }
  const id = tabsState.newTab()
  tabsState.loadContent(id, result.content, result.path, result.title)
  settingsState.addRecent(result.path)
  const isNet = await invoke<boolean>('get_path_info', { path: result.path })
  tabsState.setNetworkPath(id, isNet)
  invoke('watch_file', { path: result.path, content: result.content }).catch(() => {})
}

export async function openPathInTab(path: string) {
  const existing = tabsState.tabs.find(t => t.path === path)
  if (existing) {
    tabsState.activeId = existing.id
    return existing.id
  }
  try {
    const r = await readPath(path)
    const id = tabsState.newTab()
    tabsState.loadContent(id, r.content, r.path, r.title)
    settingsState.addRecent(r.path)
    const isNet = await invoke<boolean>('get_path_info', { path: r.path })
    tabsState.setNetworkPath(id, isNet)
    invoke('watch_file', { path: r.path, content: r.content }).catch(() => {})
    return id
  } catch (e) {
    settingsState.removeRecent(path)
    toast.error('Open failed', String(e))
    return null
  }
}

function shouldAlignTables(path: string | null): boolean {
  return settingsState.values.tableAutoFormat.alignOnSave && isMarkdownPath(path)
}

export async function saveActive(tab: Tab): Promise<boolean> {
  if (!tab.path) {
    return saveActiveAs(tab)
  }
  try {
    const out = shouldAlignTables(tab.path) ? formatTables(tab.content) : tab.content
    await saveFile(tab.path, out)
    if (out !== tab.content) {
      // Push the reformatted content back into the tab; the editor's
      // syncFromStoreIfDiverged effect picks it up via the tab.content change.
      tabsState.updateContent(tab.id, out)
    }
    tabsState.setDirty(tab.id, false)
    tabsState.setExternallyChanged(tab.id, false)
    // Eagerly re-write the draft as clean (drops stored content, flips dirty
    // flag) so a crash within the next sweep window doesn't restore stale
    // unsaved-changes state.
    runDraftSweep().catch(() => {})
    return true
  } catch (e) {
    toast.error('Save failed', String(e))
    return false
  }
}

export async function saveActiveAs(tab: Tab): Promise<boolean> {
  try {
    // If the title already has any extension, keep it. Otherwise default to .md.
    const defaultName = /\.[^./\\]+$/.test(tab.title) ? tab.title : `${tab.title}.md`
    const result = await saveFileAs(tab.content, defaultName)
    if (!result) return false
    // Re-save with table alignment if the chosen extension is markdown.
    let finalContent = tab.content
    if (shouldAlignTables(result.path)) {
      const formatted = formatTables(tab.content)
      if (formatted !== tab.content) {
        await saveFile(result.path, formatted)
        tabsState.updateContent(tab.id, formatted)
        finalContent = formatted
      }
    }
    // Stop watching old path, start watching new one.
    if (tab.path) {
      invoke('unwatch_file', { path: tab.path }).catch(() => {})
      mtimeDelete(tab.path)
    }
    tabsState.setPath(tab.id, result.path, result.title)
    tabsState.setExternallyChanged(tab.id, false)
    settingsState.addRecent(result.path)
    const isNet = await invoke<boolean>('get_path_info', { path: result.path })
    tabsState.setNetworkPath(tab.id, isNet)
    invoke('watch_file', { path: result.path, content: finalContent }).catch(() => {})
    // See note in saveActive: re-write the draft eagerly so the new path
    // is reflected on disk before the next sweep tick.
    runDraftSweep().catch(() => {})
    return true
  } catch (e) {
    toast.error('Save failed', String(e))
    return false
  }
}

export type CloseChoice = DialogChoice

export async function confirmCloseTab(tab: Tab): Promise<CloseChoice> {
  if (!tab.dirty && !tab.externallyChanged) return 'discard'
  const parts: string[] = []
  if (tab.dirty) parts.push('unsaved changes')
  if (tab.externallyChanged) parts.push('external changes on disk')
  const reason = parts.join(' and ')
  return confirmDialog.confirmClose(
    'Close tab?',
    `${tab.title} has ${reason}. Close without saving?`,
  )
}

export async function closeTabById(id: string): Promise<boolean> {
  const tab = tabsState.tabs.find(t => t.id === id)
  if (!tab) return true
  const choice = await confirmCloseTab(tab)
  if (choice === 'cancel') return false
  if (choice === 'save') {
    const ok = await saveActive(tab)
    if (!ok) return false
  }
  if (tab.path) {
    invoke('unwatch_file', { path: tab.path }).catch(() => {})
    mtimeDelete(tab.path)
  }
  tabsState.closeTab(id)
  if (tabsState.tabs.length === 0) tabsState.newTab()
  return true
}

export async function closeActiveWithGuard(): Promise<void> {
  const tab = tabsState.activeTab
  if (!tab) return
  await closeTabById(tab.id)
}

export async function closeOtherTabs(keepId: string): Promise<void> {
  const ids = tabsState.tabs.filter(t => t.id !== keepId && !t.pinned).map(t => t.id)
  for (const id of ids) {
    const ok = await closeTabById(id)
    if (!ok) return
  }
}

export async function closeAllTabs(): Promise<void> {
  const ids = tabsState.tabs.filter(t => !t.pinned).map(t => t.id)
  for (const id of ids) {
    const ok = await closeTabById(id)
    if (!ok) return
  }
}

export async function closeAllTabsDiscardAll(): Promise<void> {
  const targets = tabsState.tabs.filter(t => !t.pinned)
  if (targets.length === 0) return
  const dirtyCount = targets.filter(t => t.dirty).length
  const message = dirtyCount > 0
    ? `Close all ${targets.length} tabs without saving? ${dirtyCount} unsaved ${dirtyCount === 1 ? 'change' : 'changes'} will be lost.`
    : `Close all ${targets.length} tabs?`
  const ok = await confirmDialog.confirm('Close all without saving', message, {
    confirmLabel: 'Close all',
    cancelLabel: 'Cancel',
    danger: true,
  })
  if (!ok) return
  // Force-clean each unpinned tab so closeTab() doesn't re-prompt, then close.
  // Pinned tabs are excluded — they survive "Close all without saving".
  const ids = targets.map(t => t.id)
  for (const id of ids) {
    const tab = tabsState.tabs.find(t => t.id === id)
    if (tab?.path) mtimeDelete(tab.path)
    tabsState.setDirty(id, false)
    tabsState.closeTab(id)
  }
  if (tabsState.tabs.length === 0) tabsState.newTab()
}

export async function exitApp(): Promise<void> {
  // Triggers the onCloseRequested handler in App.svelte which prompts
  // for any unsaved changes across all tabs.
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch (e) {
    toast.error('Exit failed', String(e))
  }
}

export async function openNewWindow(): Promise<void> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const label = `main-${Date.now()}`
    // `?spawned=1` tells main.ts to skip draft restoration in this window so
    // the same drafts don't get opened in every new window.
    //
    // Build the URL from the current window's origin. Under `tauri dev` the
    // frontend is served from a Vite dev server (e.g. http://localhost:1420/);
    // in prod it's `tauri://localhost/`. A bare `index.html?spawned=1` would
    // not resolve correctly in dev, so derive the base from window.location.
    const base = window.location.origin + window.location.pathname.replace(/[^/]*$/, '')
    const url = `${base}index.html?spawned=1`
    const w = new WebviewWindow(label, {
      url,
      title: 'Slate',
      width: 1200,
      height: 800,
      minWidth: 700,
      minHeight: 500,
      dragDropEnabled: true,
    })
    w.once('tauri://error', (e) => {
      toast.error('New window failed', String((e as { payload?: unknown }).payload ?? e))
    })
  } catch (e) {
    toast.error('New window failed', String(e))
  }
}
