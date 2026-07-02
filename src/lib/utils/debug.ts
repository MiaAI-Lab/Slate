/**
 * Whether the app is running in development mode.
 * In production builds (vite build / tauri build), this is `false`.
 * All diagnostic console.log calls should be gated behind this flag
 * to avoid noise and minor performance cost in production.
 */
export const DEV = import.meta.env.DEV

/**
 * Conditional console.log — only prints in development mode.
 * Use this for scroll-position diagnostics, tab-switch traces, and
 * other debug output that should not reach production consoles.
 */
export function debugLog(...args: unknown[]) {
  if (DEV) console.log(...args)
}
