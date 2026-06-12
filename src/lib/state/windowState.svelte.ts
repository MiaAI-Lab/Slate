class WindowState {
  fullscreen = $state(false)
}

export const windowState = new WindowState()

export async function toggleFullscreen() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    const next = !windowState.fullscreen
    await w.setFullscreen(next)
    windowState.fullscreen = next
  } catch (e) {
    console.error('Fullscreen toggle failed', e)
  }
}

export async function syncFullscreenState() {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    windowState.fullscreen = await w.isFullscreen()
  } catch {
    // Not running under Tauri (e.g., plain vite dev).
  }
}
