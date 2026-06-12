<script lang="ts">
  import { settingsState, normalizeHex } from '$lib/state/settings.svelte'
  import { settingsDialog } from '$lib/state/settingsDialog.svelte'
  import { toast } from '$lib/state/toast.svelte'
  import type { Theme } from '../../types'

  const ACCENT_PRESETS: { name: string; hex: string }[] = [
    { name: 'Blue',     hex: '#2563eb' },
    { name: 'Indigo',   hex: '#6366f1' },
    { name: 'Violet',   hex: '#8b5cf6' },
    { name: 'Pink',     hex: '#ec4899' },
    { name: 'Rose',     hex: '#f43f5e' },
    { name: 'Orange',   hex: '#f97316' },
    { name: 'Amber',    hex: '#f59e0b' },
    { name: 'Emerald',  hex: '#10b981' },
    { name: 'Teal',     hex: '#14b8a6' },
    { name: 'Cyan',     hex: '#06b6d4' },
    { name: 'Slate',    hex: '#64748b' },
    { name: 'Crimson',  hex: '#dc2626' },
  ]

  let hexInput = $state(settingsState.values.accentColor)
  let hexError = $state(false)

  $effect(() => {
    // Sync the text input when settings change externally (e.g., preset click).
    hexInput = settingsState.values.accentColor
    hexError = false
  })

  function setAccent(hex: string) {
    settingsState.values.accentColor = hex
  }

  function onHexChange(e: Event) {
    const v = (e.target as HTMLInputElement).value
    hexInput = v
    const norm = normalizeHex(v)
    if (norm) {
      setAccent(norm)
      hexError = false
    } else {
      hexError = v.length > 0
    }
  }

  function onColorPick(e: Event) {
    setAccent((e.target as HTMLInputElement).value)
  }

  function onPinColorPick(e: Event) {
    settingsState.values.pinnedTabs.customColor = (e.target as HTMLInputElement).value
  }

  let textColorHexInput = $state(settingsState.values.typography.editorTextColor)
  let textColorHexError = $state(false)

  $effect(() => {
    textColorHexInput = settingsState.values.typography.editorTextColor
    textColorHexError = false
  })

  const TEXT_COLOR_PRESETS: { name: string; hex: string }[] = [
    { name: 'White',      hex: '#ffffff' },
    { name: 'Warm white', hex: '#dbdbdb' },
    { name: 'Light gray', hex: '#e6e7eb' },
    { name: 'Dim',        hex: '#abb2bf' },
    { name: 'Dark',       hex: '#1a1a1a' },
  ]

  function setTextColor(hex: string) {
    settingsState.values.typography.editorTextColor = hex
  }

  function onTextColorPick(e: Event) {
    setTextColor((e.target as HTMLInputElement).value)
  }

  function onTextColorHexChange(e: Event) {
    const v = (e.target as HTMLInputElement).value
    textColorHexInput = v
    const norm = normalizeHex(v)
    if (norm) {
      setTextColor(norm)
      textColorHexError = false
    } else {
      textColorHexError = v.length > 0
    }
  }

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(settingsState.values.accentColor)
      toast.success('Copied', settingsState.values.accentColor)
    } catch {
      toast.error('Copy failed')
    }
  }

  async function pasteHex() {
    try {
      const text = await navigator.clipboard.readText()
      const norm = normalizeHex(text)
      if (norm) {
        setAccent(norm)
        hexError = false
      } else {
        hexError = true
        toast.error('Not a valid hex color', text.slice(0, 20))
      }
    } catch {
      toast.error('Paste failed')
    }
  }

  let dialogEl = $state<HTMLDialogElement | undefined>()
  let tab = $state<'appearance' | 'behavior' | 'about'>('appearance')

  $effect(() => {
    if (!dialogEl) return
    if (settingsDialog.open && !dialogEl.open) {
      dialogEl.showModal()
    } else if (!settingsDialog.open && dialogEl.open) {
      dialogEl.close()
    }
  })

  function setTheme(t: Theme) { settingsState.values.theme = t }

  function close() { settingsDialog.hide() }

  function clearRecents() {
    settingsState.clearRecents()
  }

  const PRESET_EDITOR_FONTS = [
    'JetBrains Mono, ui-monospace, monospace',
    'Fira Code, ui-monospace, monospace',
    'Consolas, ui-monospace, monospace',
    'Cascadia Code, ui-monospace, monospace',
    'ui-monospace, monospace',
  ]
  const PRESET_PREVIEW_FONTS = [
    '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    'system-ui, sans-serif',
    'Inter, system-ui, sans-serif',
    '"Helvetica Neue", Arial, sans-serif',
    'Georgia, serif',
    'Cambria, Georgia, serif',
  ]
