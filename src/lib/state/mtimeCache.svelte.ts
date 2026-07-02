/**
 * Shared mtime cache for external-change detection.
 *
 * Keyed by absolute file path so two tabs pointing at the same file share one
 * cache entry — avoids redundant syscalls and prevents a stale tab entry from
 * spuriously re-triggering.
 *
 * Entries are pruned when a tab is closed (see fileService.ts closeTabById)
 * to prevent unbounded growth over long sessions.
 */
const _cache = new Map<string, number>()

export function mtimeGet(path: string): number | undefined {
  return _cache.get(path)
}

export function mtimeSet(path: string, mtime: number): void {
  _cache.set(path, mtime)
}

export function mtimeDelete(path: string): void {
  _cache.delete(path)
}

export function mtimeClear(): void {
  _cache.clear()
}
