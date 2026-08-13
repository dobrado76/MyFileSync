import type { CompareRow } from '@shared/schemas/compare'
import type { CompareRowStore } from './rowStore'

export type MoveIndexEntry = {
  id: string
  pairId: string
  relPath: string
  action: 'Create' | 'Delete'
  isDir: boolean
  size: number
  mtimeMs: number
  name: string
  parent: string
  hash?: string
}

export type MovePair = {
  deleteId: string
  createId: string
  newRelPath: string
  oldRelPath: string
  kind: 'Move' | 'Rename'
}

function parentDir(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(0, idx) : ''
}

function baseName(relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return (idx >= 0 ? normalized.slice(idx + 1) : normalized).toLowerCase()
}

function timeKey(mtimeMs: number): number {
  return Math.round(mtimeMs)
}

function fileKey(entry: MoveIndexEntry): string {
  return `${entry.pairId}|${entry.size}|${timeKey(entry.mtimeMs)}`
}

function hashesCompatible(a?: string, b?: string): boolean {
  if (!a || !b) return true
  return a === b
}

/**
 * BackupMirror DetectMovedRenamed: pair Remove+Add with the same size and mtime
 * (NTFS Move preserves both). Same basename → Move; same parent → Rename.
 */
export function pairMoves(creates: MoveIndexEntry[], deletes: MoveIndexEntry[]): MovePair[] {
  const usedCreate = new Set<string>()
  const usedDelete = new Set<string>()
  const pairs: MovePair[] = []

  const createDirsByName = new Map<string, MoveIndexEntry[]>()
  const createFilesByFp = new Map<string, MoveIndexEntry[]>()
  const createDirsByFp = new Map<string, MoveIndexEntry[]>()

  for (const create of creates) {
    if (create.isDir) {
      const nameKey = `${create.pairId}|${create.name}`
      const list = createDirsByName.get(nameKey) ?? []
      list.push(create)
      createDirsByName.set(nameKey, list)
      const fp = fileKey(create)
      const fpList = createDirsByFp.get(fp) ?? []
      fpList.push(create)
      createDirsByFp.set(fp, fpList)
    } else {
      const fp = fileKey(create)
      const list = createFilesByFp.get(fp) ?? []
      list.push(create)
      createFilesByFp.set(fp, list)
    }
  }

  function take(
    deleteEntry: MoveIndexEntry,
    createEntry: MoveIndexEntry,
    kind: 'Move' | 'Rename',
  ): void {
    usedDelete.add(deleteEntry.id)
    usedCreate.add(createEntry.id)
    pairs.push({
      deleteId: deleteEntry.id,
      createId: createEntry.id,
      newRelPath: createEntry.relPath,
      oldRelPath: deleteEntry.relPath,
      kind,
    })
  }

  function unused(list: MoveIndexEntry[] | undefined, pairId: string): MoveIndexEntry[] {
    return (list ?? []).filter((c) => c.pairId === pairId && !usedCreate.has(c.id))
  }

  for (const del of deletes) {
    if (!del.isDir || usedDelete.has(del.id)) continue
    const sameName = unused(createDirsByName.get(`${del.pairId}|${del.name}`), del.pairId)
    const timed = sameName.filter((c) => timeKey(c.mtimeMs) === timeKey(del.mtimeMs))
    const pick = timed.length === 1 ? timed[0] : sameName.length === 1 ? sameName[0] : undefined
    if (!pick) continue
    take(del, pick, parentDir(del.relPath) === parentDir(pick.relPath) ? 'Rename' : 'Move')
  }

  for (const del of deletes) {
    if (del.isDir || usedDelete.has(del.id)) continue
    const cands = unused(createFilesByFp.get(fileKey(del)), del.pairId).filter((c) =>
      hashesCompatible(c.hash, del.hash),
    )
    if (cands.length === 0) continue
    const sameName = cands.filter((c) => c.name === del.name)
    const pick = sameName.length === 1 ? sameName[0] : cands.length === 1 ? cands[0] : undefined
    if (!pick) continue
    take(del, pick, parentDir(del.relPath) === parentDir(pick.relPath) ? 'Rename' : 'Move')
  }

  for (const del of deletes) {
    if (!del.isDir || usedDelete.has(del.id)) continue
    const cands = unused(createDirsByFp.get(fileKey(del)), del.pairId)
    const pick = cands.length === 1 ? cands[0] : undefined
    if (!pick) continue
    take(del, pick, parentDir(del.relPath) === parentDir(pick.relPath) ? 'Rename' : 'Move')
  }

  return pairs
}

export function entryFromRow(row: CompareRow): MoveIndexEntry | undefined {
  if (row.action !== 'Create' && row.action !== 'Delete') return undefined
  const side = row.action === 'Create' ? row.left : row.right ?? row.left
  if (!side) return undefined
  return {
    id: row.id,
    pairId: row.pairId,
    relPath: row.relPath,
    action: row.action,
    isDir: side.isDir,
    size: side.size,
    mtimeMs: side.mtimeMs,
    name: baseName(row.relPath),
    parent: parentDir(row.relPath),
    hash: side.primaryHash,
  }
}

export function toMovedRow(deleteRow: CompareRow, createRow: CompareRow, kind: 'Move' | 'Rename'): CompareRow {
  return {
    ...deleteRow,
    relPath: createRow.relPath,
    action: kind,
    direction: 'leftToRight',
    included: true,
    left: createRow.left ?? deleteRow.left,
    right: deleteRow.right ?? createRow.right,
    adsDelta: createRow.adsDelta,
    fromRelPath: deleteRow.relPath,
  }
}

/**
 * Pair Create/Delete rows already in the compare store. Does not walk the disk —
 * collapsed new folders stay one Create (BackupMirror only paired listed Add+Remove).
 */
export async function applyMoveDetection(store: CompareRowStore): Promise<number> {
  const stats = store.getStats()
  if (stats.creates === 0 || stats.deletes === 0) return 0

  const creates: MoveIndexEntry[] = []
  const deletes: MoveIndexEntry[] = []
  const createRows = new Map<string, CompareRow>()
  const deleteRows = new Map<string, CompareRow>()

  for await (const row of store.iterateAll()) {
    const entry = entryFromRow(row)
    if (!entry) continue
    if (entry.action === 'Create') {
      creates.push(entry)
      createRows.set(row.id, row)
    } else {
      deletes.push(entry)
      deleteRows.set(row.id, row)
    }
  }

  if (creates.length === 0 || deletes.length === 0) return 0

  const pairs = pairMoves(creates, deletes)
  if (pairs.length === 0) return 0

  const dropIds = new Set<string>()
  const replacements = new Map<string, CompareRow>()

  for (const pair of pairs) {
    const deleteRow = deleteRows.get(pair.deleteId)
    const createRow = createRows.get(pair.createId)
    if (!deleteRow || !createRow) continue
    const moved = toMovedRow(deleteRow, createRow, pair.kind)
    moved.relPath = pair.newRelPath
    moved.fromRelPath = pair.oldRelPath
    replacements.set(pair.deleteId, moved)
    dropIds.add(pair.createId)
  }

  await store.applyReplacements(dropIds, replacements)
  return pairs.length
}
