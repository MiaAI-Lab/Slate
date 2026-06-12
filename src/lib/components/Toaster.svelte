<script lang="ts">
  import { toast } from '$lib/state/toast.svelte'
  import { tabsState } from '$lib/state/tabs.svelte'
  import { invoke } from '@tauri-apps/api/core'

  function reloadAndDismiss(t: typeof toast.items[number]) {
    const tabId = t.reloadTabId
    if (!tabId) { toast.dismiss(t.id); return }
    reloadTab(tabId)
    toast.dismiss(t.id)
  }

  async function reloadTab(tabId: string) {
    const tab = tabsState.tabs.find(tb => tb.id === tabId)
    if (!tab || !tab.path) return
    try {
      const content = await invoke<string>('read_file', { path: tab.path })
      tabsState.loadContent(tab.id, content, tab.path, tab.title)
      tabsState.setExternallyChanged(tab.id, false)
    } catch (e) {
      toast.error('Reload failed', String(e))
    }
  }
</script>

<div class="toast-stack" aria-live="polite" aria-atomic="true">
  {#each toast.items as t (t.id)}
    {#if !t.reloadTabId}
      <div class="toast" class:success={t.kind === 'success'} class:error={t.kind === 'error'} class:info={t.kind === 'info'} role="status">
        <div class="flex-1 min-w-0">
          <div class="toast-title">{t.title}</div>
          {#if t.description}
            <div class="toast-desc">{t.description}</div>
          {/if}
        </div>
        <button class="toast-close" aria-label="Dismiss" onclick={() => toast.dismiss(t.id)}>×</button>
      </div>
    {/if}
  {/each}
</div>

{#each toast.items as t (t.id)}
  {#if t.reloadTabId}
    <div class="toast-center" role="alertdialog" aria-modal="true">
      <div class="toast" class:info={true}>
        <div class="flex-1 min-w-0">
          <div class="toast-title">{t.title}</div>
          {#if t.description}
            <div class="toast-desc">{t.description}</div>
          {/if}
        </div>
        <button class="toast-action" onclick={() => reloadAndDismiss(t)}>Reload</button>
        <button class="toast-close" aria-label="Dismiss" onclick={() => toast.dismiss(t.id)}>×</button>
      </div>
    </div>
  {/if}
{/each}

<style>
  .toast-stack {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
    max-width: 380px;
  }
  .toast-center {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 200;
  }
  .toast {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--bg-elev);
    color: var(--fg);
    border: 1px solid var(--border);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-size: 13px;
    animation: slide-in 200ms ease-out;
  }
  .toast.success { border-left: 3px solid #10b981; }
  .toast.error   { border-left: 3px solid var(--danger); }
  .toast.info    { border-left: 3px solid var(--accent); }
  .toast-title { font-weight: 600; }
  .toast-desc {
    margin-top: 2px;
    color: var(--fg-muted);
    font-size: 12px;
    word-break: break-word;
  }
  .toast-close {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }
  .toast-close:hover { background: rgba(0,0,0,0.06); color: var(--fg); }
  :global(.dark) .toast-close:hover { background: rgba(255,255,255,0.08); }
  .toast-action {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: 4px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    line-height: 1;
  }
  .toast-action:hover { opacity: 0.85; }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
