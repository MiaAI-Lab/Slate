<script lang="ts">
  import { tabsState } from '$lib/state/tabs.svelte'
  import { cursorState } from '$lib/state/cursor.svelte'

  function wordCount(md: string): number {
    const stripped = md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '')
    return stripped.split(/\s+/).filter(Boolean).length
  }

  const tab = $derived(tabsState.activeTab)
  const content = $derived(tab?.content ?? '')
  const words = $derived(wordCount(content))
  const chars = $derived(content.length)
  const reading = $derived(Math.max(1, Math.ceil(words / 220)))
</script>

<div
  class="flex items-center gap-4 px-3 h-7 text-xs select-none border-t"
  style="background: var(--bg-elev); border-color: var(--border); color: var(--fg-muted);"
>
  <span class="truncate flex-1" title={tab?.path ?? ''}>
    {tab?.path ?? (tab ? 'Unsaved' : 'No file')}
  </span>
  {#if tab}
    <span>Markdown</span>
    <span>{words.toLocaleString()} words</span>
    <span>{chars.toLocaleString()} chars</span>
    <span>{reading} min read</span>
    <span>L{cursorState.line} C{cursorState.col}</span>
  {/if}
</div>
