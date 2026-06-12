<script lang="ts">
  import { untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import { EditorView } from '@codemirror/view'
  import {
    createEditor,
    buildState,
    buildThemeExt,
    buildFontExt,
    SyncFromStore,
    type EditorOpts,
  } from '$lib/editor/createEditor'
  import { themeCompartment, wrapCompartment, fontCompartment, tableCompartment, langCompartment } from '$lib/editor/compartments'
  import { buildLanguageExt, isLanguageSyncResolved } from '$lib/editor/createEditor'
  import { buildTableExt } from '$lib/editor/tableExtension'
  import { setSearchHighlight } from '$lib/editor/searchHighlight'
  import { stateByTab } from '$lib/editor/editorRegistry'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { settingsState, resolvedDark } from '$lib/state/settings.svelte'
  import { searchPanel } from '$lib/state/searchPanel.svelte'

  let host = $state<HTMLDivElement | undefined>()
  let viewReady = $state(false)
  let view: EditorView | null = null
  let mountedTabId: string | null = null

  function currentOpts(doc: string, path: string | null): EditorOpts {
    const t = settingsState.values.typography
    return {
      doc,
      path,
      dark: resolvedDark(settingsState.values.theme),
      fontSize: t.editorFontSize,
      lineHeight: t.lineHeight,
      lineWrap: t.lineWrap,
      editorTextColor: t.editorTextColor,
      onChange: (next) => {
        if (mountedTabId) tabsState.updateContent(mountedTabId, next)
      },
    }
  }

  // Mount EditorView once when host is attached. Reading reactive state here
  // is wrapped in `untrack` so that ordinary edits (which mutate tab.content)
  // don't re-run this effect and destroy the view.
  $effect(() => {
    if (!host) return
    untrack(() => {
      const tab = tabsState.activeTab
      const path = tab?.path ?? null
      view = createEditor(host!, currentOpts(tab?.content ?? '', path))
      mountedTabId = tab?.id ?? null
      // Only mark the language as configured when the sync seed was the final
      // answer (markdown / plaintext / untitled). For paths that need the
      // async loader (.bat, .py, .rs, …), leave configuredLangPath undefined
      // so the language effect fires and replaces the placeholder [].
      if (isLanguageSyncResolved(path)) configuredLangPath = path
      if (mountedTabId) stateByTab.set(mountedTabId, view.state)
    })
    viewReady = true
    consumePendingScroll()
    consumePendingFocus()
    return () => {
      viewReady = false
      if (view && mountedTabId) stateByTab.set(mountedTabId, view.state)
      view?.destroy()
      view = null
      mountedTabId = null
    }
  })

  // React to active tab change. Gated on viewReady ($state) so this effect
  // tracks its deps unconditionally and re-runs after the view is created.
  $effect(() => {
    const tab = tabsState.activeTab
    if (!tab) return
    // Read tracked fields up-front so they're always dependencies of this effect.
    const tabId = tab.id
    const tabContent = tab.content
    const _pending = tab.pendingScrollLine
    const _pendingFocus = tab.pendingFocus
    if (!viewReady || !view) return
    if (tabId === mountedTabId) {
      syncFromStoreIfDiverged(tab)
      consumePendingScroll()
      consumePendingFocus()
      return
    }
    if (mountedTabId) stateByTab.set(mountedTabId, view.state)
    const existing = stateByTab.get(tabId)
    if (existing && existing.doc.toString() === tabContent) {
      view.setState(existing)
    } else {
      view.setState(buildState(currentOpts(tabContent, tab.path)))
    }
    mountedTabId = tabId
    consumePendingScroll()
    consumePendingFocus()
    requestAnimationFrame(() => view?.requestMeasure())
  })

  function syncFromStoreIfDiverged(tab: { id: string; content: string }) {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === tab.content) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: tab.content },
      annotations: SyncFromStore.of(true),
    })
  }

  function consumePendingScroll() {
    const tab = tabsState.activeTab
    if (!view || !tab || tab.pendingScrollLine == null) return
    const lineNum = Math.max(1, Math.min(tab.pendingScrollLine, view.state.doc.lines))
    const line = view.state.doc.line(lineNum)
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      annotations: SyncFromStore.of(true),
    })
    tabsState.setPendingScrollLine(tab.id, null)
  }

  function consumePendingFocus() {
    const tab = tabsState.activeTab
    if (!view || !tab || !tab.pendingFocus) return
    // Defer to the next frame so any in-flight DOM work (TabBar layout shift,
    // newly-mounted panes) settles before CodeMirror takes focus — otherwise
    // a competing focus call from layout can win the race.
    requestAnimationFrame(() => view?.focus())
    tabsState.setPendingFocus(tab.id, false)
  }

  // Push search highlight state into CodeMirror as a decoration set. Skip when
  // matches/currentIdx have not changed since the last dispatch (e.g. when an
  // unrelated effect re-fires) — RangeSetBuilder work and a CM transaction per
  // keystroke when there's nothing to update is pure waste.
  $effect(() => {
    const matches = searchPanel.matches
    const currentIdx = searchPanel.currentIdx
    const open = searchPanel.open
    if (!viewReady || !view) return
    // Always clear when there are no matches (query cleared or panel closed).
    if (!matches.length) {
      view.dispatch({ effects: setSearchHighlight.of({ matches: [], currentIdx: -1 }) })
      return
    }
    // Don't show highlights when the panel is closed.
    if (!open) return
    view.dispatch({ effects: setSearchHighlight.of({ matches, currentIdx }) })
  })

  // When the current match changes, scroll the editor to it and select it.
  // Gate on:
  //   - the panel being open (otherwise stray currentIdx changes from a
  //     previous session would yank the caret around)
  //   - currentIdx actually changing — without this, the effect re-fires
  //     on every keystroke (matches recompute) and fights the user's caret.
  let prevCurrentIdx = -1
  $effect(() => {
    const idx = searchPanel.currentIdx
    const open = searchPanel.open
    if (!viewReady || !view) return
    if (!open) { prevCurrentIdx = idx; return }
    if (idx === prevCurrentIdx) return
    prevCurrentIdx = idx
    const matches = searchPanel.matches
    if (idx < 0 || idx >= matches.length) return
    const m = matches[idx]
    const docLen = view.state.doc.length
    if (m.from >= docLen) return
    view.dispatch({
      selection: { anchor: m.from, head: Math.min(m.to, docLen) },
      effects: EditorView.scrollIntoView(m.from, { y: 'center' }),
      annotations: SyncFromStore.of(true),
    })
  })

  function onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const cur = settingsState.values.typography.editorFontSize
    const next = Math.max(10, Math.min(24, cur + (e.deltaY < 0 ? 1 : -1)))
    if (next !== cur) settingsState.values.typography.editorFontSize = next
  }

  // Custom context menu. The native WebView2 / Chromium menu (Emoji, Inspect)
  // looks foreign next to the rest of the app chrome — replace it with a
  // themed one offering the usual text-editing actions.
  const MENU_W = 220
  const MENU_H_ESTIMATE = 220
  let ctxMenu = $state<{ x: number; y: number; hasSelection: boolean } | null>(null)

  function clampMenuPos(x: number, y: number) {
    const maxX = Math.max(0, window.innerWidth - MENU_W - 4)
    const maxY = Math.max(0, window.innerHeight - MENU_H_ESTIMATE - 4)
    return { x: Math.min(x, maxX), y: Math.min(y, maxY) }
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const sel = view?.state.selection.main
    const hasSelection = !!sel && !sel.empty
    // Move the editor's caret to the click point so a subsequent Paste lands
    // where the user expected. Selection-on-click is preserved by CodeMirror's
    // own pointerdown handling — only update the caret when nothing is selected.
    if (view && !hasSelection) {
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
      if (pos != null) view.dispatch({ selection: { anchor: pos } })
    }
    const { x, y } = clampMenuPos(e.clientX, e.clientY)
    ctxMenu = { x, y, hasSelection }
  }

  function closeCtxMenu() { ctxMenu = null }

  // Dismiss on outside click / Escape, mirroring TabBar's pattern.
  $effect(() => {
    if (!ctxMenu) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-editor-ctx]')) return
      ctxMenu = null
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ctxMenu = null }
    const onScroll = () => { ctxMenu = null }
    // Defer so the right-click that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('click', onClick)
      window.addEventListener('contextmenu', onClick)
      window.addEventListener('keydown', onKey)
      window.addEventListener('wheel', onScroll, { passive: true })
    }, 0)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('click', onClick)
      window.removeEventListener('contextmenu', onClick)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onScroll)
    }
  })

  async function ctxCut() {
    if (!view) return closeCtxMenu()
    const sel = view.state.selection.main
    if (!sel.empty) {
      const text = view.state.doc.sliceString(sel.from, sel.to)
      try { await navigator.clipboard.writeText(text) } catch {}
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: '' },
        selection: { anchor: sel.from },
      })
    }
    closeCtxMenu()
    view.focus()
  }
  async function ctxCopy() {
    if (!view) return closeCtxMenu()
    const sel = view.state.selection.main
    if (!sel.empty) {
      const text = view.state.doc.sliceString(sel.from, sel.to)
      try { await navigator.clipboard.writeText(text) } catch {}
    }
    closeCtxMenu()
    view.focus()
  }
  async function ctxPaste() {
    if (!view) return closeCtxMenu()
    let text = ''
    try { text = await navigator.clipboard.readText() } catch {}
    if (text) {
      const sel = view.state.selection.main
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + text.length },
      })
    }
    closeCtxMenu()
    view.focus()
  }
  async function ctxPasteAsMarkdown() {
    if (!view) return closeCtxMenu()
    const { pasteAsMarkdown } = await import('$lib/utils/smartPaste')
    await pasteAsMarkdown(view)
    closeCtxMenu()
    view.focus()
  }
  function ctxSelectAll() {
    if (!view) return closeCtxMenu()
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })
    closeCtxMenu()
    view.focus()
  }

  // Live reconfigure theme / font / wrap on settings change.
  $effect(() => {
    const dark = resolvedDark(settingsState.values.theme)
    const t = settingsState.values.typography
    // Read all tracked deps before the readiness check.
    const fs = t.editorFontSize
    const lh = t.lineHeight
    const wrap = t.lineWrap
    const textColor = t.editorTextColor
    if (!viewReady || !view) return
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(buildThemeExt(dark)),
        fontCompartment.reconfigure(buildFontExt(fs, lh, textColor)),
        wrapCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
      ],
    })
  })

  // Live reconfigure the table-autoformat keymap. Kept in its own effect so a
  // font/theme change doesn't churn through a table compartment rebuild.
  $effect(() => {
    const _enabled = settingsState.values.tableAutoFormat.enabled
    if (!viewReady || !view) return
    view.dispatch({ effects: tableCompartment.reconfigure(buildTableExt()) })
  })

  // Reconfigure the language compartment whenever the active tab's file path
  // changes. .txt/.log → no highlighting; .md/untitled → markdown; everything
  // else → language matched from @codemirror/language-data.
  let configuredLangPath: string | null | undefined = undefined
  $effect(() => {
    const path = tabsState.activeTab?.path ?? null
    if (!viewReady || !view) return
    if (path === configuredLangPath) return
    // Skip async load when the sync seed was already the final answer.
    if (isLanguageSyncResolved(path)) { configuredLangPath = path; return }
    let stale = false
    buildLanguageExt(path).then(ext => {
      if (!stale && view) {
        view.dispatch({ effects: langCompartment.reconfigure(ext) })
        configuredLangPath = path
      }
    }).catch(() => {})
    return () => { stale = true }
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={host}
  class="h-full w-full"
  onwheel={onWheel}
  oncontextmenu={onContextMenu}
></div>

{#if ctxMenu}
  <div
    data-editor-ctx
    role="menu"
    class="ctx-menu"
    style:left="{ctxMenu.x}px"
    style:top="{ctxMenu.y}px"
    transition:fade={{ duration: 90 }}
  >
    <button class="ctx-item" role="menuitem" onclick={ctxCut} disabled={!ctxMenu.hasSelection}>
      <span>Cut</span><span class="ctx-kbd">Ctrl+X</span>
    </button>
    <button class="ctx-item" role="menuitem" onclick={ctxCopy} disabled={!ctxMenu.hasSelection}>
      <span>Copy</span><span class="ctx-kbd">Ctrl+C</span>
    </button>
    <button class="ctx-item" role="menuitem" onclick={ctxPaste}>
      <span>Paste</span><span class="ctx-kbd">Ctrl+V</span>
    </button>
    <button class="ctx-item" role="menuitem" onclick={ctxPasteAsMarkdown}>
      <span>Paste HTML as Markdown</span><span class="ctx-kbd">Ctrl+Shift+V</span>
    </button>
    <div class="ctx-sep"></div>
    <button class="ctx-item" role="menuitem" onclick={ctxSelectAll}>
      <span>Select all</span><span class="ctx-kbd">Ctrl+A</span>
    </button>
  </div>
{/if}
