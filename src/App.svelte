<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte'
  import TabBar from '$lib/components/TabBar.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import Editor from '$lib/components/Editor.svelte'
  import Preview from '$lib/components/Preview.svelte'
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte'
  import SettingsDialog from '$lib/components/SettingsDialog.svelte'
  import SearchPanel from '$lib/components/SearchPanel.svelte'
  import Toaster from '$lib/components/Toaster.svelte'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { settingsState, applyTheme, applyAccent, applyMenuBrightness, applyPinColor, resolvedDark } from '$lib/state/settings.svelte'
  import { settingsDialog } from '$lib/state/settingsDialog.svelte'
  import { searchPanel } from '$lib/state/searchPanel.svelte'
  import { runDraftSweep } from '$lib/state/session.svelte'
  import { syncFullscreenState, toggleFullscreen, windowState } from '$lib/state/windowState.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import {
    openAndFocus,
    saveActive,
    saveActiveAs,
    confirmCloseTab,
    openPathInTab,
    closeActiveWithGuard,
    openNewWindow,
    isMarkdownPath,
  } from '$lib/utils/fileService'
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import { debugLog } from '$lib/utils/debug'
  import { mtimeGet, mtimeSet, mtimeClear } from '$lib/state/mtimeCache.svelte'

  const mode = $derived(tabsState.activeTab?.viewMode ?? 'editor')

  // Non-markdown tabs can only be in 'editor'.
  $effect(() => {
    const t = tabsState.activeTab
    if (!t) return
    if (!isMarkdownPath(t.path) && t.viewMode !== 'editor') {
      tabsState.setViewMode(t.id, 'editor')
    }
  })

  // Session bootstrap (initSession + tab fallback) runs in main.ts before
  // mount, so here we just start the autosave sweep.
  $effect(() => {
    const id = window.setInterval(() => { runDraftSweep().catch(() => {}) }, 5000)
    return () => window.clearInterval(id)
  })

  // Detect external file changes and offer to reload.
  $effect(() => {
    const unlisten = listen<{ path: string }>('file-changed-externally', (event) => {
      const tab = tabsState.getTabByPath(event.payload.path)
      if (!tab) return
      if (tab.isNetworkPath) return
      tabsState.setExternallyChanged(tab.id, true)
      toast.fileChanged(tab.id, tab.title)
    })
    return () => unlisten.catch(() => {})
  })

  // Poll file mtimes as a fallback for file-watch events that may be missed
  // on Windows (ReadDirectoryChangesW buffer overflow, rapid writes, etc.).
  // Keyed by absolute path so two tabs pointing at the same file share one
  // cache entry — avoids redundant syscalls and prevents a stale tab entry
  // from spuriously re-triggering.
  // When mtime changes, content is read and compared — on network/SMB drives
  // mtime can shift without content changing (metadata refresh, antivirus scan,
  // NTP skew, etc.), so content comparison is the only reliable check.
  $effect(() => {
    const id = window.setInterval(async () => {
      for (const tab of tabsState.tabs) {
        if (!tab.path || tab.externallyChanged) continue
        if (tab.isNetworkPath) continue
        try {
          const mtime = await invoke<number>('file_mtime', { path: tab.path })
          const cacheKey = tab.path
          const prev = mtimeGet(cacheKey)
          // Require at least a 2-second mtime jump before even reading content.
          // On remote network / SMB drives, timestamp precision can be coarse
          // (2-second FAT-resolution on some NAS devices) or fluctuate slightly
          // due to NTP skew between client and server. This guards against
          // unnecessary file reads on every poll cycle.
          if (prev !== undefined && mtime > prev + 1) {
            // Verify content actually changed — mtime alone is unreliable on
            // network drives (metadata refresh, antivirus, indexing, etc.).
            const current = await invoke<string>('read_file', { path: tab.path })
            if (current !== tab.content) {
              tabsState.setExternallyChanged(tab.id, true)
              toast.fileChanged(tab.id, tab.title)
            }
          }
          mtimeSet(cacheKey, mtime)
        } catch {
          // File may have been deleted or become inaccessible
        }
      }
    }, 4000)
    return () => { clearInterval(id); mtimeClear() }
  })

  // Apply theme settings (initSettings already applied once; reapply on user changes).
  $effect(() => {
    applyTheme(settingsState.values.theme)
  })

  $effect(() => {
    applyAccent(settingsState.values.accentColor)
  })

  $effect(() => {
    applyPinColor(settingsState.values.pinnedTabs)
  })

  // applyMenuBrightness depends on the .dark class being correct, so it runs
  // after applyTheme. Reading both deps here keeps it reactive to either.
  $effect(() => {
    // Touch theme to retrigger on theme change.
    void settingsState.values.theme
    applyMenuBrightness(settingsState.values.menuTextBrightness)
  })

  $effect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(settingsState.values.theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  })

  // Auto-adjust editor text color when switching between light and dark themes.
  $effect(() => {
    const dark = resolvedDark(settingsState.values.theme)
    settingsState.values.typography.editorTextColor = dark ? '#dbdbdb' : '#1a1a1a'
  })

  // CSS variable typography
  $effect(() => {
    const t = settingsState.values.typography
    const el = document.documentElement
    el.style.setProperty('--font-editor', t.editorFont)
    el.style.setProperty('--font-preview', t.previewFont)
  })

  // Window title sync (Phase 12.1, useful for orientation in dev too).
  $effect(() => {
    const t = tabsState.activeTab
    const dirty = t?.dirty ? ' •' : ''
    const name = t?.title ?? 'Slate'
    document.title = `${name}${dirty} - Slate`
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().setTitle(`${name}${dirty} - Slate`).catch(() => {})
    }).catch(() => {})
  })

  // Sync fullscreen state once on mount and on every window resize.
  onMount(() => {
    syncFullscreenState()
    let unlisten: (() => void) | null = null
    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        unlisten = await getCurrentWindow().onResized(() => { syncFullscreenState() })
      } catch {}
    })()
    return () => unlisten?.()
  })

  // Global keyboard shortcuts.
  $effect(() => {
    const handler = async (e: KeyboardEvent) => {
      // Shift+F11 toggles devtools. Hidden shortcut, no menu entry. Only
      // does anything when the Rust crate is built with the `devtools`
      // feature; otherwise the call is a no-op and we fall through silently.
      if (e.code === 'F11' && e.shiftKey) {
        e.preventDefault()
        try {
          const { getCurrentWebview } = await import('@tauri-apps/api/webview')
          const wv = getCurrentWebview() as unknown as { isDevtoolsOpen?: () => Promise<boolean>; openDevtools?: () => Promise<void>; closeDevtools?: () => Promise<void> }
          const open = (await wv.isDevtoolsOpen?.()) ?? false
          if (open) await wv.closeDevtools?.()
          else await wv.openDevtools?.()
        } catch {}
        return
      }
      // F11 toggles fullscreen — no modifier required.
      if (e.code === 'F11') {
        e.preventDefault()
        toggleFullscreen()
        return
      }
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      // Allow CodeMirror to handle Ctrl+F / Ctrl+H / Ctrl+G when focus is inside the editor.
      const target = e.target as HTMLElement | null
      const inCm = target?.closest?.('.cm-editor') != null
      // If focus is inside the floating Search panel's inputs, let its own
      // onKeydown handler run — otherwise Ctrl+F inside the find input would
      // be re-captured here and immediately close the panel the user just
      // opened.

      // Use e.code (physical key position) rather than e.key (produced
      // character) so shortcuts work on non-Latin layouts (Hebrew, Cyrillic,
      // etc.) where e.key for the W key would be a Hebrew letter, not 'w'.
      const code = e.code
      if ((code === 'KeyN' || code === 'KeyT') && !e.shiftKey) {
        e.preventDefault(); tabsState.newTab()
      } else if (code === 'KeyN' && e.shiftKey) {
        e.preventDefault(); openNewWindow()
      } else if (code === 'KeyO' && !e.shiftKey) {
        e.preventDefault(); openAndFocus()
      } else if (code === 'KeyS' && !e.shiftKey) {
        e.preventDefault()
        const tab = tabsState.activeTab; if (tab) await saveActive(tab)
      } else if (code === 'KeyS' && e.shiftKey) {
        e.preventDefault()
        const tab = tabsState.activeTab; if (tab) await saveActiveAs(tab)
      } else if (code === 'KeyW') {
        e.preventDefault(); closeActiveWithGuard()
      } else if (code === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) tabsState.cyclePrev(); else tabsState.cycleNext()
      } else if (code === 'KeyF') {
        // Ctrl+F (and Ctrl+Shift+F) open / focus our slide-in Search panel,
        // NOT CodeMirror's built-in mini search. Capture phase makes us win.
        e.preventDefault()
        if (searchPanel.open) {
          // Already open — focus the find input instead of toggling closed.
          // The user pressed Ctrl+F intending to search, not to dismiss.
          searchPanel.focusRequest++
          return
        }
        const sel = window.getSelection()
        const prefill = sel && !sel.isCollapsed ? sel.toString() : ''
        searchPanel.show(prefill)
      } else if (code === 'KeyH' && !e.shiftKey) {
        // Ctrl+H = open/focus search panel (search-and-replace lives there too).
        e.preventDefault()
        if (searchPanel.open) {
          searchPanel.focusRequest++
          return
        }
        const sel = window.getSelection()
        const prefill = sel && !sel.isCollapsed ? sel.toString() : ''
        searchPanel.show(prefill)
      } else if (code === 'Comma') {
        e.preventDefault(); settingsDialog.toggle()
      } else if (code === 'KeyP' && !e.shiftKey) {
        e.preventDefault()
        const tab = tabsState.activeTab
        if (tab) (await import('$lib/utils/exportService')).printActive(tab.title, tab.content).catch((err) => toast.error('Print failed', String(err)))
      } else if (code === 'Equal') {
        // Ctrl+= / Ctrl++ zooms in.
        e.preventDefault()
        const t = settingsState.values.typography
        t.editorFontSize = Math.min(24, t.editorFontSize + 1)
        t.previewFontSize = Math.min(28, t.previewFontSize + 1)
      } else if (code === 'Minus') {
        e.preventDefault()
        const t = settingsState.values.typography
        t.editorFontSize = Math.max(10, t.editorFontSize - 1)
        t.previewFontSize = Math.max(10, t.previewFontSize - 1)
      } else if (code === 'Digit0') {
        e.preventDefault()
        // Ctrl+0 resets both to the defaults.
        settingsState.values.typography.editorFontSize = 16
        settingsState.values.typography.previewFontSize = 16
      } else if (!inCm && /^Digit[1-9]$/.test(code)) {
        e.preventDefault(); tabsState.jumpTo(Number(code.slice(5)))
      }
    }
    // Capture phase so our shortcuts win over CodeMirror's built-in keymap
    // (Ctrl+F, Ctrl+H would otherwise open CM's in-editor mini search).
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  })

  // Drag-and-drop file open.
  onMount(() => {
    let unlistenFn: (() => void) | null = null
    let unlistenClose: (() => void) | null = null

    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        unlistenFn = await getCurrentWebview().onDragDropEvent(async (event) => {
          if (event.payload.type !== 'drop') return
          for (const path of event.payload.paths) {
            // Handle image drops — save to assets/ and insert markdown.
            // Editor.svelte listens for this custom event.
            if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) {
              window.dispatchEvent(new CustomEvent('slate-drop-image', { detail: { path } }))
              continue
            }
            // Skip other obvious binary extensions; let read_file decide for the rest.
            if (/\.(exe|dll|so|dylib|zip|tar|gz|7z|rar|pdf|bmp|ico|mp3|mp4|avi|mov|mkv|wav|flac|ttf|otf|woff2?)$/i.test(path)) continue
            try { await openPathInTab(path) } catch (err) { console.error(err) }
          }
        })
      } catch {}

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        unlistenClose = await getCurrentWindow().onCloseRequested(async (event) => {
          // With session restore on, unsaved tabs are persisted as drafts and
          // come back exactly as they were on next launch. App-close is then
          // non-destructive, so skip the per-tab save prompt entirely — it
          // only fires when the user explicitly closes a single tab (X /
          // context menu / Ctrl+W → closeTabById).
          if (settingsState.values.restoreSession) {
            await runDraftSweep().catch(() => {})
            return
          }
          // Restore disabled → no safety net for unsaved work, fall back to
          // the legacy per-tab confirmation flow.
          const dirty = tabsState.tabs.filter(t => t.dirty || t.externallyChanged)
          if (dirty.length === 0) return
          event.preventDefault()
          for (const tab of dirty) {
            const choice = await confirmCloseTab(tab)
            if (choice === 'cancel') return
            if (choice === 'save') {
              const ok = await saveActive(tab)
              if (!ok) return
            } else {
              tabsState.setDirty(tab.id, false)
            }
          }
          getCurrentWindow().close().catch(() => {})
        })
      } catch {}
    })()

    return () => {
      unlistenFn?.()
      unlistenClose?.()
    }
	  })
	
		  // --- BEGIN scroll-position diagnostic ---
		  let _prevId: string | null = null
		  $effect(() => {
		    const id = tabsState.activeTab?.id ?? null
		    if (id !== _prevId) {
		      debugLog('[App] activeTab:', _prevId, '->', id, 'tabs.length:', tabsState.tabs.length, 'activeId:', tabsState.activeId)
		      _prevId = id
		    }
		  })
		  // --- END scroll-position diagnostic ---
	</script>

<div class="flex flex-col h-screen w-screen">
  {#if !windowState.fullscreen}
    <Toolbar />
    <TabBar />
  {/if}
	  <div class="flex-1 overflow-hidden min-h-0 relative">
	    <div
	      class="grid h-full w-full"
	      class:hidden={!tabsState.activeTab}
	      class:grid-cols-2={mode === 'split'}
	      class:grid-cols-1={mode !== 'split'}
	    >
	      <div class="h-full overflow-hidden min-h-0" class:hidden={mode === 'preview'}>
	        <Editor />
	      </div>
	      <div
	        class="h-full overflow-hidden min-h-0"
	        class:hidden={mode === 'editor'}
	        style="border-left: 1px solid var(--border);"
	      >
	        <Preview />
	      </div>
	    </div>
	    <SearchPanel />
	  </div>
  {#if settingsState.values.showStatusBar}
    <StatusBar />
  {/if}
</div>

<ConfirmDialog />
<SettingsDialog />
<Toaster />
