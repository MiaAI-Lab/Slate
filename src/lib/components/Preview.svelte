<script lang="ts">
  import { renderMarkdown } from '$lib/renderer/render'
  import { previewState } from '$lib/state/preview.svelte'
  import { settingsState } from '$lib/state/settings.svelte'
  import { splitScroll } from '$lib/state/splitScroll.svelte'
  import { tabsState } from '$lib/state/tabs.svelte'

  const html = $derived(renderMarkdown(previewState.content))
  const t = $derived(settingsState.values.typography)
  const mode = $derived(tabsState.activeTab?.viewMode ?? 'editor')

  let scrollEl = $state<HTMLDivElement | undefined>()
  let articleEl = $state<HTMLElement | undefined>()

  // Source-line numbers of heading lines, in document order. The preview's
  // rendered DOM contains <h1>…<h6> in the same order, so the i-th heading
  // line maps to the i-th heading element.
  const headingLines = $derived.by((): number[] => {
    const md = previewState.content
    if (!md) return []
    const out: number[] = []
    const lines = md.split('\n')
    const re = /^#{1,6}\s+\S/
    let inFence = false
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/^\s*```/.test(line)) { inFence = !inFence; continue }
      if (inFence) continue
      if (re.test(line)) out.push(i + 1)
    }
    return out
  })

  // Largest index `i` with headingLines[i] <= topLine, or -1 if none.
  function pickHeadingIndex(lines: number[], topLine: number): number {
    let lo = 0, hi = lines.length - 1, ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (lines[mid] <= topLine) { ans = mid; lo = mid + 1 }
      else hi = mid - 1
    }
    return ans
  }

  $effect(() => {
    if (!settingsState.values.splitSyncScroll) return
    const line = splitScroll.editorTopLine
    if (mode !== 'split') return
    // Touch html so re-render invalidates the headings NodeList below.
    void html
    if (!scrollEl || !articleEl) return
    const idx = pickHeadingIndex(headingLines, line)
    if (idx < 0) {
      scrollEl.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    const headings = articleEl.querySelectorAll('h1,h2,h3,h4,h5,h6')
    const el = headings[idx] as HTMLElement | undefined
    if (!el) return
    // scrollIntoView is too aggressive; offset from top of scroll container.
    const top = el.offsetTop - 8
    scrollEl.scrollTo({ top, behavior: 'instant' })
  })

  function onWheel(e: WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const cur = settingsState.values.typography.previewFontSize
    const next = Math.max(10, Math.min(28, cur + (e.deltaY < 0 ? 1 : -1)))
    if (next !== cur) settingsState.values.typography.previewFontSize = next
  }
</script>

<div bind:this={scrollEl} class="h-full overflow-auto" onwheel={onWheel}>
  <article
    bind:this={articleEl}
    class="prose dark:prose-invert mx-auto px-8 py-8"
    style:font-family="var(--font-preview)"
    style:font-size="{t.previewFontSize}px"
    style:line-height={t.lineHeight}
    style:max-width="min(1280px, 100% - 2rem)"
  >
    {@html html}
  </article>
</div>
