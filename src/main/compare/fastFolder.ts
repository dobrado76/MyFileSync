import type { FolderStats } from '../ads/cache'

/**
 * When left/right folder aggregate ADS stats all match, skip deep subtree walk.
 * Requires every configured stream name to be present and equal on both sides.
 */
export function canSkipSubtree(
  leftStats: FolderStats,
  rightStats: FolderStats,
  streamNames: readonly string[],
): boolean {
  if (streamNames.length === 0) return false

  for (const name of streamNames) {
    const left = leftStats[name]
    const right = rightStats[name]
    if (left === undefined || right === undefined) return false
    if (left !== right) return false
  }

  return true
}
