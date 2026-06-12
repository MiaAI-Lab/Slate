export interface Tab {
  id: string
  path: string | null
  title: string
  content: string
  dirty: boolean
  externallyChanged: boolean
  viewMode: 'editor' | 'preview' | 'split'
  scrollPos: number
  pendingScrollLine: number | null
  pinned: boolean
  // One-shot: focus the editor the next time this tab is mounted/activated.
  // Cleared by Editor.svelte after focus is applied. Default true on newTab
  // so user-initiated creation (+, Ctrl+N/T, File > New, double-click) lands
  // ready-to-type without an extra click.
  pendingFocus: boolean
}

export interface TypographySettings {
  editorFont: string
  previewFont: string
  editorFontSize: number
  previewFontSize: number
  lineHeight: number
  lineWrap: boolean
  editorTextColor: string
  /** 0-100. Line number gutter brightness (0 = #000000, 100 = #ffffff). */
  lineNumberBrightness: number
}

export type Theme = 'light' | 'dark' | 'oled' | 'system'

export interface PinnedTabsSettings {
  highlight: 'accent' | 'custom'
  customColor: string
  showStrip: boolean
}

export interface TableAutoFormatSettings {
  enabled: boolean
  alignOnSave: boolean
}

export interface AppSettings {
  theme: Theme
  accentColor: string
  /** 50-100. Brightness of menu/chrome text in dark themes (100 = pure white). */
  menuTextBrightness: number
  typography: TypographySettings
  recentFiles: string[]
  restoreSession: boolean
  pinnedTabs: PinnedTabsSettings
  splitSyncScroll: boolean
  tableAutoFormat: TableAutoFormatSettings
  showStatusBar: boolean
}
