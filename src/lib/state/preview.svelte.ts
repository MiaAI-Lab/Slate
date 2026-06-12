import { tabsState } from './tabs.svelte'

const LARGE_FILE_BYTES = 100_000

class PreviewState {
  content = $state('')
  private timer: number | null = null

  constructor() {
    $effect.root(() => {
      $effect(() => {
        const c = tabsState.activeTab?.content ?? ''
        if (this.timer != null) clearTimeout(this.timer)
        const delay = c.length > LARGE_FILE_BYTES ? 400 : 150
        this.timer = window.setTimeout(() => {
          this.content = c
        }, delay)
      })
    })
  }
}

export const previewState = new PreviewState()
