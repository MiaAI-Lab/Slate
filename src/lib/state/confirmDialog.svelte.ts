export type CloseChoice = 'save' | 'discard' | 'cancel'

type CloseResolver = (choice: CloseChoice) => void
type ConfirmResolver = (ok: boolean) => void

type Mode = 'close' | 'confirm'

class ConfirmDialogState {
  open = $state(false)
  title = $state('')
  message = $state('')
  mode = $state<Mode>('close')
  confirmLabel = $state('OK')
  cancelLabel = $state('Cancel')
  danger = $state(false)
  private closeResolver: CloseResolver | null = null
  private confirmResolver: ConfirmResolver | null = null

  /** 3-button Save/No/Cancel prompt used when closing a dirty tab. */
  confirmClose(title: string, message: string): Promise<CloseChoice> {
    return new Promise<CloseChoice>(resolve => {
      this.resolvePending('cancel', false)
      this.title = title
      this.message = message
      this.mode = 'close'
      this.danger = false
      this.closeResolver = resolve
      this.open = true
    })
  }

  /** 2-button OK/Cancel prompt. `danger=true` styles the OK button red. */
  confirm(title: string, message: string, opts: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      this.resolvePending('cancel', false)
      this.title = title
      this.message = message
      this.mode = 'confirm'
      this.confirmLabel = opts.confirmLabel ?? 'OK'
      this.cancelLabel = opts.cancelLabel ?? 'Cancel'
      this.danger = opts.danger ?? false
      this.confirmResolver = resolve
      this.open = true
    })
  }

  choose(choice: CloseChoice) {
    const r = this.closeResolver
    this.open = false
    this.closeResolver = null
    r?.(choice)
  }

  decide(ok: boolean) {
    const r = this.confirmResolver
    this.open = false
    this.confirmResolver = null
    r?.(ok)
  }

  private resolvePending(closeChoice: CloseChoice, confirmValue: boolean) {
    if (this.closeResolver) { this.closeResolver(closeChoice); this.closeResolver = null }
    if (this.confirmResolver) { this.confirmResolver(confirmValue); this.confirmResolver = null }
  }
}

export const confirmDialog = new ConfirmDialogState()
