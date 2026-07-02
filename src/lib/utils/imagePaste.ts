import { invoke } from '@tauri-apps/api/core'
import { basename } from '@tauri-apps/api/path'
import type { EditorView } from '@codemirror/view'
import { tabsState } from '$lib/state/tabs.svelte'
import { toast } from '$lib/state/toast.svelte'

/** File extensions we handle as dropped images. */
const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg)$/i

/** Extension for each MIME type. */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

/**
 * Generate a timestamp-based filename like `image-20260702-094523.png`.
 */
function generateImageFilename(ext: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `image-${ts}.${ext}`
}

/**
 * Determine the directory where the image should be saved.
 * Returns the directory path ending with "assets", or null if the file is unsaved.
 */
function getAssetsDir(): string | null {
  const tab = tabsState.activeTab
  if (!tab || !tab.path) return null
  const parts = tab.path.replace(/\\/g, '/').split('/')
  parts.pop() // remove filename
  parts.push('assets')
  return parts.join('/')
}

/**
 * Insert markdown image syntax at the current cursor position.
 * Uses a relative path from the file's directory.
 */
function insertImageMarkdown(view: EditorView, imagePath: string, alt: string) {
  const sel = view.state.selection.main
  // Compute a relative path from the file's directory to the assets folder.
  const tab = tabsState.activeTab
  let insertPath = imagePath
  if (tab?.path) {
    const fileDir = tab.path.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const imgDir = imagePath.replace(/\\/g, '/')
    if (imgDir.startsWith(fileDir + '/')) {
      insertPath = imgDir.slice(fileDir.length + 1)
    }
  }
  const md = `![${alt}](${insertPath.replace(/\\/g, '/')})`
  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: md },
    selection: { anchor: sel.from + md.length },
    userEvent: 'input.paste',
  })
}

/**
 * Handle a pasted image from the clipboard event.
 * Called from Editor.svelte's onpaste handler when image data is detected.
 *
 * @param view - The CodeMirror EditorView
 * @param file - The File object from the clipboard event's items
 */
export async function handleImagePaste(view: EditorView, file: File): Promise<void> {
  const ext = MIME_TO_EXT[file.type] ?? 'png'
  const filename = generateImageFilename(ext)
  const assetsDir = getAssetsDir()

  if (!assetsDir) {
    toast.error('Cannot paste image', 'Save the file first to define an assets folder.')
    return
  }

  const fullPath = `${assetsDir}/${filename}`

  try {
    const buffer = await file.arrayBuffer()
    const data = new Uint8Array(buffer)
    await invoke('write_image_file', { path: fullPath, data })
    insertImageMarkdown(view, fullPath, filename.replace(/\.\w+$/, ''))
  } catch (e) {
    toast.error('Failed to save image', String(e))
  }
}

/**
 * Handle a dropped image file.
 * Copies the file to the assets/ folder and inserts markdown.
 *
 * @returns true if the file was handled as an image, false otherwise.
 */
export async function handleImageDrop(path: string, view: EditorView): Promise<boolean> {
  if (!IMAGE_EXTS.test(path)) return false

  const assetsDir = getAssetsDir()
  if (!assetsDir) {
    toast.error('Cannot drop image', 'Save the file first to define an assets folder.')
    return true
  }

  const filename = await basename(path)
  const destPath = `${assetsDir}/${filename}`

  try {
    // Read the source file and write to destination
    const content = await invoke<number[]>('read_file_binary', { path })
    await invoke('write_image_file', { path: destPath, data: content })
    const alt = filename.replace(/\.\w+$/, '')
    insertImageMarkdown(view, destPath, alt)
    return true
  } catch (e) {
    toast.error('Failed to drop image', String(e))
    return true
  }
}
