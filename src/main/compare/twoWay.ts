import path from 'node:path'
import { minimatch } from 'minimatch'
import {
  computeAdsDelta,
  recordsEqual,
  toSideSummary,
} from '@shared/compare/classify'
import type {
  CompareCategory,
  CompareRow,
  SideRecord,
  SyncActionType,
  SyncDirection,
} from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'
import { unionSortedRelPaths, type ComparePairInput } from './merge'
import type { FileState, PairFileStates } from '../db/syncState'

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/')
}

function matchSyncRulePattern(relPath: string, pattern: string): boolean {
  const normalized = normalizeRelPath(relPath)
  const name = normalized.split('/').pop() ?? normalized
  const normalizedPattern = pattern.replace(/\\/g, '/')
  if (normalizedPattern.includes('/')) {
    return minimatch(normalized, normalizedPattern, { dot: true, nocase: true })
  }
  return minimatch(name, normalizedPattern, { dot: true, nocase: true })
}

function applySyncRules(row: CompareRow, job: JobFile): CompareRow {
  for (const rule of job.syncRules) {
    if (!matchSyncRulePattern(row.relPath, rule.pattern)) continue
    switch (rule.action) {
      case 'exclude':
        return { ...row, action: 'Skip', direction: 'none', included: false }
      case 'include':
        if (row.category !== 'equal') {
          return { ...row, included: true }
        }
        break
      case 'forceMirror':
        if (row.left && !row.right) {
          return {
            ...row,
            action: 'Create',
            direction: 'leftToRight',
            included: true,
          }
        }
        if (row.right && !row.left) {
          return { ...row, action: 'Delete', direction: 'none', included: true }
        }
        if (row.left && row.right) {
          return {
            ...row,
            action: row.category === 'adsDiff' ? 'UpdateStreamsOnly' : 'Update',
            direction: 'leftToRight',
            included: true,
          }
        }
        break
      case 'forceUpdate':
        if (row.left) {
          return {
            ...row,
            action: row.category === 'adsDiff' ? 'UpdateStreamsOnly' : 'Update',
            direction: 'leftToRight',
            included: true,
          }
        }
        break
      default:
        break
    }
  }
  return row
}

function planTwoWayAction(
  category: CompareCategory,
): { action: SyncActionType; direction: SyncDirection; included: boolean } {
  switch (category) {
    case 'equal':
      return { action: 'Skip', direction: 'none', included: false }
    case 'leftOnly':
      return { action: 'Create', direction: 'leftToRight', included: true }
    case 'rightOnly':
      return { action: 'Create', direction: 'rightToLeft', included: true }
    case 'leftNewer':
    case 'contentDiff':
      return { action: 'Update', direction: 'leftToRight', included: true }
    case 'rightNewer':
      return { action: 'Update', direction: 'rightToLeft', included: true }
    case 'adsDiff':
      return { action: 'UpdateStreamsOnly', direction: 'leftToRight', included: true }
    case 'conflict':
      return { action: 'Skip', direction: 'none', included: false }
    default:
      return { action: 'Skip', direction: 'none', included: false }
  }
}

function sideChanged(
  current: SideRecord | undefined,
  prev: FileState | undefined,
  hashContent: boolean,
): boolean {
  if (!current && prev) return true
  if (current && !prev) return true
  if (current && prev) {
    const prevRecord: SideRecord = {
      relPath: prev.relPath,
      isDir: false,
      dataSize: prev.size,
      mtimeMs: prev.mtimeMs,
      primaryHash: prev.primaryHash ?? undefined,
      adsManifest: prev.adsManifest,
    }
    return !recordsEqual(current, prevRecord, hashContent)
  }
  return false
}

export function classifyTwoWayPair(
  pairId: string,
  relPath: string,
  left: SideRecord | undefined,
  right: SideRecord | undefined,
  job: JobFile,
  prevStates?: { left?: FileState; right?: FileState },
): CompareRow {
  const adsDelta = computeAdsDelta(left?.adsManifest, right?.adsManifest)
  const hashContent =
    job.compare.method === 'content' ||
    (job.compare.hashWhenSizeOrTimeDiffers && Boolean(left && right))

  const prevLeft = prevStates?.left
  const prevRight = prevStates?.right

  let category: CompareCategory = 'equal'
  let deleteOnLeft = false

  if (!left && !right) {
    category = 'equal'
  } else if (!left && right) {
    if (prevLeft && prevRight) {
      category = 'leftOnly'
      deleteOnLeft = false
    } else {
      category = 'rightOnly'
    }
  } else if (left && !right) {
    if (prevLeft && prevRight) {
      category = 'rightOnly'
      deleteOnLeft = true
    } else {
      category = 'leftOnly'
    }
  } else if (left && right) {
    const dataEqual =
      left.dataSize === right.dataSize &&
      left.mtimeMs === right.mtimeMs &&
      (!hashContent ||
        !left.primaryHash ||
        !right.primaryHash ||
        left.primaryHash === right.primaryHash)
    const adsEqual = adsDelta.equal

    if (dataEqual && adsEqual) {
      category = 'equal'
    } else if (dataEqual && !adsEqual) {
      category = 'adsDiff'
    } else {
      const leftChangedSinceSync = sideChanged(left, prevLeft, hashContent)
      const rightChangedSinceSync = sideChanged(right, prevRight, hashContent)

      if (leftChangedSinceSync && rightChangedSinceSync) {
        if (left.mtimeMs > right.mtimeMs) category = 'leftNewer'
        else if (right.mtimeMs > left.mtimeMs) category = 'rightNewer'
        else category = 'conflict'
      } else if (leftChangedSinceSync) {
        category = left.mtimeMs >= right.mtimeMs ? 'leftNewer' : 'contentDiff'
      } else if (rightChangedSinceSync) {
        category = right.mtimeMs >= left.mtimeMs ? 'rightNewer' : 'contentDiff'
      } else if (left.mtimeMs > right.mtimeMs) {
        category = 'leftNewer'
      } else if (right.mtimeMs > left.mtimeMs) {
        category = 'rightNewer'
      } else {
        category = 'contentDiff'
      }
    }
  }

  let { action, direction, included } = planTwoWayAction(category)

  if (!left && right && prevLeft && prevRight) {
    action = 'Delete'
    direction = 'none'
    included = true
  } else if (deleteOnLeft) {
    action = 'Delete'
    direction = 'rightToLeft'
    included = true
  }

  const row: CompareRow = {
    id: crypto.randomUUID(),
    pairId,
    relPath,
    category,
    action,
    direction,
    included,
    adsDelta,
    left: left ? toSideSummary(left) : undefined,
    right: right ? toSideSummary(right) : undefined,
  }

  return applySyncRules(row, job)
}

export function mergePairRowsTwoWay(
  input: ComparePairInput,
  job: JobFile,
  pairStates: PairFileStates,
): CompareRow[] {
  const rows: CompareRow[] = []
  for (const relPath of unionSortedRelPaths(input.leftRecords, input.rightRecords)) {
    const left = input.leftRecords.get(relPath)
    const right = input.rightRecords.get(relPath)
    const prev = pairStates.get(relPath)
    const row = classifyTwoWayPair(input.pair.id, relPath, left, right, job, prev)
    row.leftPath = left ? path.join(input.pair.left, relPath) : undefined
    row.rightPath = right ? path.join(input.pair.right, relPath) : undefined
    rows.push(row)
  }
  return rows
}
