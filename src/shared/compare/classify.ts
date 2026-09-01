import { manifestsEqual, sortManifest, withoutIgnoredStreams, type AdsManifest } from '../ads/paths'
import type { CompareCategory, CompareFilter, CompareRow, CompareStats, SideRecord, SideSummary, SyncActionType, SyncDirection, AdsDelta } from '../schemas/compare'
import { USN_CURSOR_STREAM_NAME } from '../compare/usnAds'
import { pairComparesAds, type JobFile } from '../schemas/job'

/** Streams compare/sync should ignore: exclude list and app USN cursor stream. */
export function adsIgnoredStreamNames(job: JobFile, pairId?: string): readonly string[] | 'all' {
  if (pairId) {
    const pair = job.pairs.find((item) => item.id === pairId)
    if (pair && !pairComparesAds(pair)) return 'all'
  }
  if (!job.ads.syncAllStreams) return 'all'
  return [...job.ads.excludeStreams, USN_CURSOR_STREAM_NAME]
}

export function computeAdsDelta(
  left?: AdsManifest,
  right?: AdsManifest,
  ignored: readonly string[] | 'all' = [],
): AdsDelta {
  const l = sortManifest(withoutIgnoredStreams(left ?? [], ignored))
  const r = sortManifest(withoutIgnoredStreams(right ?? [], ignored))
  const leftMap = new Map(l.map((e) => [e.name, e.size]))
  const rightMap = new Map(r.map((e) => [e.name, e.size]))

  let added = 0
  let removed = 0
  let changed = 0

  for (const [name, size] of rightMap) {
    if (!leftMap.has(name)) added++
    else if (leftMap.get(name) !== size) changed++
  }
  for (const name of leftMap.keys()) {
    if (!rightMap.has(name)) removed++
  }

  return {
    equal: manifestsEqual(l, r),
    added,
    removed,
    changed,
  }
}

export function toSideSummary(record: SideRecord): SideSummary {
  return {
    size: record.dataSize,
    mtimeMs: record.mtimeMs,
    isDir: record.isDir,
    adsManifest: record.adsManifest,
  }
}

/** True when both sides exist and classify would return category `equal` (no row allocated). */
export function pairIsEqual(
  left: SideRecord | undefined,
  right: SideRecord | undefined,
  job: JobFile,
  pairId?: string,
): boolean {
  if (!left || !right) return false
  return recordsEqual(left, right, adsIgnoredStreamNames(job, pairId))
}

export function recordsEqual(
  a: SideRecord,
  b: SideRecord,
  ignored: readonly string[] | 'all' = [],
): boolean {
  if (a.isDir !== b.isDir) return false
  if (a.isDir && b.isDir) {
    return manifestsEqual(
      withoutIgnoredStreams(a.adsManifest, ignored),
      withoutIgnoredStreams(b.adsManifest, ignored),
    )
  }
  if (a.dataSize !== b.dataSize) return false
  const adsEqual = manifestsEqual(
    withoutIgnoredStreams(a.adsManifest, ignored),
    withoutIgnoredStreams(b.adsManifest, ignored),
  )
  if (!adsEqual) return false
  return a.mtimeMs === b.mtimeMs
}

/** True when size and ADS match and only last-write time differs (safe to touch timestamps). */
export function isTimeOnlyFileDiff(
  job: JobFile,
  left: SideRecord,
  right: SideRecord,
  adsEqual: boolean,
): boolean {
  if (!job.behavior.touchTimeWhenSizeMatches) return false
  if (left.isDir || right.isDir) return false
  if (!adsEqual) return false
  if (left.dataSize !== right.dataSize) return false
  if (left.mtimeMs === right.mtimeMs) return false
  return true
}

export function maybeTouchTimeAction(
  job: JobFile,
  action: SyncActionType,
  left: SideRecord | undefined,
  right: SideRecord | undefined,
  adsEqual: boolean,
): SyncActionType {
  if (action !== 'Update' || !left || !right) return action
  return isTimeOnlyFileDiff(job, left, right, adsEqual) ? 'TouchTime' : action
}

export function classifyPair(
  pairId: string,
  relPath: string,
  left: SideRecord | undefined,
  right: SideRecord | undefined,
  job: JobFile,
): CompareRow {
  const adsDelta = computeAdsDelta(
    left?.adsManifest,
    right?.adsManifest,
    adsIgnoredStreamNames(job, pairId),
  )

  let category: CompareCategory = 'equal'
  if (!left && right) category = 'rightOnly'
  else if (left && !right) category = 'leftOnly'
  else if (left && right) {
    if (left.isDir && right.isDir) {
      category = adsDelta.equal ? 'equal' : 'adsDiff'
    } else if (recordsEqual(left, right, adsIgnoredStreamNames(job, pairId))) {
      category = 'equal'
    } else {
      const adsEqual = adsDelta.equal
      const dataEqual = left.dataSize === right.dataSize && left.mtimeMs === right.mtimeMs

      if (dataEqual && !adsEqual) {
        category = 'adsDiff'
      } else if (left.dataSize === right.dataSize && adsEqual) {
        if (left.mtimeMs > right.mtimeMs) category = 'leftNewer'
        else if (right.mtimeMs > left.mtimeMs) category = 'rightNewer'
        else category = 'contentDiff'
      } else {
        category = 'contentDiff'
      }
    }
  }

  const { action, direction, included } = planAction(category, job.variant)
  let syncAction = action
  if (left && right) {
    syncAction = maybeTouchTimeAction(job, action, left, right, adsDelta.equal)
  }

  const row: CompareRow = {
    id: crypto.randomUUID(),
    pairId,
    relPath,
    category,
    action: syncAction,
    direction,
    included,
    adsDelta,
    left: left ? toSideSummary(left) : undefined,
    right: right ? toSideSummary(right) : undefined,
  }

  return row
}

