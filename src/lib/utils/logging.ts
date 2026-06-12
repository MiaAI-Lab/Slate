type LogFn = (msg: string) => Promise<void>

let info: LogFn = async () => {}
let warn: LogFn = async () => {}
let error: LogFn = async () => {}

let initialized = false

export async function initLogging() {
  if (initialized) return
  initialized = true
  try {
    const m = await import('@tauri-apps/plugin-log')
    info = m.info
    warn = m.warn
    error = m.error
  } catch {
    // Running outside Tauri — keep no-ops.
    return
  }

  const truncate = (s: unknown) => {
    const str = typeof s === 'string' ? s : (() => {
      try { return JSON.stringify(s) } catch { return String(s) }
    })()
    return str.length > 200 ? str.slice(0, 200) + '…' : str
  }

  window.addEventListener('error', (e) => {
    error(`uncaught: ${truncate(e.message)}`).catch(() => {})
  })
  window.addEventListener('unhandledrejection', (e) => {
    error(`unhandledrejection: ${truncate(e.reason)}`).catch(() => {})
  })

  info('md-editor frontend ready').catch(() => {})
}

export const log = {
  info: (msg: string) => info(msg).catch(() => {}),
  warn: (msg: string) => warn(msg).catch(() => {}),
  error: (msg: string) => error(msg).catch(() => {}),
}
