import type { CompareRow, PlannedAction } from '@shared/schemas/compare'
import type { JobFile, JobPair } from '@shared/schemas/job'
import path from 'node:path'

export function buildPlannedActions(
  rows: CompareRow[],
  job: JobFile,
  pairs: JobPair[],
): PlannedAction[] {
  const pairMap = new Map(pairs.map((p) => [p.id, p]))
  const actions: PlannedAction[] = []

  for (const row of rows) {
    if (!row.included || row.action === 'Skip') continue

    const pair = pairMap.get(row.pairId)
    if (!pair) continue

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
        if (row.direction === 'rightToLeft') {
          sourcePath = rightPath
          destPath = leftPath
        } else {
          sourcePath = leftPath
          destPath = rightPath
        }
        break
      case 'Delete':
        if (row.direction === 'rightToLeft') {
          destPath = row.leftPath ?? leftPath
        } else {
          destPath = row.rightPath ?? rightPath
        }
        break
      default:
        break
    }

    actions.push({
      rowId: row.id,
      pairId: row.pairId,
      relPath: row.relPath,
      action: row.action,
      direction: row.direction,
      sourcePath,
      destPath,
      isDir,
      excludeStreams: job.ads.excludeStreams,
    })
  }

  return sortActions(actions)
}

function sortActions(actions: PlannedAction[]): PlannedAction[] {
  const order = (action: PlannedAction['action']): number => {
    switch (action) {
      case 'Create':
        return 1
      case 'Update':
      case 'UpdateStreamsOnly':
        return 2
      case 'Delete':
        return 3
      default:
        return 4
    }
  }

  return [...actions].sort((a, b) => {
    const diff = order(a.action) - order(b.action)
    if (diff !== 0) return diff
    return a.relPath.localeCompare(b.relPath)
  })
}
