import type { CompareRow, PlannedAction } from '@shared/schemas/compare'
import type { JobFile, JobPair } from '@shared/schemas/job'
import { estimateWorkBytes } from '@shared/sync/order'
import path from 'node:path'

export function rowToPlannedAction(
  row: CompareRow,
  job: JobFile,
  pairs: JobPair[],
): PlannedAction | undefined {
  if (!row.included || row.action === 'Skip') return undefined

  const pair = pairs.find((p) => p.id === row.pairId)
  if (!pair) return undefined

  const leftPath = row.leftPath ?? path.join(pair.left, row.relPath)
  const rightPath = row.rightPath ?? path.join(pair.right, row.relPath)
  const isDir = row.left?.isDir ?? row.right?.isDir ?? false

  let sourcePath: string | undefined
  let destPath: string | undefined

  switch (row.action) {
    case 'Create':
      if (row.direction === 'leftToRight') {
        sourcePath = leftPath
        destPath = rightPath
      } else if (row.direction === 'rightToLeft') {
        sourcePath = rightPath
        destPath = leftPath
      }
      break
    case 'Update':
    case 'UpdateStreamsOnly':
    case 'TouchTime':
      if (row.direction === 'rightToLeft') {
        sourcePath = rightPath
        destPath = leftPath
      } else {
        sourcePath = leftPath
        destPath = rightPath
      }
      break
    case 'Delete':
      destPath = row.direction === 'rightToLeft' ? leftPath : rightPath
      break
    case 'Move':
    case 'Rename': {
      const fromRel = row.fromRelPath ?? row.relPath
      sourcePath = path.join(pair.right, fromRel)
      destPath = path.join(pair.right, row.relPath)
      break
    }
  }

  return {
    rowId: row.id,
    pairId: row.pairId,
    relPath: row.relPath,
    action: row.action,
    direction: row.direction,
    sourcePath,
    destPath,
    isDir,
    excludeStreams: job.ads.excludeStreams,
    workBytes: estimateWorkBytes(row),
  }
}

/** @deprecated Prefer streaming rowToPlannedAction from the compare store. */
export function buildPlannedActions(
  rows: CompareRow[],
  job: JobFile,
  pairs: JobPair[],
): PlannedAction[] {
  const actions: PlannedAction[] = []
  for (const row of rows) {
    const action = rowToPlannedAction(row, job, pairs)
    if (action) actions.push(action)
  }
  return actions
}
