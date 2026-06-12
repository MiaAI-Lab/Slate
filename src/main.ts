import { mount } from 'svelte'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import App from './App.svelte'
import './app.css'
import { initSettings } from '$lib/state/settings.svelte'
import { initSession } from '$lib/state/session.svelte'
import { tabsState } from '$lib/state/tabs.svelte'
import { initLogging } from '$lib/utils/logging'
import { openPathInTab } from '$lib/utils/fileService'

// IMPORTANT: top-level `await` here causes a module-evaluation deadlock in
// production. `initSettings()` dynamically imports `@tauri-apps/plugin-store`,
// whose chunk has a static import back into this main bundle. While main.ts
// is suspended on the await, that re-entrant static import waits for main.ts
// to finish evaluating — and the cycle never resolves.
//
// Wrapping the boot logic in an async function lets main.ts evaluate fully
// (synchronously, top-level), so when the store chunk's static back-import
// resolves, the main module is already finished.
async function boot() {
  await initSettings()
  // Spawned secondary windows (opened via File > New window) start fresh —
  // only the primary window restores the persisted draft session, otherwise
  // the same drafts would re-open in every window.
  const isSpawned = new URLSearchParams(window.location.search).has('spawned')
  if (!isSpawned) await initSession()

  // Drain any file paths passed via "Open with" / CLI argv. Done before we
  // ensure a default empty tab exists so a launch-with-file doesn't leave a
  // stray Untitled tab next to it. Secondary "spawned" windows skip this so
  // the same files don't reopen in every window.
  if (!isSpawned) {
    try {
      const pending = await invoke<string[]>('take_pending_open_paths')
      for (const p of pending) {
        try { await openPathInTab(p) } catch (err) { console.error('open-with failed', err) }
      }
    } catch (err) { console.error('take_pending_open_paths failed', err) }
  }

  if (tabsState.tabs.length === 0) tabsState.newTab()

  // Subsequent "Open with" launches arrive via the single-instance plugin as
  // an `open-file` event carrying the list of paths.
  listen<string[]>('open-file', async (event) => {
    for (const p of event.payload ?? []) {
      try { await openPathInTab(p) } catch (err) { console.error('open-file event failed', err) }
    }
  }).catch(() => {})

  initLogging().catch(() => {})
  mount(App, { target: document.getElementById('app')! })
  // The window is configured `visible: false` so the white flash before our
  // first paint is hidden behind the OS. Reveal it after mount so the user
  // sees the rendered editor as the first thing on screen.
  requestAnimationFrame(() => {
    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().show().catch(() => {}))
      .catch(() => {})
  })
}
boot().catch((e) => { console.error('boot failed', e) })
