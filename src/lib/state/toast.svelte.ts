export interface ToastItem {
  id: number
  kind: 'success' | 'error' | 'info'
  title: string
  description?: string
  ttlMs: number
  createdAt: number
  reloadTabId?: string
}

class ToastState {
  items = $state<ToastItem[]>([])
  private seq = 0

  push(kind: ToastItem['kind'], title: string, description?: string, ttlMs = 5000, reloadTabId?: string) {
    const id = ++this.seq
    const item: ToastItem = { id, kind, title, description, ttlMs, createdAt: Date.now(), reloadTabId }
    this.items.push(item)
    if (ttlMs > 0) {
      window.setTimeout(() => this.dismiss(id), ttlMs)
    }
    return id
  }

  success(title: string, description?: string) { return this.push('success', title, description) }
  error(title: string, description?: string) { return this.push('error', title, description, 8000) }
  info(title: string, description?: string) { return this.push('info', title, description) }

  fileChanged(tabId: string, title: string) {
    return this.push('info', 'File changed on disk', `${title} was modified externally.`, 0, tabId)
  }

  dismiss(id: number) {
    this.items = this.items.filter(t => t.id !== id)
  }

  clear() { this.items = [] }
}

export const toast = new ToastState()
