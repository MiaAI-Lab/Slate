import { v4 as uuid } from 'uuid'
import type { Tab } from '../../types'
import { stateByTab } from '$lib/editor/editorRegistry'

class TabsState {
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)

  get activeTab(): Tab | null {
    return this.tabs.find(t => t.id === this.activeId) ?? null
  }

  newTab(init?: Partial<Tab>): string {
    const id = init?.id ?? uuid()
    const pinned = init?.pinned ?? false
    // Splice new tab at the end of the pinned cluster if pinned, otherwise at
    // the end of the unpinned cluster. Avoids placing an unpinned tab inside
    // the pinned cluster.
    const lastPinnedIdx = this.tabs.findLastIndex(t => t.pinned)
    const insertAt = pinned ? lastPinnedIdx + 1 : this.tabs.length
    this.tabs.splice(insertAt, 0, {
      path: null,
      title: this.nextUntitled(),
      content: '',
      dirty: false,
      externallyChanged: false,
      viewMode: 'editor',
      scrollPos: 0,
      pendingScrollLine: null,
      pinned: false,
      // True by default — covers + button, Ctrl+N/T, File > New, double-click,
      // openPathInTab, and the boot-time empty fallback. Session restore
      // overrides this to false so restored tabs don't grab focus during
      // boot.
      pendingFocus: true,
      ...init,
      id, // last so the returned id always matches the stored id
    })
    this.activeId = id
    return id
  }

  closeTab(id: string) {
    const idx = this.tabs.findIndex(t => t.id === id)
    if (idx < 0) return
    this.tabs.splice(idx, 1)
    stateByTab.delete(id)
    if (this.activeId === id) {
      this.activeId = this.tabs[Math.min(idx, this.tabs.length - 1)]?.id ?? null
    }
  }

  updateContent(id: string, content: string) {
    const t = this.tabs.find(t => t.id === id)
    if (!t) return
    // No-op if content didn't actually change. Critical because `view.setState`
    // (used when switching tabs) fires updateListener with docChanged=true and
    // no transaction to carry a SyncFromStore annotation — without this guard,
    // every tab switch would mark the destination tab as dirty.
    if (t.content === content) return
    t.content = content
    t.dirty = true
  }

  loadContent(id: string, content: string, path: string | null, title: string) {
    const t = this.tabs.find(t => t.id === id)
    if (!t) return
    t.content = content
    t.path = path
    t.title = title
    t.dirty = false
    stateByTab.delete(id)
  }

  setDirty(id: string, dirty: boolean) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.dirty = dirty
  }

  setViewMode(id: string, mode: Tab['viewMode']) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.viewMode = mode
  }

  setPath(id: string, path: string, title: string) {
    const t = this.tabs.find(t => t.id === id)
    if (!t) return
    t.path = path
    t.title = title
    t.dirty = false
  }

  setPendingScrollLine(id: string, line: number | null) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.pendingScrollLine = line
  }

  setPendingFocus(id: string, value: boolean) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.pendingFocus = value
  }

  setExternallyChanged(id: string, changed: boolean) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.externallyChanged = changed
  }

  setScrollPos(id: string, scrollTop: number) {
    const t = this.tabs.find(t => t.id === id)
    if (t) t.scrollPos = scrollTop
  }

  getTabByPath(path: string): Tab | undefined {
    return this.tabs.find(t => t.path === path)
  }

  moveTab(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    const from = this.tabs[fromIdx]
    if (!from) return
    // Clamp `toIdx` to the source tab's cluster (pinned vs unpinned) so the
    // two clusters never interleave during drag-reorder.
    const lastPinnedIdx = this.tabs.findLastIndex(t => t.pinned)
    const minIdx = from.pinned ? 0 : lastPinnedIdx + 1
    const maxIdx = from.pinned ? lastPinnedIdx : this.tabs.length - 1
    toIdx = Math.max(minIdx, Math.min(toIdx, maxIdx))
    if (fromIdx === toIdx) return
    const [item] = this.tabs.splice(fromIdx, 1)
    this.tabs.splice(toIdx, 0, item)
  }

  togglePin(id: string) {
    const t = this.tabs.find(t => t.id === id)
    if (!t) return
    t.pinned = !t.pinned
    // Re-sort so pinned tabs cluster on the left. Stable sort preserves
    // relative ordering within each cluster.
    this.tabs.sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }

  cycleNext() {
    if (this.tabs.length === 0) return
    const idx = this.tabs.findIndex(t => t.id === this.activeId)
    const next = (idx + 1) % this.tabs.length
    this.activeId = this.tabs[next].id
  }

  cyclePrev() {
    if (this.tabs.length === 0) return
    const idx = this.tabs.findIndex(t => t.id === this.activeId)
    const prev = (idx - 1 + this.tabs.length) % this.tabs.length
    this.activeId = this.tabs[prev].id
  }

  jumpTo(n: number) {
    if (n < 1 || n > this.tabs.length) return
    this.activeId = this.tabs[n - 1].id
  }

  private nextUntitled(): string {
    const used = new Set(this.tabs.map(t => t.title))
    let i = 1
    while (used.has(`Untitled ${i}`)) i++
    return `Untitled ${i}`
  }
}

export const tabsState = new TabsState()
