<script lang="ts">
  import { confirmDialog } from '$lib/state/confirmDialog.svelte'

  let dialogEl = $state<HTMLDialogElement | undefined>()
  let saveBtn = $state<HTMLButtonElement | undefined>()
  let noBtn = $state<HTMLButtonElement | undefined>()
  let cancelBtn = $state<HTMLButtonElement | undefined>()
  let okBtn = $state<HTMLButtonElement | undefined>()
  let cancel2Btn = $state<HTMLButtonElement | undefined>()

  function buttons(): HTMLButtonElement[] {
    if (confirmDialog.mode === 'confirm') {
      return [okBtn, cancel2Btn].filter((b): b is HTMLButtonElement => !!b)
    }
    return [saveBtn, noBtn, cancelBtn].filter((b): b is HTMLButtonElement => !!b)
  }

  function moveFocus(delta: 1 | -1) {
    const bs = buttons()
    if (bs.length === 0) return
    const active = document.activeElement as HTMLElement | null
    const idx = bs.findIndex(b => b === active)
    const next = idx < 0
      ? (delta === 1 ? 0 : bs.length - 1)
      : (idx + delta + bs.length) % bs.length
    bs[next].focus()
  }

  $effect(() => {
    if (!dialogEl) return
    if (confirmDialog.open && !dialogEl.open) {
      dialogEl.showModal()
      queueMicrotask(() => {
        if (confirmDialog.mode === 'confirm') {
          // Focus Cancel by default on destructive prompts so Enter isn't a yes-by-accident.
          (confirmDialog.danger ? cancel2Btn : okBtn)?.focus()
        } else {
          saveBtn?.focus()
        }
      })
    } else if (!confirmDialog.open && dialogEl.open) {
      dialogEl.close()
    }
  })

  function dismiss() {
    if (confirmDialog.mode === 'confirm') confirmDialog.decide(false)
    else confirmDialog.choose('cancel')
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      dismiss()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const active = document.activeElement as HTMLButtonElement | null
      if (confirmDialog.mode === 'confirm') {
        if (active === cancel2Btn) confirmDialog.decide(false)
        else confirmDialog.decide(true)
      } else {
        if (active === noBtn) confirmDialog.choose('discard')
        else if (active === cancelBtn) confirmDialog.choose('cancel')
        else confirmDialog.choose('save')
      }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      moveFocus(1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      moveFocus(-1)
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      // Use e.code (physical key) so accelerators work on non-Latin layouts.
      const code = e.code
      if (confirmDialog.mode === 'confirm') {
        if (code === 'KeyY' || code === 'KeyO') { e.preventDefault(); confirmDialog.decide(true) }
        else if (code === 'KeyN' || code === 'KeyC') { e.preventDefault(); confirmDialog.decide(false) }
      } else {
        if (code === 'KeyN') { e.preventDefault(); confirmDialog.choose('discard') }
        else if (code === 'KeyS') { e.preventDefault(); confirmDialog.choose('save') }
        else if (code === 'KeyC') { e.preventDefault(); confirmDialog.choose('cancel') }
      }
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  class="rounded-md shadow-xl p-0 min-w-[380px] max-w-[520px]"
  style="background: var(--bg-elev); color: var(--fg); border: 1px solid var(--border);"
  onkeydown={onKey}
  oncancel={(e) => { e.preventDefault(); dismiss() }}
>
  <div class="p-5">
    <h2 class="text-base font-semibold mb-2">{confirmDialog.title}</h2>
    <p class="text-sm" style="color: var(--fg-muted);">{confirmDialog.message}</p>
  </div>
  <div class="flex gap-2 p-3 justify-end" style="border-top: 1px solid var(--border);">
    {#if confirmDialog.mode === 'confirm'}
      <button
        type="button"
        class="dlg-btn"
        class:primary={!confirmDialog.danger}
        class:danger={confirmDialog.danger}
        bind:this={okBtn}
        onclick={() => confirmDialog.decide(true)}
      >{confirmDialog.confirmLabel}</button>
      <button type="button" class="dlg-btn ghost" bind:this={cancel2Btn} onclick={() => confirmDialog.decide(false)}>{confirmDialog.cancelLabel}</button>
    {:else}
      <button type="button" class="dlg-btn primary" bind:this={saveBtn} onclick={() => confirmDialog.choose('save')}><u>S</u>ave</button>
      <button type="button" class="dlg-btn ghost" bind:this={noBtn} onclick={() => confirmDialog.choose('discard')}><u>N</u>o</button>
      <button type="button" class="dlg-btn ghost" bind:this={cancelBtn} onclick={() => confirmDialog.choose('cancel')}><u>C</u>ancel</button>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    position: fixed;
    inset: 0;
    margin: auto;
  }
  dialog::backdrop {
    background: transparent;
  }
  .dlg-btn {
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 13px;
    border: 1px solid var(--border);
    cursor: pointer;
    /* Sized to the natural width of "Cancel" with the current padding/font
       so Save / No / OK grow to match — gives the dialog footer a uniform
       button rhythm instead of three different-sized rectangles. */
    min-width: 4.75rem;
    text-align: center;
  }
  .dlg-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .dlg-btn.ghost {
    background: transparent;
    color: var(--fg);
  }
  .dlg-btn.ghost:hover { background: rgba(0, 0, 0, 0.06); }
  :global(.dark) .dlg-btn.ghost:hover { background: rgba(255, 255, 255, 0.08); }
  .dlg-btn.primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }
  .dlg-btn.primary:hover { filter: brightness(1.1); }
  .dlg-btn.danger {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }
  .dlg-btn.danger:hover { filter: brightness(1.1); }
  .dlg-btn.danger:focus-visible {
    outline-color: var(--danger);
  }
</style>
