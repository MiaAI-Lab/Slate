import { invoke } from "@tauri-apps/api/core"

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
}

class FilePickerState {
  open = $state(false)
  currentPath = $state("")
  entries = $state<FileEntry[]>([])
  resolve: ((path: string | null) => void) | null = null

  async show(startPath?: string) {
    this.currentPath = startPath ?? await this.getDefaultPath()
    await this.loadEntries()
    this.open = true
    return new Promise<string | null>((resolve) => {
      this.resolve = resolve
    })
  }

  private async getDefaultPath(): Promise<string> {
    try {
      const { appDataDir } = await import("@tauri-apps/api/path")
      return await appDataDir()
    } catch {
      return "C:\\"
    }
  }

  async loadEntries() {
    try {
      this.entries = await invoke<FileEntry[]>("list_dir", { path: this.currentPath })
    } catch {
      this.entries = []
    }
  }

  async navigate(dir: string) {
    this.currentPath = dir
    await this.loadEntries()
  }

  async goUp() {
    const p = this.currentPath.replace(/\\$/, "")
    const idx = p.lastIndexOf("\\")
    if (idx > 0) {
      await this.navigate(p.slice(0, idx))
    }
  }

  select(path: string) {
    this.open = false
    this.resolve?.(path)
    this.resolve = null
  }

  cancel() {
    this.open = false
    this.resolve?.(null)
    this.resolve = null
  }
}

export const filePicker = new FilePickerState()
