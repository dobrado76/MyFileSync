import { manifestsEqual } from '@shared/ads/paths'
import { computeStats } from '@shared/compare/classify'
import type { CompareRow, SideSummary } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'

function sameFingerprint(a: SideSummary, b: SideSummary): boolean {
  if (a.isDir !== b.isDir) return false
  if (a.size !== b.size) return false
  if (a.primaryHash && b.primaryHash && a.primaryHash !== b.primaryHash) return false
  return manifestsEqual(a.adsManifest, b.adsManifest)
}

function parentDir(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

function isRename(oldPath: string, newPath: string): boolean {
  return parentDir(oldPath) === parentDir(newPath)
}

/**
 * Collapse delete+create pairs with identical hash, size, and ADS manifest into Move/Rename.
 *
 * Mirror pattern: `rightOnly` delete (old path on target) paired with `leftOnly` create
 * (new path on source) when fingerprints match.
 */
export function detectMovedRenamed(rows: CompareRow[], job: JobFile): CompareRow[] {
  if (!job.behavior.detectMovedRenamed) return rows

  const result = [...rows]
  const consumed = new Set<string>()

  const deletes = result.filter((r) => r.action === 'Delete' && r.included)
  const creates = result.filter((r) => r.action === 'Create' && r.included)

  for (const deleteRow of deletes) {
    if (consumed.has(deleteRow.id)) continue

    const deletedSide = deleteRow.right ?? deleteRow.left
    if (!deletedSide) continue

    const createRow = creates.find((candidate) => {
      if (consumed.has(candidate.id)) return false
      const createdSide = candidate.left ?? candidate.right
      if (!createdSide) return false
      return sameFingerprint(deletedSide, createdSide)
    })

    if (!createRow) continue

    consumed.add(deleteRow.id)
    consumed.add(createRow.id)

    const rename = isRename(deleteRow.relPath, createRow.relPath)
    const deleteIdx = result.findIndex((r) => r.id === deleteRow.id)
    if (deleteIdx < 0) continue

    result[deleteIdx] = {
      ...deleteRow,
      id: crypto.randomUUID(),
      relPath: createRow.relPath,
      action: rename ? 'Rename' : 'Move',
      direction: 'leftToRight',
      included: true,
      left: createRow.left ?? deleteRow.left,
      right: deleteRow.right ?? createRow.right,
      leftPath: createRow.leftPath ?? deleteRow.leftPath,
      rightPath: deleteRow.rightPath ?? createRow.rightPath,
      adsDelta: createRow.adsDelta,
    }

    const createIdx = result.findIndex((r) => r.id === createRow.id)
    if (createIdx >= 0) {
      result.splice(createIdx, 1)
    }
  }

  return result
}

export function finalizeRowsAfterMoveDetect(rows: CompareRow[], job: JobFile): {
  rows: CompareRow[]
  stats: ReturnType<typeof computeStats>
} {
  const updated = detectMovedRenamed(rows, job)
  return { rows: updated, stats: computeStats(updated) }
}
