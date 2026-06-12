<script lang="ts">
  import { fly } from 'svelte/transition'
  import { cubicOut } from 'svelte/easing'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { settingsState } from '$lib/state/settings.svelte'
  import { settingsDialog } from '$lib/state/settingsDialog.svelte'
  import { searchPanel } from '$lib/state/searchPanel.svelte'
  import { windowState, toggleFullscreen } from '$lib/state/windowState.svelte'
  import {
    openAndFocus,
    saveActive,
    saveActiveAs,
    openPathInTab,
    closeActiveWithGuard,
    exitApp,
    openNewWindow,
    isMarkdownPath,
  } from '$lib/utils/fileService'
  import { exportHTML, exportPDF, printActive } from '$lib/utils/exportService'

  let fileOpen = $state(false)
  let fileBtn = $state<HTMLButtonElement | undefined>()
  let recentSubOpen = $state(false)

  let viewOpen = $state(false)
  let viewBtn = $state<HTMLButtonElement | undefined>()

  let exportOpen = $state(false)
  let exportBtn = $state<HTMLButtonElement | undefined>()

  const mode = $derived(tabsState.activeTab?.viewMode ?? 'editor')
  const previewing = $derived(mode === 'preview')
  const splitting = $derived(mode === 'split')
  const hasActive = $derived(tabsState.activeTab != null)
  const isMd = $derived(isMarkdownPath(tabsState.activeTab?.path ?? null))
  const recents = $derived(settingsState.values.recentFiles)

  function setMode(m: 'editor' | 'preview' | 'split') {
    const tab = tabsState.activeTab
    if (tab) tabsState.setViewMode(tab.id, m)
  }

  function togglePreview() {
    const tab = tabsState.activeTab
    if (!tab || !isMd) return
    setMode(tab.viewMode === 'preview' ? 'editor' : 'preview')
  }

  function toggleSplit() {
    const tab = tabsState.activeTab
    if (!tab || !isMd) return
    setMode(tab.viewMode === 'split' ? 'editor' : 'split')
  }

  function closeFileMenu() {
    fileOpen = false
    recentSubOpen = false
  }

  async function doNew()      { closeFileMenu(); tabsState.newTab() }
  async function doNewWindow(){ closeFileMenu(); await openNewWindow() }
  async function doOpen()     { closeFileMenu(); await openAndFocus() }
  async function doSave()     { closeFileMenu(); const t = tabsState.activeTab; if (t) await saveActive(t) }
  async function doSaveAs()   { closeFileMenu(); const t = tabsState.activeTab; if (t) await saveActiveAs(t) }
  async function doClose()    { closeFileMenu(); await closeActiveWithGuard() }
  async function doExit()     { closeFileMenu(); await exitApp() }
  async function pickRecent(path: string) {
    closeFileMenu()
    try { await openPathInTab(path) } catch {}
  }

  function handleClickOutside(e: MouseEvent) {
    const t = e.target as Node
    if (fileOpen && fileBtn && !fileBtn.contains(t) && !(t instanceof HTMLElement && t.closest('[data-file-menu]'))) {
      closeFileMenu()
    }
    if (viewOpen && viewBtn && !viewBtn.contains(t) && !(t instanceof HTMLElement && t.closest('[data-view-menu]'))) {
      viewOpen = false
    }
    if (exportOpen && exportBtn && !exportBtn.contains(t) && !(t instanceof HTMLElement && t.closest('[data-export-menu]'))) {
      exportOpen = false
    }
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && (fileOpen || viewOpen || exportOpen)) {
      fileOpen = false
      viewOpen = false
      exportOpen = false
      recentSubOpen = false
    }
  }

  $effect(() => {
    document.addEventListener('keydown', onGlobalKeydown)
    return () => document.removeEventListener('keydown', onGlobalKeydown)
  })

  $effect(() => {
    if (fileOpen || viewOpen || exportOpen) {
      window.addEventListener('click', handleClickOutside)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  })

  async function doToggleFullscreen() {
    viewOpen = false
    await toggleFullscreen()
  }

  // When any top-level menu is already open, hovering a sibling button
  // should switch to that menu without requiring a click. Mimics the
  // standard OS menu-bar behavior.
  function hoverSwitch(target: 'file' | 'view' | 'export') {
    const anyOpen = fileOpen || viewOpen || exportOpen
    if (!anyOpen) return
    fileOpen = target === 'file'
    viewOpen = target === 'view'
    exportOpen = target === 'export'
    if (target !== 'file') recentSubOpen = false
  }

  async function doExportHTML() { exportOpen = false; const tab = tabsState.activeTab; if (tab) await exportHTML(tab.title, tab.content) }
  async function doExportPDF()  { exportOpen = false; const tab = tabsState.activeTab; if (tab) await exportPDF(tab.title, tab.content) }
  async function doPrint()      { exportOpen = false; const tab = tabsState.activeTab; if (tab) await printActive(tab.title, tab.content) }
</script>

<div
  class="flex items-center gap-1 px-2 h-10 border-b select-none"
  style="background: var(--bg-elev); border-color: var(--border);"
>
  <div class="relative">
    <button
      bind:this={fileBtn}
      class="tb-btn"
      onclick={(e) => { e.stopPropagation(); fileOpen = !fileOpen; if (!fileOpen) recentSubOpen = false; if (fileOpen) { viewOpen = false; exportOpen = false } }}
      onmouseenter={() => hoverSwitch('file')}
      title="File"
      aria-haspopup="menu"
      aria-expanded={fileOpen}
    >File ▾</button>
    {#if fileOpen}
      <div
        data-file-menu
        role="menu"
        class="absolute top-full left-0 mt-1 z-50 min-w-[240px] py-1 rounded shadow-lg border"
        style="background: var(--bg-elev); border-color: var(--border);"
        transition:fly={{ y: -4, duration: 140, easing: cubicOut }}
      >
        <button class="menu-item" role="menuitem" onclick={doNew}>
          <span>New tab</span><span class="kbd">Ctrl+N / Ctrl+T</span>
        </button>
        <button class="menu-item" role="menuitem" onclick={doNewWindow}>
          <span>New window</span><span class="kbd">Ctrl+Shift+N</span>
        </button>
        <button class="menu-item" role="menuitem" onclick={doOpen}>
          <span>Open…</span><span class="kbd">Ctrl+O</span>
        </button>
        <div
          class="menu-item recent-row"
          role="menuitem"
          tabindex="-1"
          onmouseenter={() => (recentSubOpen = true)}
          onmouseleave={() => (recentSubOpen = false)}
        >
          <span>Open Recent</span><span class="caret">▸</span>
          {#if recentSubOpen}
            <div
              data-file-menu
              role="menu"
              class="absolute left-full top-0 ml-0 z-50 min-w-[320px] max-w-[520px] py-1 rounded shadow-lg border"
              style="background: var(--bg-elev); border-color: var(--border);"
              transition:fly={{ x: -4, duration: 120, easing: cubicOut }}
            >
              {#if recents.length === 0}
                <div class="menu-empty">No recent files</div>
              {:else}
                {#each recents as path}
                  <button class="menu-item truncate" role="menuitem" title={path} onclick={() => pickRecent(path)}>
                    <span class="truncate">{path}</span>
                  </button>
                {/each}
                <div class="menu-sep"></div>
                <button class="menu-item" role="menuitem" onclick={() => { closeFileMenu(); settingsState.clearRecents() }}>
                  <span>Clear recent files</span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
        <div class="menu-sep"></div>
        <button class="menu-item" role="menuitem" onclick={doSave} disabled={!hasActive}>
          <span>Save</span><span class="kbd">Ctrl+S</span>
        </button>
        <button class="menu-item" role="menuitem" onclick={doSaveAs} disabled={!hasActive}>
          <span>Save As…</span><span class="kbd">Ctrl+Shift+S</span>
        </button>
        <div class="menu-sep"></div>
        <button class="menu-item" role="menuitem" onclick={doClose} disabled={!hasActive}>
          <span>Close</span><span class="kbd">Ctrl+W</span>
        </button>
        <button class="menu-item" role="menuitem" onclick={doExit}>
          <span>Exit</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="relative">
    <button
      bind:this={viewBtn}
      class="tb-btn"
      onclick={(e) => { e.stopPropagation(); viewOpen = !viewOpen; if (viewOpen) { fileOpen = false; exportOpen = false; recentSubOpen = false } }}
      onmouseenter={() => hoverSwitch('view')}
      title="View"
      aria-haspopup="menu"
      aria-expanded={viewOpen}
    >View ▾</button>
    {#if viewOpen}
      <div
        data-view-menu
        role="menu"
        class="absolute top-full left-0 mt-1 z-50 min-w-[240px] py-1 rounded shadow-lg border"
        style="background: var(--bg-elev); border-color: var(--border);"
        transition:fly={{ y: -4, duration: 140, easing: cubicOut }}
      >
        <button class="menu-item" role="menuitem" onclick={doToggleFullscreen}>
          <span>{windowState.fullscreen ? 'Exit Full Screen' : 'Enter Full Screen'}</span><span class="kbd">F11</span>
        </button>
      </div>
    {/if}
  </div>

  <div class="mx-2 h-6 w-px" style="background: var(--border);"></div>

  <button
    class="tb-btn toggle"
    class:on={previewing}
    onclick={togglePreview}
    title={isMd ? (previewing ? 'Switch to editor' : 'Switch to preview') : 'Preview (Markdown only)'}
    disabled={!isMd || !hasActive}
    aria-pressed={previewing}
  >Preview</button>

  <button
    class="tb-btn toggle"
    class:on={splitting}
    onclick={toggleSplit}
    title={isMd ? 'Split editor + preview' : 'Split (Markdown only)'}
    disabled={!isMd || !hasActive}
    aria-pressed={splitting}
  >Split</button>

  <div class="mx-2 h-6 w-px" style="background: var(--border);"></div>

  <div class="relative">
    <button
      bind:this={exportBtn}
      class="tb-btn"
      onclick={(e) => { e.stopPropagation(); exportOpen = !exportOpen; if (exportOpen) { fileOpen = false; viewOpen = false; recentSubOpen = false } }}
      onmouseenter={() => hoverSwitch('export')}
      title="Export"
      aria-haspopup="menu"
      aria-expanded={exportOpen}
      disabled={!hasActive}
    >Export ▾</button>
    {#if exportOpen}
      <div
        data-export-menu
        role="menu"
        class="absolute top-full left-0 mt-1 z-50 min-w-[220px] py-1 rounded shadow-lg border"
        style="background: var(--bg-elev); border-color: var(--border);"
        transition:fly={{ y: -4, duration: 140, easing: cubicOut }}
      >
        <button class="menu-item" role="menuitem" onclick={doExportHTML}><span>Export as HTML…</span></button>
        <button class="menu-item" role="menuitem" onclick={doExportPDF}><span>Export as PDF…</span></button>
        <button class="menu-item" role="menuitem" onclick={doPrint}>
          <span>Print</span><span class="kbd">Ctrl+P</span>
        </button>
      </div>
    {/if}
  </div>

  <button class="tb-btn" onclick={() => searchPanel.toggle()} title="Find (Ctrl+Shift+F)">Find</button>

  <div class="flex-1"></div>

  <button class="tb-btn settings-btn" onclick={() => settingsDialog.show()} title="Settings" aria-label="Settings">⚙</button>
</div>

<style>
  .tb-btn {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 13px;
    background: transparent;
    color: var(--menu-fg);
    border: none;
    cursor: pointer;
  }
  .tb-btn:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
  :global(.dark) .tb-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
  .tb-btn:disabled { opacity: 0.4; cursor: default; }

  .tb-btn.toggle {
    border: 1px solid var(--border);
  }
  .tb-btn.toggle.on {
    background: var(--accent);
    color: var(--menu-fg);
    border-color: var(--accent);
  }

  .settings-btn {
    font-size: 18px;
    line-height: 1;
    padding: 4px 8px;
  }
  .tb-btn.toggle.on:hover:not(:disabled) {
    background: var(--accent);
    filter: brightness(1.1);
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    width: 100%;
    text-align: left;
    padding: 6px 12px;
    font-size: 13px;
    background: transparent;
    color: var(--menu-fg);
    border: none;
    cursor: pointer;
    position: relative;
  }
  .menu-item:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
  :global(.dark) .menu-item:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
  .menu-item:disabled { opacity: 0.4; cursor: default; }
  .menu-item .kbd {
    font-size: 11px;
    color: var(--menu-fg-muted);
    font-family: var(--font-editor);
  }
  .menu-item .caret {
    font-size: 11px;
    color: var(--menu-fg-muted);
  }
  .menu-sep {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
  }
  .menu-empty {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--fg-muted);
    font-style: italic;
  }
  .recent-row {
    /* keep the hover-flyout anchored relative to this row */
    position: relative;
  }
</style>