export function planAction(
  category: CompareCategory,
  variant: JobFile['variant'],
): { action: SyncActionType; direction: SyncDirection; included: boolean } {
  switch (category) {
    case 'equal':
      return { action: 'Skip', direction: 'none', included: false }
    case 'leftOnly':
      if (variant === 'mirror' || variant === 'update') {
        return { action: 'Create', direction: 'leftToRight', included: true }
      }
      if (variant === 'automatic') {
        return { action: 'Create', direction: 'leftToRight', included: true }
      }
      return { action: 'Skip', direction: 'none', included: false }
    case 'rightOnly':
      if (variant === 'mirror') {
        return { action: 'Delete', direction: 'none', included: true }
      }
      if (variant === 'automatic') {
        return { action: 'Create', direction: 'rightToLeft', included: true }
      }
      return { action: 'Skip', direction: 'none', included: false }
    case 'leftNewer':
    case 'contentDiff':
      if (variant === 'mirror' || variant === 'update') {
        return { action: 'Update', direction: 'leftToRight', included: true }
      }
      if (variant === 'automatic') {
        return { action: 'Update', direction: 'leftToRight', included: true }
      }
      return { action: 'Skip', direction: 'none', included: false }
    case 'rightNewer':
      if (variant === 'automatic') {
        return { action: 'Update', direction: 'rightToLeft', included: true }
      }
      if (variant === 'mirror' || variant === 'update') {
        return { action: 'Update', direction: 'leftToRight', included: true }
      }
      return { action: 'Skip', direction: 'none', included: false }
    case 'adsDiff':
      return { action: 'UpdateStreamsOnly', direction: 'leftToRight', included: true }
    case 'conflict':
      return { action: 'Skip', direction: 'none', included: false }
    default:
      return { action: 'Skip', direction: 'none', included: false }
  }
}

export function accountDiff(stats: CompareStats, row: CompareRow): void {
  stats.total++
  if (row.category === 'equal') stats.equal++
  if (row.included && row.action !== 'Skip') stats.toSync++
  if (row.action === 'Create') stats.creates++
  if (row.action === 'Update' || row.action === 'UpdateStreamsOnly' || row.action === 'TouchTime') stats.updates++
  if (row.action === 'Delete') stats.deletes++
  if (row.action === 'Move' || row.action === 'Rename') stats.moves++
  if (row.category === 'adsDiff' || !row.adsDelta.equal) stats.adsDiffs++
}

/** Inverse of {@link accountDiff} when removing a row from the change list. */
export function unaccountDiff(stats: CompareStats, row: CompareRow): void {
  stats.total--
  if (row.category === 'equal') stats.equal--
  if (row.included && row.action !== 'Skip') stats.toSync--
  if (row.action === 'Create') stats.creates--
  if (row.action === 'Update' || row.action === 'UpdateStreamsOnly' || row.action === 'TouchTime') stats.updates--
  if (row.action === 'Delete') stats.deletes--
  if (row.action === 'Move' || row.action === 'Rename') stats.moves--
  if (row.category === 'adsDiff' || !row.adsDelta.equal) stats.adsDiffs--
}

export function accountEquals(stats: CompareStats, count: number): void {
  stats.total += count
  stats.equal += count
}

export function computeStats(rows: CompareRow[], extraEqual = 0): CompareStats {
  const stats = {
    total: extraEqual,
    equal: extraEqual,
    toSync: 0,
    creates: 0,
    updates: 0,
    deletes: 0,
    adsDiffs: 0,
    moves: 0,
  }

  for (const row of rows) {
    accountDiff(stats, row)
  }

  return stats
}

export function categoryMatchesFilter(
  category: CompareCategory,
  adsEqual: boolean,
  filter: CompareFilter,
  action?: SyncActionType,
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'differences':
      return category !== 'equal'
    case 'leftOnly':
      return category === 'leftOnly'
    case 'rightOnly':
      return category === 'rightOnly'
    case 'deleted':
      return action === 'Delete'
    case 'moved':
      return action === 'Move' || action === 'Rename'
    case 'adsDiff':
      return category === 'adsDiff' || !adsEqual
    case 'errors':
      return false
    default:
      return true
  }
}

export function rowMatchesFilter(row: CompareRow, filter: CompareFilter): boolean {
  return categoryMatchesFilter(row.category, row.adsDelta.equal, filter, row.action)
}
