import type { CompareRow, PlannedAction, SyncActionType } from '../schemas/compare'

const ACTION_TIER: Record<SyncActionType, number> = {
  Move: 0,
  Rename: 0,
  UpdateStreamsOnly: 1,
  Update: 2,
  Create: 3,
  Delete: 4,
  Skip: 99,
}

function sourceSide(row: CompareRow) {
  return row.direction === 'rightToLeft' ? row.right : row.left
}

function adsStreamBytes(row: CompareRow): number {
  const side = sourceSide(row)
  if (!side?.adsManifest?.length) return 1
  const total = side.adsManifest.reduce((sum, entry) => sum + entry.size, 0)
  return total > 0 ? total : 1
}

/** Rough bytes moved/copied — sorts small work before large within each action tier. */
export function estimateWorkBytes(row: CompareRow): number {
  switch (row.action) {
    case 'Move':
    case 'Rename':
    case 'Delete':
      return 0
    case 'UpdateStreamsOnly':
      return adsStreamBytes(row)
    case 'Update':
    case 'Create':
      return sourceSide(row)?.size ?? 0
    default:
      return 0
  }
}

function relPathDepth(relPath: string): number {
  return relPath.replace(/\\/g, '/').split('/').filter(Boolean).length
}

export function comparePlannedActions(a: PlannedAction, b: PlannedAction): number {
  const tierA = ACTION_TIER[a.action] ?? 99
  const tierB = ACTION_TIER[b.action] ?? 99
  if (tierA !== tierB) return tierA - tierB
  if (a.action === 'Create' || a.action === 'Delete') {
    const depthA = relPathDepth(a.relPath)
    const depthB = relPathDepth(b.relPath)
    if (depthA !== depthB) {
      return a.action === 'Delete' ? depthB - depthA : depthA - depthB
    }
  }
  if (a.workBytes !== b.workBytes) return a.workBytes - b.workBytes
  return a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' })
}

export function sortSyncActions(actions: PlannedAction[]): void {
  actions.sort(comparePlannedActions)
}
