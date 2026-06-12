export interface SearchMatch {
  from: number
  to: number
}

class SearchPanelState {
  open = $state(false)
  /** Live query, mirrored from the panel input. Empty when not searching. */
  query = $state('')
  /** Last query before closing — restored when the panel reopens. */
  lastQuery = $state('')
  /** Last case-sensitivity setting before closing — restored on reopen. */
  lastCaseSensitive = $state(false)
  caseSensitive = $state(false)
  /** Positions of matches in the *active tab's* content. */
  matches = $state<SearchMatch[]>([])
  /** Index into `matches` of the currently focused match. -1 if none. */
  currentIdx = $state(-1)
  /** Pre-filled query from an external caller (e.g. selected text). */
  _prefill = $state('')

  show(prefill?: string) {
    this.query = prefill ?? this.lastQuery
    this.caseSensitive = this.lastCaseSensitive
    this.open = true
  }
  hide() {
    this.clearHighlights()
    this.lastQuery = this.query
    this.lastCaseSensitive = this.caseSensitive
    this.open = false
  }
  toggle(prefill?: string) {
    if (!this.open) {
      this.query = prefill ?? this.lastQuery
      this.caseSensitive = this.lastCaseSensitive
    } else {
      this.clearHighlights()
    }
    this.open = !this.open
  }

  clearHighlights() {
    this.matches = []
    this.currentIdx = -1
  }
}

export const searchPanel = new SearchPanelState()
