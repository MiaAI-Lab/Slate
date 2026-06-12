import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { buildExportHTML } from './exportHtml'
import { resolvedDark, settingsState } from '$lib/state/settings.svelte'
import { toast } from '$lib/state/toast.svelte'

function sanitizeName(title: string): string {
  const stripped = title.replace(/\.(md|markdown|mdx|txt)$/i, '')
  return stripped.replace(/[\\/:*?"<>|]/g, '_') || 'untitled'
}

export async function exportHTML(title: string, content: string): Promise<void> {
  try {
    const path = await save({
      filters: [{ name: 'HTML', extensions: ['html'] }],
      defaultPath: `${sanitizeName(title)}.html`,
    })
    if (typeof path !== 'string') return
    const dark = resolvedDark(settingsState.values.theme)
    const html = buildExportHTML(title, content, { dark })
    await invoke('write_file', { path, content: html })
    toast.success('Exported HTML', path)
  } catch (e) {
    toast.error('HTML export failed', String(e))
  }
}

export async function exportPDF(title: string, content: string): Promise<void> {
  try {
    const dark = resolvedDark(settingsState.values.theme)
    const html = buildExportHTML(title, content, { dark })
    await invoke('export_pdf', { html, title })
  } catch (e) {
    toast.error('PDF export failed', String(e))
  }
}

export async function printActive(title: string, content: string): Promise<void> {
  try {
    const dark = resolvedDark(settingsState.values.theme)
    const html = buildExportHTML(title, content, { dark })
    await invoke('export_pdf', { html, title })
  } catch (e) {
    toast.error('Print failed', String(e))
  }
}
