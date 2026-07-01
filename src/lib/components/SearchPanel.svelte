<script lang="ts">
  import { fade } from 'svelte/transition'
  import { searchPanel } from '$lib/state/searchPanel.svelte'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import { confirmDialog } from '$lib/state/confirmDialog.svelte'

  let replacement = $state('')
  let allTabs = $state(false) // default: current tab only
  let multiline = $state(false)
  let inputEl = $state<HTMLInputElement | HTMLTextAreaElement | undefined>()
  let panelEl = $state<HTMLElement | undefined>()

  // Query + caseSensitive live in the shared searchPanel state so the Editor
  // can highlight matches in real time. Bind directly to the store.
  function onQueryInput(e: Event) { searchPanel.query = (e.target as HTMLInputElement).value }
  function onCsChange(e: Event) { searchPanel.caseSensitive = (e.target as HTMLInputElement).checked }

  // Floating dialog position + drag.
  const PANEL_W = 520
  // Tight defaults: just enough to show the form.
  // Drag the dialog or toggle Multiline if you need more.
  const PANEL_H_SINGLE = 280
  const PANEL_H_MULTI = 460
  const panelHeight = $derived(multiline ? PANEL_H_MULTI : PANEL_H_SINGLE)
  let pos = $state({ x: 80, y: 80 })
  let hasPositioned = false
  let dragging = $state(false)
  let dragOffset = { x: 0, y: 0 }
  // Briefly enables the CSS transition on `left`/`top` when we programmatically
  // snap the panel (e.g. after a successful search). Disabled during drag.
  let snapping = $state(false)
  let snapTimer: ReturnType<typeof setTimeout> | null = null

  function snapToTopRight() {
    if (snapTimer) clearTimeout(snapTimer)
    snapping = true
    const margin = 16
    pos = clampToViewport(window.innerWidth - PANEL_W - margin, margin)
    snapTimer = setTimeout(() => { snapping = false; snapTimer = null }, 260)
  }

  function clampToViewport(x: number, y: number) {
    const maxX = Math.max(0, window.innerWidth - 160)
    const maxY = Math.max(0, window.innerHeight - 40)
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    }
  }

  function measuredHeight() {
    return panelEl?.offsetHeight ?? panelHeight
  }

  function positionInitially() {
    // Use the multi/single hint for the first paint; an $effect below will
    // re-center using the actual rendered height as soon as it's available.
    const x = Math.round((window.innerWidth - PANEL_W) / 2)
    const y = Math.round((window.innerHeight - panelHeight) / 2)
    pos = clampToViewport(x, y)
    hasPositioned = true
  }

  function onHeaderMouseDown(e: MouseEvent) {
    // Don't start drag from the close button.
    if ((e.target as HTMLElement | null)?.closest('button')) return
    e.preventDefault()
    dragging = true
    dragOffset = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }

  function onHeaderDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement | null)?.closest('button')) return
    const x = Math.round((window.innerWidth - PANEL_W) / 2)
    const y = Math.round((window.innerHeight - measuredHeight()) / 2)
    pos = clampToViewport(x, y)
  }

  $effect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      pos = clampToViewport(e.clientX - dragOffset.x, e.clientY - dragOffset.y)
    }
    const onUp = () => { dragging = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  })

  // Select the previous query text when the input first mounts so typing
  // replaces it instead of appending.
  $effect(() => {
    const el = inputEl
    if (!el) return
    queueMicrotask(() => el.select())
  })

  // On window resize, keep panel within bounds.
  $effect(() => {
    const onResize = () => { pos = clampToViewport(pos.x, pos.y) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  // Re-center each time the panel opens, focus the input.
  // When the panel hides, reset positioning state so the next open re-centers
  // (even if it was previously snapped to the top-right after a search).
  $effect(() => {
    if (!searchPanel.open) {
      hasPositioned = false
      if (snapTimer) { clearTimeout(snapTimer); snapTimer = null }
      snapping = false
      return
    }
    if (!hasPositioned) positionInitially()
    queueMicrotask(() => inputEl?.focus())
  })

  // Focus the find input whenever something external requests it
  // (e.g. Ctrl+F while the panel is already open).
  $effect(() => {
    const _ = searchPanel.focusRequest
    if (!searchPanel.open) return
    queueMicrotask(() => inputEl?.select())
  })

  // Compute matches in the active tab whenever query/caseSensitive/active-tab/content changes.
  // Published on searchPanel.matches/currentIdx so the Editor highlights live.
  $effect(() => {
    const q = searchPanel.query
    const cs = searchPanel.caseSensitive
    const tab = tabsState.activeTab
    if (!q || !tab) {
      searchPanel.clearHighlights()
      return
    }
    const re = new RegExp(escapeRegex(q), cs ? 'g' : 'gi')
    const positions: { from: number; to: number }[] = []
    const text = tab.content
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      positions.push({ from: m.index, to: m.index + m[0].length })
      if (re.lastIndex === m.index) re.lastIndex++ // avoid infinite loop on zero-width
    }
    searchPanel.matches = positions
    if (positions.length === 0) searchPanel.currentIdx = -1
    else if (searchPanel.currentIdx < 0 || searchPanel.currentIdx >= positions.length) searchPanel.currentIdx = 0
  })

  function nextMatch() {
    const n = searchPanel.matches.length
    if (n === 0) return
    searchPanel.currentIdx = (searchPanel.currentIdx + 1) % n
  }
  function prevMatch() {
    const n = searchPanel.matches.length
    if (n === 0) return
    searchPanel.currentIdx = (searchPanel.currentIdx - 1 + n) % n
  }

  function onSubmit(e: Event) {
    e.preventDefault()
    // Pressing Enter or clicking Search advances to the next match and
    // tucks the dialog into the top-right corner so the editor is visible.
    if (searchPanel.matches.length > 0) {
      nextMatch()
      snapToTopRight()
    }
  }

  function close() {
    searchPanel.clearHighlights()
    searchPanel.hide()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'F3' || (e.code === 'KeyG' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      if (e.shiftKey) prevMatch(); else nextMatch()
    }
  }

  function targetTabs() {
    return allTabs ? tabsState.tabs : (tabsState.activeTab ? [tabsState.activeTab] : [])
  }

  function countMatchesInTabs(q: string, cs: boolean): number {
    if (!q) return 0
    const re = new RegExp(escapeRegex(q), cs ? 'g' : 'gi')
    let n = 0
    for (const tab of targetTabs()) {
      const m = tab.content.match(re)
      if (m) n += m.length
    }
    return n
  }

  async function replaceAllInTabs() {
    const q = searchPanel.query
    if (!q) return
    const n = countMatchesInTabs(q, searchPanel.caseSensitive)
    if (n === 0) {
      toast.info('No matches', 'Nothing to replace')
      return
    }
    const scopeLabel = allTabs ? 'open tabs' : 'this tab'
    const ok = await confirmDialog.confirm(
      `Replace all in ${scopeLabel}`,
      `Replace ${n} ${n === 1 ? 'occurrence' : 'occurrences'} of "${q}" with "${replacement}" in ${scopeLabel}?`,
      { confirmLabel: 'Replace all', cancelLabel: 'Cancel' },
    )
    if (!ok) return

    const re = new RegExp(escapeRegex(q), searchPanel.caseSensitive ? 'g' : 'gi')
    let replaced = 0
    for (const tab of targetTabs()) {
      const next = tab.content.replace(re, () => { replaced++; return replacement })
      if (next !== tab.content) tabsState.updateContent(tab.id, next)
    }
    toast.success(`Replaced ${replaced} ${replaced === 1 ? 'match' : 'matches'}`)
  }
</script>

{#if searchPanel.open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside
    bind:this={panelEl}
    aria-label="Find"
    class="search-panel"
    class:dragging
    class:snapping
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:width="{PANEL_W}px"
    onkeydown={onKeydown}
    transition:fade={{ duration: 110 }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="drag-handle"
      onmousedown={onHeaderMouseDown}
      ondblclick={onHeaderDblClick}
      title="Drag to move · double-click to re-center"
    >
      <div class="text-sm font-semibold select-none" style="color: var(--menu-fg);">Find</div>
      <button class="dlg-close" aria-label="Close" onclick={close}>×</button>
    </div>

    <form class="form-body" onsubmit={onSubmit}>
      <div class="flex gap-1 items-start">
        {#if multiline}
          <textarea
            bind:this={inputEl}
            class="input textarea-input flex-1"
            placeholder={allTabs ? 'Find in all open tabs' : 'Find in current tab'}
            value={searchPanel.query}
            oninput={onQueryInput}
            rows="3"
          ></textarea>
        {:else}
          <input
            bind:this={inputEl}
            type="text"
            class="input flex-1"
            placeholder={allTabs ? 'Find in all open tabs' : 'Find in current tab'}
            value={searchPanel.query}
            oninput={onQueryInput}
          />
        {/if}
        <span class="match-count" title="Match {searchPanel.currentIdx >= 0 ? searchPanel.currentIdx + 1 : 0} of {searchPanel.matches.length}">
          {#if searchPanel.matches.length > 0}
            {searchPanel.currentIdx + 1}/{searchPanel.matches.length}
          {:else if searchPanel.query}
            0/0
          {:else}
            &nbsp;
          {/if}
        </span>
        <button
          type="button"
          class="icon-btn"
          title="Previous match (Shift+F3)"
          aria-label="Previous match"
          disabled={searchPanel.matches.length === 0}
          onclick={prevMatch}
        >↑</button>
        <button
          type="button"
          class="icon-btn"
          title="Next match (F3 / Enter)"
          aria-label="Next match"
          disabled={searchPanel.matches.length === 0}
          onclick={nextMatch}
        >↓</button>
      </div>
      {#if multiline}
        <textarea
          class="input textarea-input"
          placeholder="Replace with"
          bind:value={replacement}
          rows="3"
        ></textarea>
      {:else}
        <input
          type="text"
          class="input"
          placeholder="Replace with"
          bind:value={replacement}
        />
      {/if}
      <div class="flex items-center gap-3 text-xs" style="color: var(--fg-muted);">
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={searchPanel.caseSensitive} onchange={onCsChange} />
          Case sensitive
        </label>
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" bind:checked={multiline} />
          Multiline
        </label>
        <label class="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" bind:checked={allTabs} />
          All open tabs
        </label>
      </div>
      <div class="flex gap-2">
        <button
          type="submit"
          class="dlg-btn primary flex-1"
          disabled={!searchPanel.query}
        >Find</button>
        <button
          type="button"
          class="dlg-btn ghost flex-1"
          title="Replace all occurrences in open tabs"
          disabled={!searchPanel.query}
          onclick={replaceAllInTabs}
        >Replace All</button>
      </div>
    </form>
  </aside>
{/if}

<style>
  .search-panel {
    position: fixed;
    z-index: 50;
    display: flex;
    flex-direction: column;
    border-radius: 6px;
    background: var(--bg-elev);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    overflow: hidden;
    max-height: calc(100vh - 40px);
  }
  /* OLED's --border (#111418) disappears on pure-black --bg-elev. Lift the
     outline to a neutral grayscale, and paint the drag-handle slightly
     darker so the header still reads as recessed against the border. */
  :global(.oled) .search-panel {
    --border: #262626;
  }
  :global(.oled) .search-panel .drag-handle {
    background: #1a1a1a;
  }
  .search-panel.dragging {
    user-select: none;
  }
  .search-panel.snapping {
    transition: left 240ms ease, top 240ms ease;
  }

  .drag-handle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 8px 16px;
    cursor: grab;
    /* Brighter than the dialog body for clear visual hierarchy, with the
       1px separator stroke painted in the same color so it reads as one
       solid bar rather than a thin border below the header. */
    background: var(--border);
    border-bottom: 1px solid var(--border);
  }
  .drag-handle:active { cursor: grabbing; }

  .form-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .input {
    width: 100%;
    padding: 8px 10px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    font-size: 13px;
    line-height: 1.5;
  }
  .input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .input::selection { background: var(--accent); color: #fff; }
  .textarea-input {
    resize: vertical;
    min-height: 64px;
    font-family: var(--font-editor);
    white-space: pre;
    overflow-wrap: normal;
  }

  .dlg-btn {
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 13px;
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .dlg-btn:disabled { opacity: 0.4; cursor: default; }
  .dlg-btn.ghost { background: transparent; color: var(--fg); }
  .dlg-btn.ghost:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
  :global(.dark) .dlg-btn.ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
  .dlg-btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
  .dlg-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }

  .icon-btn {
    flex-shrink: 0;
    width: 28px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }
  .icon-btn:hover:not(:disabled) { background: var(--bg-elev-2); }
  .icon-btn:disabled { opacity: 0.4; cursor: default; }

  .match-count {
    display: inline-flex;
    align-items: center;
    min-width: 56px;
    padding: 0 8px;
    font-size: 12px;
    font-family: var(--font-editor);
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
    justify-content: center;
  }

  .dlg-close {
    width: 26px;
    height: 26px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .dlg-close:hover { background: rgba(0,0,0,0.06); color: var(--fg); }
  :global(.dark) .dlg-close:hover { background: rgba(255,255,255,0.08); }
</style>
