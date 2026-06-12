<script lang="ts">
  import { fade } from 'svelte/transition'
  import { filePicker, type FileEntry } from '$lib/state/filePicker.svelte'

  let pathInput = $state('')

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') filePicker.cancel()
    else if (e.key === 'Enter') { navigateTo() }
  }

  async function navigateTo() {
    await filePicker.navigate(pathInput)
  }

  async function goUp() {
    const p = filePicker.currentPath
    const idx = p.lastIndexOf('/') > 0 ? p.lastIndexOf('/') : p.lastIndexOf('\\')
    if (idx > 0) {
      const up = p.slice(0, idx)
      pathInput = up
      await filePicker.navigate(up)
    }
  }
</script>

{#if filePicker.open}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <div class="picker-overlay" tabindex="-1" onkeydown={onKeydown} onclick={() => filePicker.cancel()} role="dialog" aria-modal="true" aria-label="Open file">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="picker-dialog" transition:fade={{ duration: 120 }} onclick={(e) => e.stopPropagation()}>
      <div class="picker-header">
        <span class="picker-title">Open File</span>
        <button class="picker-close" onclick={() => filePicker.cancel()} aria-label="Close">&times;</button>
      </div>

      <div class="picker-path-row">
        <input type="text" class="picker-input" bind:value={pathInput} placeholder="Path" onkeydown={(e) => { if (e.key === 'Enter') navigateTo() }} />
        <button class="picker-btn" onclick={navigateTo}>Go</button>
        <button class="picker-btn" onclick={goUp} title="Go up">&uarr;</button>
      </div>

      <div class="picker-list">
        {#each filePicker.entries as entry (entry.path)}
          <button class="picker-row" class:is-dir={entry.is_dir} ondblclick={() => { if (entry.is_dir) { pathInput = entry.path; filePicker.navigate(entry.path) } }} onclick={() => { if (!entry.is_dir) filePicker.select(entry.path) }} title={entry.path}>
            <span class="picker-icon">{entry.is_dir ? '\U0001F4C1' : '\U0001F4C4'}</span>
            <span class="picker-name">{entry.name}</span>
          </button>
        {:else}
          <div class="picker-empty">This folder is empty</div>
        {/each}
      </div>

      <div class="picker-footer">
        <span class="picker-path-display">{filePicker.currentPath}</span>
        <button class="picker-btn primary" onclick={() => filePicker.cancel()}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .picker-overlay { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
  .picker-dialog { width: 620px; max-width: 90vw; max-height: 80vh; display: flex; flex-direction: column; background: var(--bg-elev); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.3); overflow: hidden; }
  .picker-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .picker-title { font-weight: 600; font-size: 14px; color: var(--menu-fg); }
  .picker-close { width: 26px; height: 26px; border-radius: 4px; background: transparent; border: none; color: var(--fg-muted); font-size: 18px; cursor: pointer; }
  .picker-close:hover { background: rgba(0,0,0,0.06); color: var(--fg); }
  .picker-path-row { display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid var(--border); }
  .picker-input { flex: 1; padding: 6px 10px; border-radius: 4px; background: var(--bg); color: var(--fg); border: 1px solid var(--border); font-size: 13px; font-family: var(--font-editor); }
  .picker-input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
  .picker-btn { padding: 4px 12px; border-radius: 4px; font-size: 13px; background: transparent; color: var(--fg); border: 1px solid var(--border); cursor: pointer; }
  .picker-btn:hover { background: rgba(0,0,0,0.06); }
  .picker-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .picker-list { flex: 1; overflow-y: auto; padding: 4px 0; min-height: 200px; }
  .picker-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 16px; text-align: left; background: transparent; color: var(--fg); border: none; cursor: pointer; font-size: 13px; }
  .picker-row:hover { background: rgba(0,0,0,0.06); }
  .picker-row.is-dir { color: var(--accent); }
  .picker-icon { flex-shrink: 0; font-size: 14px; }
  .picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .picker-empty { padding: 24px 16px; text-align: center; color: var(--fg-muted); font-size: 13px; }
  .picker-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-top: 1px solid var(--border); gap: 12px; }
  .picker-path-display { flex: 1; font-size: 11px; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-editor); }
  :global(.dark) .picker-close:hover { background: rgba(255,255,255,0.08); }
  :global(.dark) .picker-row:hover { background: rgba(255,255,255,0.08); }
  :global(.dark) .picker-btn:hover { background: rgba(255,255,255,0.08); }
</style>
