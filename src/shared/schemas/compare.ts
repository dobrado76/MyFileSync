import type { AdsManifest } from '../ads/paths'
import type { JobFile } from '../schemas/job'

export type CompareCategory =
  | 'equal'
  | 'leftOnly'
  | 'rightOnly'
  | 'leftNewer'
  | 'rightNewer'
  | 'contentDiff'
  | 'adsDiff'
  | 'conflict'

export type SyncActionType =
  | 'Create'
  | 'Update'
  | 'UpdateStreamsOnly'
  | 'Delete'
  | 'Move'
  | 'Rename'
  | 'Skip'

export type SyncDirection = 'leftToRight' | 'rightToLeft' | 'none'

export type SideRecord = {
  relPath: string
  isDir: boolean
  dataSize: number
  mtimeMs: number
  primaryHash?: string
  adsManifest: AdsManifest
}

export type SideSummary = {
  size: number
  mtimeMs: number
  isDir: boolean
  primaryHash?: string
  adsManifest: AdsManifest
}

export type AdsDelta = {
  equal: boolean
  added: number
  removed: number
  changed: number
}

export type CompareRow = {
  id: string
  pairId: string
  relPath: string
  category: CompareCategory
  action: SyncActionType
  direction: SyncDirection
  included: boolean
  left?: SideSummary
  right?: SideSummary
  adsDelta: AdsDelta
  leftPath?: string
  rightPath?: string
  /** Previous relative path on the target when action is Move or Rename. */
  fromRelPath?: string
}

export type CompareStats = {
  total: number
  equal: number
  toSync: number
  creates: number
  updates: number
  deletes: number
  adsDiffs: number
  moves: number
}

export type CompareFilter =
  | 'all'
  | 'differences'
  | 'leftOnly'
  | 'rightOnly'
  | 'deleted'
  | 'moved'
  | 'adsDiff'
  | 'errors'

export type FolderTreeNode = {
  path: string
  name: string
  count: number
  creates: number
  updates: number
  deletes: number
  moves: number
  children: FolderTreeNode[]
}

export type PlannedAction = {
  rowId: string
  pairId: string
  relPath: string
  action: SyncActionType
  direction: SyncDirection
  sourcePath?: string
  destPath?: string
  isDir: boolean
  excludeStreams: string[]
}

export type SyncProgress = {
  phase: 'preparing' | 'copying' | 'deleting' | 'done' | 'cancelled'
  done: number
  total: number
  currentPath?: string
  errors: number
}

export type SyncSummary = {
  done: number
  total: number
  succeeded: number
  failed: number
  cancelled: boolean
  stats?: CompareStats
}

export type CompareRun = {
  runId: string
  jobId: string
  job: JobFile
  extraEqual: number
  stats: CompareStats
  cancelled: boolean
  createdAt: number
}

export function createEmptyStats(): CompareStats {
  return {
    total: 0,
    equal: 0,
    toSync: 0,
    creates: 0,
    updates: 0,
    deletes: 0,
    adsDiffs: 0,
    moves: 0,
  }
}
