import type { AppSettings } from '../../types'
import hljsLight from 'highlight.js/styles/github.css?inline'
import hljsDark from 'highlight.js/styles/github-dark.css?inline'

const LEGACY_PREVIEW_FONTS = new Set<string>([
  'Georgia, serif',
  'Cambria, Georgia, serif',
  '"Times New Roman", serif',
])

const defaults: AppSettings = {
  theme: 'oled',
  accentColor: '#2563eb',
  menuTextBrightness: 100,
  typography: {
    editorFont: 'JetBrains Mono, ui-monospace, monospace',
    previewFont: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    editorFontSize: 16,
    previewFontSize: 16,
    lineHeight: 1.2,
    lineWrap: true,
    editorTextColor: '#dbdbdb',
    lineNumberBrightness: 61,
  },
  recentFiles: [],
  restoreSession: true,
  pinnedTabs: {
    highlight: 'accent',
    customColor: '#fbbf24',
    showStrip: true,
  },
  splitSyncScroll: true,
  tableAutoFormat: {
    enabled: true,
    alignOnSave: true,
  },
  showStatusBar: false,
}

const HEX_RE = /^#([0-9a-f]{6})$/i

export function normalizeHex(input: string): string | null {
  const s = input.trim()
  if (HEX_RE.test(s)) return s.toLowerCase()
  // Allow #rgb shorthand → expand to #rrggbb.
  const short = /^#([0-9a-f]{3})$/i.exec(s)
  if (short) {
    const [r, g, b] = short[1].toLowerCase().split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  // Allow bare hex (no #).
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s.toLowerCase()}`
  return null
}

export function applyAccent(color: string) {
  const safe = normalizeHex(color) ?? defaults.accentColor
  document.documentElement.style.setProperty('--accent', safe)
}

export function applyPinColor(p: AppSettings['pinnedTabs']) {
  const value = p.highlight === 'accent'
    ? 'var(--accent)'
    : (normalizeHex(p.customColor) ?? defaults.pinnedTabs.customColor)
  document.documentElement.style.setProperty('--pin-color', value)
}

/**
 * Override the gutter (line number) text color in dark themes.
 * Brightness 0 → #000000, 100 → #ffffff. Default ~61 → #9c9c9c.
 */
export function applyLineNumberBrightness(brightness: number) {
  const el = document.documentElement
  const isDark = el.classList.contains('dark')
  const b = Math.max(0, Math.min(100, Math.round(brightness)))
  if (isDark) {
    el.style.setProperty('--gutter-fg', `hsl(0 0% ${b}%)`)
  } else {
    el.style.removeProperty('--gutter-fg')
  }
}

/**
 * Override the menu-chrome text color in dark themes so the user can dim
 * "pure white" UI text. Light themes ignore this and stay on --fg.
 * Also forwards the resolved brightness to the OS title-bar text via a
 * DWM call (Win11 22H2+; silently no-ops on older builds).
 */
export function applyMenuBrightness(brightness: number) {
  const el = document.documentElement
  const isDark = el.classList.contains('dark')
  const b = Math.max(40, Math.min(100, Math.round(brightness)))
  if (isDark) {
    const v = `hsl(0 0% ${b}%)`
    el.style.setProperty('--menu-fg', v)
    el.style.setProperty('--menu-fg-muted', v)
    // Inactive tabs are always at least 30 points dimmer than the slider value
    // (floored at 30%) so the active tab is unambiguous regardless of setting.
    const inactiveB = Math.max(b - 30, 30)
    el.style.setProperty('--tab-inactive-fg', `hsl(0 0% ${inactiveB}%)`)
    // Grayscale COLORREF (0x00BBGGRR) for the title-bar text. R=G=B so byte
    // order is moot. Sent through dynamic import to stay safe in vite dev
    // where the Tauri runtime isn't present.
    const byte = Math.round((b / 100) * 255)
    const rgb = (byte << 16) | (byte << 8) | byte
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_titlebar_text_color', { rgb }))
      .catch(() => {})
  } else {
    el.style.removeProperty('--menu-fg')
    el.style.removeProperty('--menu-fg-muted')
    el.style.removeProperty('--tab-inactive-fg')
    // Hand the title-bar text color back to the system on light theme.
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_titlebar_text_color', { rgb: null }))
      .catch(() => {})
  }
}

class SettingsState {
  values = $state<AppSettings>(structuredClone(defaults))

  patch(p: Partial<AppSettings>) {
    Object.assign(this.values, p)
  }

  patchTypography(p: Partial<AppSettings['typography']>) {
    this.values.typography = { ...this.values.typography, ...p }
  }

  addRecent(path: string) {
    const list = [path, ...this.values.recentFiles.filter(p => p !== path)]
    this.values.recentFiles = list.slice(0, 10)
  }

  removeRecent(path: string) {
    this.values.recentFiles = this.values.recentFiles.filter(p => p !== path)
  }

  clearRecents() {
    this.values.recentFiles = []
  }
}

export const settingsState = new SettingsState()
export { defaults as settingsDefaults }

// Re-entrancy guard mirroring session.svelte.ts. Without this, HMR re-entry
// into the module on dev edits would stack multiple `$effect.root` instances,
// each writing on every settings change and doubling store traffic per reload.
let settingsInitialized = false

export function resolvedDark(theme: AppSettings['theme']): boolean {
  if (theme === 'dark' || theme === 'oled') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolvedOled(theme: AppSettings['theme']): boolean {
  return theme === 'oled'
}

function applyHljsTheme(dark: boolean) {
  let tag = document.getElementById('hljs-theme') as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'hljs-theme'
    document.head.appendChild(tag)
  }
  tag.textContent = dark ? hljsDark : hljsLight
}

export function applyTheme(theme: AppSettings['theme']) {
  const dark = resolvedDark(theme)
  const oled = resolvedOled(theme)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('oled', oled)
  applyHljsTheme(dark)
}

export async function initSettings() {
  if (settingsInitialized) {
    applyTheme(settingsState.values.theme)
    applyAccent(settingsState.values.accentColor)
    applyMenuBrightness(settingsState.values.menuTextBrightness)
    applyLineNumberBrightness(settingsState.values.typography.lineNumberBrightness)
    applyPinColor(settingsState.values.pinnedTabs)
    return
  }
  settingsInitialized = true
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('settings.json', { autoSave: true, defaults: {} })
    const saved = await store.get<AppSettings>('app')
    if (saved) {
      Object.assign(settingsState.values, saved)
      if (!saved.typography) settingsState.values.typography = structuredClone(defaults.typography)
      if (saved.typography && !saved.typography.editorTextColor) settingsState.values.typography.editorTextColor = '#dbdbdb'
      if (!saved.accentColor) settingsState.values.accentColor = defaults.accentColor
      if (typeof saved.menuTextBrightness !== 'number') settingsState.values.menuTextBrightness = defaults.menuTextBrightness
      if (!saved.pinnedTabs) settingsState.values.pinnedTabs = structuredClone(defaults.pinnedTabs)
      if (typeof saved.splitSyncScroll !== 'boolean') settingsState.values.splitSyncScroll = defaults.splitSyncScroll
      if (!saved.tableAutoFormat) settingsState.values.tableAutoFormat = structuredClone(defaults.tableAutoFormat)
      if (typeof saved.showStatusBar !== 'boolean') settingsState.values.showStatusBar = defaults.showStatusBar
      if (typeof saved.typography?.lineNumberBrightness !== 'number') settingsState.values.typography.lineNumberBrightness = defaults.typography.lineNumberBrightness
      // One-shot migration: bump the legacy serif default to the new sans default.
      if (LEGACY_PREVIEW_FONTS.has(settingsState.values.typography.previewFont)) {
        settingsState.values.typography.previewFont = defaults.typography.previewFont
      }
    }
    $effect.root(() => {
      $effect(() => {
        const snapshot = $state.snapshot(settingsState.values)
        store.set('app', snapshot).catch(() => {})
      })
    })
  } catch {
    // Running outside Tauri (vite dev directly), or store plugin not available.
    // Fall through with defaults.
  }
  applyTheme(settingsState.values.theme)
  applyAccent(settingsState.values.accentColor)
  applyMenuBrightness(settingsState.values.menuTextBrightness)
  applyLineNumberBrightness(settingsState.values.typography.lineNumberBrightness)
  applyPinColor(settingsState.values.pinnedTabs)
  // Reactive effects for live visual updates.
  $effect.root(() => {
    $effect(() => {
      applyLineNumberBrightness(settingsState.values.typography.lineNumberBrightness)
    })
  })
}
