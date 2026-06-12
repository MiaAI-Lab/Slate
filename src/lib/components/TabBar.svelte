<script lang="ts">
  import { fade } from 'svelte/transition'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { settingsState } from '$lib/state/settings.svelte'
  import {
    closeTabById,
    closeOtherTabs,
    closeAllTabs,
    closeAllTabsDiscardAll,
  } from '$lib/utils/fileService'
  import type { Tab } from '../../types'

  let dragFromIdx = $state<number | null>(null)
  let dragOverIdx = $state<number | null>(null)
  let dropBefore = $state(true)
  let ctxMenu = $state<{ tabId: string; x: number; y: number } | null>(null)

  const ctxTab = $derived(
    ctxMenu ? tabsState.tabs.find(t => t.id === ctxMenu!.tabId) ?? null : null,
  )

  async function closeWithGuard(tab: Tab) {
    await closeTabById(tab.id)
  }

  function onContextMenu(e: MouseEvent, tab: Tab) {
    e.preventDefault()
    e.stopPropagation()
    ctxMenu = { tabId: tab.id, x: e.clientX, y: e.clientY }
  }

  function closeCtxMenu() { ctxMenu = null }

  $effect(() => {
    if (!ctxMenu) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-tab-ctx]')) return
      ctxMenu = null
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ctxMenu = null }
    // Defer to next tick so the right-click that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('click', onClick)
      window.addEventListener('contextmenu', onClick)
      window.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('click', onClick)
      window.removeEventListener('contextmenu', onClick)
      window.removeEventListener('keydown', onKey)
    }
  })

  function ctxTogglePin() {
    if (!ctxMenu) return
    const id = ctxMenu.tabId
    closeCtxMenu()
    // Guard against togglePin firing mid-drag — drag re-sorts indices and the
    // user can't open a context menu while dragging anyway, but be explicit.
    if (dragFromIdx != null) return
    tabsState.togglePin(id)
  }

  async function ctxCloseThis() {
    if (!ctxMenu) return
    const id = ctxMenu.tabId
    closeCtxMenu()
    await closeTabById(id)
  }
  async function ctxCloseOthers() {
    if (!ctxMenu) return
    const id = ctxMenu.tabId
    closeCtxMenu()
    await closeOtherTabs(id)
  }
  async function ctxCloseAll() {
    closeCtxMenu()
    await closeAllTabs()
  }
  async function ctxCloseAllDiscard() {
    closeCtxMenu()
    await closeAllTabsDiscardAll()
  }

  // Pointer-based drag (HTML5 drag-drop is blocked by Tauri's native file-drop
  // handler on Windows — WebView2 shows the no-drop cursor as soon as a
  // dragstart fires inside the webview).
  let ghost = $state<{ x: number; y: number; label: string } | null>(null)
  let pendingDrag: { idx: number; startX: number; startY: number } | null = null
  const DRAG_THRESHOLD = 5

  function canDropOn(targetIdx: number): boolean {
    if (dragFromIdx == null) return false
    if (dragFromIdx === targetIdx) return false
    const from = tabsState.tabs[dragFromIdx]
    const to = tabsState.tabs[targetIdx]
    if (!from || !to) return false
    // Pinned and unpinned clusters don't interleave.
    return from.pinned === to.pinned
  }

  function onPointerDown(e: PointerEvent, idx: number, tab: Tab) {
    if (e.button === 1) {
      e.preventDefault()
      closeWithGuard(tab)
      return
    }
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-close-btn]')) return
    pendingDrag = { idx, startX: e.clientX, startY: e.clientY }
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (pendingDrag == null) return

    if (dragFromIdx == null) {
      const dx = e.clientX - pendingDrag.startX
      const dy = e.clientY - pendingDrag.startY
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      dragFromIdx = pendingDrag.idx
      const t = tabsState.tabs[pendingDrag.idx]
      ghost = { x: e.clientX, y: e.clientY, label: t ? `${t.title}${t.dirty ? ' •' : ''}` : '' }
      document.body.style.userSelect = 'none'
    } else if (ghost) {
      ghost = { ...ghost, x: e.clientX, y: e.clientY }
    }

    const el = document.elementFromPoint(e.clientX, e.clientY)
    const tabBtn = el?.closest('[data-tab-idx]') as HTMLElement | null
    if (!tabBtn) { dragOverIdx = null; return }
    const overIdx = Number(tabBtn.dataset.tabIdx)
    if (!canDropOn(overIdx)) { dragOverIdx = null; return }
    const rect = tabBtn.getBoundingClientRect()
    dragOverIdx = overIdx
    dropBefore = e.clientX < rect.left + rect.width / 2
  }

  function onWindowPointerUp() {
    if (pendingDrag == null) return
    const wasDragging = dragFromIdx != null

    if (wasDragging && dragOverIdx != null && canDropOn(dragOverIdx)) {
      const target = dragOverIdx
      const insertAt = dropBefore ? target : target + 1
      const finalIdx = dragFromIdx! < insertAt ? insertAt - 1 : insertAt
      tabsState.moveTab(dragFromIdx!, finalIdx)
    }

    pendingDrag = null
    dragFromIdx = null
    dragOverIdx = null
    ghost = null
    document.body.style.userSelect = ''
  }

  $effect(() => {
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerUp)
    }
  })

  function onContainerClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null
    const inButton = target?.closest('button') != null
    if (inButton) return
    if (e.detail === 2) tabsState.newTab()
  }

  function onTabKeydown(e: KeyboardEvent, tab: Tab) {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      tabsState.cycleNext()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      tabsState.cyclePrev()
    } else if (e.code === 'KeyW' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      closeWithGuard(tab)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      tabsState.activeId = tab.id
    }
  }

  // Tab bar scroll overflow
  let tabBarRef = $state<HTMLDivElement | null>(null)
  let scrollLeft = $state(0)
  let scrollWidth = $state(0)
  let clientWidth = $state(0)

  const canScrollLeft = $derived(scrollLeft > 0)
  const canScrollRight = $derived(scrollLeft + clientWidth < scrollWidth - 1)

  function updateScrollState() {
    if (!tabBarRef) return
    scrollLeft = tabBarRef.scrollLeft
    scrollWidth = tabBarRef.scrollWidth
    clientWidth = tabBarRef.clientWidth
  }

  function scrollByAmount(delta: number) {
    if (!tabBarRef) return
    tabBarRef.scrollBy({ left: delta, behavior: 'smooth' })
    // Re-check overflow after the smooth scroll animation completes
    setTimeout(updateScrollState, 350)
  }

  $effect(() => {
    const el = tabBarRef
    if (!el) return
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    el.addEventListener('scroll', updateScrollState, { passive: true })
    updateScrollState()
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', updateScrollState)
    }
  })

  // Scroll active tab into view when it changes
  $effect(() => {
    const _ = tabsState.activeId
    const el = tabBarRef
    if (!el) return
    const activeBtn = el.querySelector('[aria-selected="true"]') as HTMLElement | null
    if (!activeBtn) return
    const containerLeft = el.scrollLeft
    const containerRight = el.scrollLeft + el.clientWidth
    const tabLeft = activeBtn.offsetLeft
    const tabRight = tabLeft + activeBtn.offsetWidth
    if (tabLeft < containerLeft) {
      el.scrollTo({ left: tabLeft, behavior: 'smooth' })
    } else if (tabRight > containerRight) {
      el.scrollTo({ left: tabRight - el.clientWidth, behavior: 'smooth' })
    }
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="tabbar-wrapper relative h-9 border-b" style="border-color: var(--border);">
  {#if canScrollLeft}
    <button type="button" aria-label="Scroll tabs left" class="tabbar-scroll-btn tabbar-scroll-btn-left" onclick={() => scrollByAmount(-200)} style="color: var(--menu-fg);"></button>
  {/if}
  <div
    role="tablist"
    aria-label="Open files"
    tabindex="-1"
    class="tabbar-scroll flex items-stretch overflow-x-auto h-full"
    style="background: var(--bg-elev);"
    onclick={onContainerClick}
    bind:this={tabBarRef}
  >
    {#each tabsState.tabs as tab, idx (tab.id)}
      <button
        type="button"
        role="tab"
        aria-selected={tab.id === tabsState.activeId}
        aria-label={`${tab.title}${tab.dirty ? ' (unsaved)' : ''}${tab.pinned ? ' (pinned)' : ''}`}
        data-tab-idx={idx}
        class="group relative flex items-center gap-2 px-3 max-w-[480px] border-r text-sm cursor-pointer transition-colors whitespace-nowrap select-none"
        class:active={tab.id === tabsState.activeId}
        class:dragging={dragFromIdx === idx}
        style:box-shadow={tab.pinned && settingsState.values.pinnedTabs.showStrip ? 'inset 3px 0 0 var(--pin-color, var(--accent))' : null}
        style="border-color: var(--border); {tab.id === tabsState.activeId ? 'background: var(--bg); color: var(--menu-fg);' : 'color: var(--tab-inactive-fg);'}"
        onclick={() => (tabsState.activeId = tab.id)}
        onpointerdown={(e) => onPointerDown(e, idx, tab)}
        onkeydown={(e) => onTabKeydown(e, tab)}
        oncontextmenu={(e) => onContextMenu(e, tab)}
        title={tab.path ?? tab.title}
      >
        {#if tab.pinned}
          <span aria-hidden="true" class="flex-shrink-0 leading-none" style="color: var(--pin-color, var(--accent));">▎</span>
        {/if}
        <span class="truncate min-w-0">{tab.title}{#if tab.dirty}<span aria-hidden="true" class="dirty-dot">•</span>{/if}{#if tab.externallyChanged}<span aria-hidden="true" class="ext-changed-dot" title="Changed on disk">&#8635;</span>{/if}</span>
        <span
          role="button"
          tabindex="-1"
          aria-label="Close tab"
          data-close-btn
          class="flex-shrink-0 px-1 rounded text-xs opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
          onclick={(e) => { e.stopPropagation(); closeWithGuard(tab) }}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); closeWithGuard(tab) } }}
        >
          ×
        </span>
        {#if dragOverIdx === idx && dragFromIdx != null && dragFromIdx !== idx}
          <span
            aria-hidden="true"
            class="drop-indicator"
            class:before={dropBefore}
            class:after={!dropBefore}
          ></span>
        {/if}
      </button>
    {/each}
    <button
      type="button"
      aria-label="New tab"
      class="px-3 text-sm hover:bg-black/5 dark:hover:bg-white/5 select-none"
      style="color: var(--menu-fg-muted);"
      onclick={() => tabsState.newTab()}
    >
      +
    </button>
    <div
      class="flex-1 h-full cursor-cell hover:bg-black/5 dark:hover:bg-white/5"
      title="Double-click to open a new tab"
    ></div>
  </div>
  {#if canScrollRight}
    <button type="button" aria-label="Scroll tabs right" class="tabbar-scroll-btn tabbar-scroll-btn-right" onclick={() => scrollByAmount(200)} style="color: var(--menu-fg);"></button>
  {/if}
</div>

{#if ctxMenu}
  <div
    data-tab-ctx
    role="menu"
    class="ctx-menu"
    style:left="{ctxMenu.x}px"
    style:top="{ctxMenu.y}px"
    transition:fade={{ duration: 90 }}
  >
    <button class="ctx-item" role="menuitem" onclick={ctxTogglePin}>
      {ctxTab?.pinned ? 'Unpin tab' : 'Pin tab'}
    </button>
    <div class="ctx-sep"></div>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseThis}>Close tab</button>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseOthers} disabled={tabsState.tabs.length <= 1}>Close other tabs</button>
    <button class="ctx-item" role="menuitem" onclick={ctxCloseAll}>Close all tabs</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item danger" role="menuitem" onclick={ctxCloseAllDiscard}>Close all tabs (without saving)</button>
  </div>
{/if}

{#if ghost}
  <div
    class="drag-ghost"
    style:left="{ghost.x + 12}px"
    style:top="{ghost.y + 8}px"
  >
    {ghost.label}
  </div>
{/if}

<style>
  .drop-indicator {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    pointer-events: none;
    z-index: 1;
  }
  .drop-indicator.before { left: -1px; }
  .drop-indicator.after { right: -1px; }
  .dragging { opacity: 0.5; }

  .dirty-dot {
    color: var(--dirty-dot);
    margin-left: 0.25rem;
    /* Fixed opacity overrides the inactive-tab dimming so the indicator
       reads the same on focused and unfocused tabs. */
    opacity: 1;
  }

  .ext-changed-dot {
    color: #f59e0b;
    margin-left: 0.25rem;
    opacity: 1;
    font-size: 0.8em;
  }

  .tabbar-scroll-btn {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 34px;
    z-index: 2;
    border: none;
    background: var(--bg-elev);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: opacity 0.15s;
  }
  .tabbar-scroll-btn:hover {
    opacity: 0.8;
  }
  .tabbar-scroll-btn-left {
    left: 2px;
    border-right: 1px solid var(--border);
    background: linear-gradient(90deg, var(--bg-elev) 60%, transparent);
  }
  .tabbar-scroll-btn-left::before {
    content: '‹';
    font-size: 18px;
    font-weight: bold;
  }
  .tabbar-scroll-btn-right {
    right: 2px;
    border-left: 1px solid var(--border);
    background: linear-gradient(270deg, var(--bg-elev) 60%, transparent);
  }
  .tabbar-scroll-btn-right::before {
    content: '›';
    font-size: 18px;
    font-weight: bold;
  }

  .drag-ghost {
    position: fixed;
    z-index: 9999;
    padding: 4px 12px;
    background: var(--bg-elev);
    color: var(--menu-fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 0.875rem;
    pointer-events: none;
    opacity: 0.9;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