</script>

<dialog
  bind:this={dialogEl}
  class="rounded-md shadow-xl p-0 w-[560px] max-w-[92vw]"
  style="background: var(--bg-elev); color: var(--menu-fg); border: 1px solid var(--border);"
  oncancel={(e) => { e.preventDefault(); close() }}
  onclose={() => settingsDialog.hide()}
>
  <div class="dialog-header flex items-center justify-between px-5 py-3" style="border-bottom: 1px solid var(--border);">
    <h2 class="text-base font-semibold" style="color: var(--menu-fg);">Settings</h2>
    <button type="button" class="dlg-close" aria-label="Close" onclick={close}>×</button>
  </div>

  <div class="flex gap-2 px-5 pt-3" style="border-bottom: 1px solid var(--border);">
    <button
      type="button"
      class="tab-btn"
      class:on={tab === 'appearance'}
      onclick={() => (tab = 'appearance')}
    >Appearance</button>
    <button
      type="button"
      class="tab-btn"
      class:on={tab === 'behavior'}
      onclick={() => (tab = 'behavior')}
    >Behavior</button>
    <button
      type="button"
      class="tab-btn"
      class:on={tab === 'about'}
      onclick={() => (tab = 'about')}
    >About</button>
  </div>

  <div class="p-5 space-y-4 h-[60vh] overflow-y-auto">
    {#if tab === 'appearance'}
      <section class="space-y-2">
        <div class="text-sm font-medium">Theme</div>
        <div class="seg" role="radiogroup" aria-label="Theme">
          <button type="button" class="seg-btn" class:on={settingsState.values.theme === 'light'} onclick={() => setTheme('light')}>Light</button>
          <button type="button" class="seg-btn" class:on={settingsState.values.theme === 'dark'} onclick={() => setTheme('dark')}>Dark</button>
          <button type="button" class="seg-btn" class:on={settingsState.values.theme === 'oled'} onclick={() => setTheme('oled')}>OLED</button>
          <button type="button" class="seg-btn" class:on={settingsState.values.theme === 'system'} onclick={() => setTheme('system')}>System</button>
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-sm font-medium">Accent color</div>
        <div class="flex flex-wrap gap-1.5">
          {#each ACCENT_PRESETS as p}
            <button
              type="button"
              class="swatch"
              class:on={settingsState.values.accentColor.toLowerCase() === p.hex.toLowerCase()}
              style="background: {p.hex};"
              title={`${p.name} (${p.hex})`}
              aria-label={`Accent ${p.name}`}
              onclick={() => setAccent(p.hex)}
            ></button>
          {/each}
        </div>
        <div class="flex items-center gap-2 pt-1">
          <label class="custom-color" title="Pick a custom color">
            <input
              type="color"
              value={settingsState.values.accentColor}
              oninput={onColorPick}
              aria-label="Custom accent color picker"
            />
            <span class="custom-color-swatch" style="background: {settingsState.values.accentColor};"></span>
            <span class="custom-color-label">Custom</span>
          </label>
          <input
            type="text"
            class="input hex-input"
            class:input-error={hexError}
            value={hexInput}
            placeholder="#rrggbb"
            spellcheck="false"
            oninput={onHexChange}
            aria-label="Accent hex color"
          />
          <button type="button" class="icon-btn" title="Copy hex" aria-label="Copy hex" onclick={copyHex}>📋</button>
          <button type="button" class="icon-btn" title="Paste hex" aria-label="Paste hex" onclick={pasteHex}>📥</button>
        </div>
      </section>

      <section class="grid grid-cols-[1fr_auto] gap-3 items-center">
        <label for="menu-brightness" class="text-sm font-medium">
          Menu text brightness
        </label>
        <span class="text-sm tabular-nums" style="color: var(--fg-muted);">{settingsState.values.menuTextBrightness}%</span>
        <input
          id="menu-brightness"
          type="range"
          min="50" max="100" step="1"
          class="col-span-2 w-full"
          bind:value={settingsState.values.menuTextBrightness}
        />
        <div class="col-span-2 text-xs" style="color: var(--fg-muted);">
          Dims chrome text (toolbar, tabs, menus) in dark themes. No effect in light theme.
        </div>
      </section>

      <section class="space-y-2">
        <label for="editor-font" class="text-sm font-medium block">Editor font</label>
        <input
          id="editor-font"
          type="text"
          class="input"
          bind:value={settingsState.values.typography.editorFont}
          list="editor-fonts"
        />
        <datalist id="editor-fonts">
          {#each PRESET_EDITOR_FONTS as f}<option value={f}></option>{/each}
        </datalist>
      </section>

      <section class="space-y-2">
        <label for="preview-font" class="text-sm font-medium block">Preview font</label>
        <input
          id="preview-font"
          type="text"
          class="input"
          bind:value={settingsState.values.typography.previewFont}
          list="preview-fonts"
        />
        <datalist id="preview-fonts">
          {#each PRESET_PREVIEW_FONTS as f}<option value={f}></option>{/each}
        </datalist>
      </section>

      <section class="grid grid-cols-[1fr_auto] gap-3 items-center">
        <label for="editor-size" class="text-sm font-medium">
          Editor font size
        </label>
        <span class="text-sm tabular-nums" style="color: var(--fg-muted);">{settingsState.values.typography.editorFontSize}px</span>
        <input
          id="editor-size"
          type="range"
          min="10" max="24" step="1"
          class="col-span-2 w-full"
          bind:value={settingsState.values.typography.editorFontSize}
        />
      </section>

      <section class="grid grid-cols-[1fr_auto] gap-3 items-center">
        <label for="preview-size" class="text-sm font-medium">
          Preview font size
        </label>
        <span class="text-sm tabular-nums" style="color: var(--fg-muted);">{settingsState.values.typography.previewFontSize}px</span>
        <input
          id="preview-size"
          type="range"
          min="10" max="28" step="1"
          class="col-span-2 w-full"
          bind:value={settingsState.values.typography.previewFontSize}
        />
      </section>

      <section class="grid grid-cols-[1fr_auto] gap-3 items-center">
        <label for="line-height" class="text-sm font-medium">Line height</label>
        <span class="text-sm tabular-nums" style="color: var(--fg-muted);">{settingsState.values.typography.lineHeight.toFixed(2)}</span>
        <input
          id="line-height"
          type="range"
          min="1.2" max="2.5" step="0.05"
          class="col-span-2 w-full"
          bind:value={settingsState.values.typography.lineHeight}
        />
      </section>

      <section class="flex items-center justify-between">
        <label for="line-wrap" class="text-sm font-medium">Word wrap in editor</label>
        <input
          id="line-wrap"
          type="checkbox"
          bind:checked={settingsState.values.typography.lineWrap}
        />
      </section>

      <section class="grid grid-cols-[1fr_auto] gap-3 items-center">
        <label for="line-number-brightness" class="text-sm font-medium">
          Line number brightness
        </label>
        <span class="text-sm tabular-nums" style="color: var(--fg-muted);">{settingsState.values.typography.lineNumberBrightness}%</span>
        <input
          id="line-number-brightness"
          type="range"
          min="0" max="100" step="1"
          class="col-span-2 w-full"
          bind:value={settingsState.values.typography.lineNumberBrightness}
        />
        <div class="col-span-2 text-xs" style="color: var(--fg-muted);">
          Controls line number gutter text color from black to white in dark themes.
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-sm font-medium">Default text color</div>
        <div class="flex flex-wrap gap-1.5">
          {#each TEXT_COLOR_PRESETS as p}
            <button
              type="button"
              class="swatch"
              class:on={settingsState.values.typography.editorTextColor.toLowerCase() === p.hex.toLowerCase()}
              style="background: {p.hex};"
              title="{p.name} ({p.hex})"
              aria-label="Text color {p.name}"
              onclick={() => setTextColor(p.hex)}
            ></button>
          {/each}
        </div>
        <div class="flex items-center gap-2 pt-1">
          <label class="custom-color" title="Pick a custom text color">
            <input
              type="color"
              value={settingsState.values.typography.editorTextColor}
              oninput={onTextColorPick}
              aria-label="Custom text color picker"
            />
            <span class="custom-color-swatch" style="background: {settingsState.values.typography.editorTextColor};"></span>
            <span class="custom-color-label">Custom</span>
          </label>
          <input
            type="text"
            class="input hex-input"
            class:input-error={textColorHexError}
            value={textColorHexInput}
            placeholder="#rrggbb"
            spellcheck="false"
            oninput={onTextColorHexChange}
            aria-label="Text color hex"
          />
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-sm font-medium">Pinned tab</div>
        <div class="seg" role="radiogroup" aria-label="Pinned tab highlight color">
          <button
            type="button"
            class="seg-btn"
            class:on={settingsState.values.pinnedTabs.highlight === 'accent'}
            onclick={() => (settingsState.values.pinnedTabs.highlight = 'accent')}
          >Use accent color</button>
          <button
            type="button"
            class="seg-btn"
            class:on={settingsState.values.pinnedTabs.highlight === 'custom'}
            onclick={() => (settingsState.values.pinnedTabs.highlight = 'custom')}
          >Custom</button>
        </div>
        {#if settingsState.values.pinnedTabs.highlight === 'custom'}
          <div class="flex items-center gap-2 pt-1">
            <label class="custom-color" title="Pick a custom pin color">
              <input
                type="color"
                value={settingsState.values.pinnedTabs.customColor}
                oninput={onPinColorPick}
                aria-label="Custom pin color picker"
              />
              <span class="custom-color-swatch" style="background: {settingsState.values.pinnedTabs.customColor};"></span>
              <span class="custom-color-label">{settingsState.values.pinnedTabs.customColor}</span>
            </label>
          </div>
        {/if}
        <label class="flex items-center justify-between pt-1">
          <span class="text-sm">Show colored strip on pinned tabs</span>
          <input
            type="checkbox"
            bind:checked={settingsState.values.pinnedTabs.showStrip}
          />
        </label>
      </section>
    {:else if tab === 'behavior'}
      <section class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">
            <label for="restore-session">Restore tabs on launch</label>
          </div>
          <div class="text-xs" style="color: var(--fg-muted);">
            Reopen the same tabs (saved files, unsaved drafts, active tab, and view mode) the next time Slate starts.
          </div>
        </div>
        <input
          id="restore-session"
          type="checkbox"
          bind:checked={settingsState.values.restoreSession}
        />
      </section>

      <section class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">
            <label for="show-status-bar">Show status bar</label>
          </div>
          <div class="text-xs" style="color: var(--fg-muted);">
            Bottom bar showing file path, word count, cursor position.
          </div>
        </div>
        <input
          id="show-status-bar"
          type="checkbox"
          bind:checked={settingsState.values.showStatusBar}
        />
      </section>

      <section class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">
            <label for="split-sync-scroll">Sync scroll while split</label>
          </div>
          <div class="text-xs" style="color: var(--fg-muted);">
            Scroll preview to the nearest heading as the editor scrolls.
          </div>
        </div>
        <input
          id="split-sync-scroll"
          type="checkbox"
          bind:checked={settingsState.values.splitSyncScroll}
        />
      </section>

      <section class="space-y-2">
        <label class="flex items-center justify-between">
          <span class="text-sm font-medium">Auto-format Markdown tables</span>
          <input
            type="checkbox"
            bind:checked={settingsState.values.tableAutoFormat.enabled}
          />
        </label>
        <label
          class="flex items-center justify-between"
          class:row-disabled={!settingsState.values.tableAutoFormat.enabled}
        >
          <span class="text-sm">Align tables on save</span>
          <input
            type="checkbox"
            bind:checked={settingsState.values.tableAutoFormat.alignOnSave}
            disabled={!settingsState.values.tableAutoFormat.enabled}
          />
        </label>
      </section>

      <section class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">Recent files</div>
          <div class="text-xs" style="color: var(--fg-muted);">
            {settingsState.values.recentFiles.length} entries
          </div>
        </div>
        <button
          type="button"
          class="dlg-btn ghost"
          onclick={clearRecents}
          disabled={settingsState.values.recentFiles.length === 0}
        >Clear</button>
      </section>
    {:else}
      <section class="about-pane">
        <div class="about-title">Slate</div>
        <p class="about-tagline">A no-bullish markdown editor. Can also edit other files.</p>
        <dl class="about-meta">
          <dt>Version</dt><dd>{__APP_VERSION__}</dd>
          <dt>Author</dt><dd>Mia's AI Lab</dd>
          <dt>GitHub</dt><dd><a href="https://github.com/MiaAI-Lab" target="_blank" rel="noopener noreferrer" class="about-link"><svg class="about-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> MiaAI-Lab</a></dd>
          <dt>X</dt><dd><a href="https://x.com/MiaAI_lab" target="_blank" rel="noopener noreferrer" class="about-link"><svg class="about-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/></svg> @MiaAI_lab</a></dd>
        </dl>
      </section>
    {/if}
  </div>

  <div class="flex justify-end p-3" style="border-top: 1px solid var(--border);">
    <button type="button" class="dlg-btn primary" onclick={close}>Done</button>
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    opacity: 0;
    transform: translateY(-4px);
    transition:
      opacity 140ms cubic-bezier(0.33, 1, 0.68, 1),
      transform 140ms cubic-bezier(0.33, 1, 0.68, 1),
      overlay 140ms allow-discrete,
      display 140ms allow-discrete;
  }
  dialog[open] {
    opacity: 1;
    transform: translateY(0);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  dialog::backdrop {
    background: transparent;
  }
  /* OLED-only: brighten the outline and paint the header in a recessed
     grayscale fill so the two dialogs share their treatment with the
     SearchPanel against the pure-black body. Overriding --border on the
     dialog cascades to every inline var(--border) inside it (outline,
     section dividers, footer). */
  :global(.oled) dialog {
    --border: #262626;
  }
  :global(.oled) dialog .dialog-header {
    background: #1a1a1a;
  }

  .dlg-close {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .dlg-close:hover { background: rgba(0,0,0,0.06); color: var(--menu-fg); }
  :global(.dark) .dlg-close:hover { background: rgba(255,255,255,0.08); }

  .tab-btn {
    padding: 6px 12px;
    border-radius: 4px 4px 0 0;
    font-size: 13px;
    background: transparent;
    color: var(--fg-muted);
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    margin-bottom: -1px;
  }
  .tab-btn:hover { color: var(--menu-fg); }
  .tab-btn.on {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .seg {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .seg-btn {
    padding: 4px 12px;
    font-size: 13px;
    background: transparent;
    color: var(--fg-muted);
    border: none;
    cursor: pointer;
  }
  .seg-btn:hover { background: rgba(0,0,0,0.06); color: var(--menu-fg); }
  :global(.dark) .seg-btn:hover { background: rgba(255,255,255,0.08); }
  .seg-btn.on {
    background: var(--accent);
    color: white;
  }

  .input {
    width: 100%;
    padding: 5px 8px;
    border-radius: 4px;
    background: var(--bg);
    color: var(--menu-fg);
    border: 1px solid var(--border);
    font-size: 13px;
  }
  .input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }

  .dlg-btn {
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 13px;
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .dlg-btn:disabled { opacity: 0.4; cursor: default; }
  .dlg-btn.ghost {
    background: transparent;
    color: var(--menu-fg);
  }
  .dlg-btn.ghost:hover:not(:disabled) { background: rgba(0, 0, 0, 0.06); }
  :global(.dark) .dlg-btn.ghost:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); }
  .dlg-btn.primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .dlg-btn.primary:hover { filter: brightness(1.1); }

  .swatch {
    width: 28px;
    height: 18px;
    border-radius: 2px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: transform 80ms;
    padding: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);
  }
  .swatch:hover { transform: scale(1.08); }
  .swatch.on {
    border-color: var(--fg);
    box-shadow: 0 0 0 1px var(--bg-elev), 0 0 0 2px var(--fg);
  }

  .custom-color {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    cursor: pointer;
    background: var(--bg);
  }
  .custom-color:hover { background: var(--bg-elev-2); }
  .custom-color input[type="color"] {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
  }
  .custom-color-swatch {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.15);
    flex-shrink: 0;
  }
  .custom-color-label {
    font-size: 13px;
    color: var(--menu-fg);
  }

  .hex-input {
    width: 110px;
    font-family: var(--font-editor);
    text-transform: lowercase;
  }
  .input-error {
    border-color: var(--danger);
  }
  .input-error:focus {
    outline-color: var(--danger);
  }

  .icon-btn {
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--menu-fg);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
  }
  .icon-btn:hover { background: rgba(0,0,0,0.06); }
  :global(.dark) .icon-btn:hover { background: rgba(255,255,255,0.08); }

  .row-disabled { color: var(--fg-muted); }

  /* Range sliders (font sizes, line height, brightness) — pick up the
     menu-text-brightness setting via accent-color so the thumb/track dim
     in lockstep with the labels around them. */
  input[type="range"] {
    accent-color: var(--menu-fg);
  }

  .about-pane {
    padding-top: 8px;
  }
  .about-title {
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--menu-fg);
  }
  .about-tagline {
    margin-top: 4px;
    font-size: 13px;
    color: var(--fg-muted);
  }
  .about-meta {
    margin-top: 18px;
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 16px;
    row-gap: 4px;
    font-size: 13px;
  }
  .about-meta dt {
    color: var(--fg-muted);
  }
  .about-meta dd {
    color: var(--menu-fg);
    margin: 0;
  }
  .about-link {
    color: var(--accent);
    text-decoration: none;
  }
  .about-link:hover {
    text-decoration: underline;
  }
  .about-icon {
    display: inline;
    width: 14px;
    height: 14px;
    vertical-align: -2px;
    fill: var(--accent);
    margin-right: 2px;
  }
</style>
