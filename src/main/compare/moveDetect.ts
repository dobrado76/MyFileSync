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
}

export type MovePair = {
  deleteId: string
  createId: string
  newRelPath: string
  oldRelPath: string
  kind: 'Move' | 'Rename'
}

/** FAT / coarse timestamp grids and post-copy clock skew. */
export const MOVE_DETECT_MTIME_TOLERANCE_MS = 2000

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

function exactFileKey(entry: MoveIndexEntry): string {
  return `${entry.pairId}|${entry.size}|${timeKey(entry.mtimeMs)}`
}

function sizeKey(entry: MoveIndexEntry): string {
  return `${entry.pairId}|${entry.size}`
}

function mtimesLooselyMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= MOVE_DETECT_MTIME_TOLERANCE_MS
}

function moveKind(deleteEntry: MoveIndexEntry, createEntry: MoveIndexEntry): 'Move' | 'Rename' {
  return parentDir(deleteEntry.relPath) === parentDir(createEntry.relPath) ? 'Rename' : 'Move'
}

/** Prefer matching basename, then a sole candidate. */
export function pickMoveCandidate(
  deleteEntry: MoveIndexEntry,
  candidates: MoveIndexEntry[],
): MoveIndexEntry | undefined {
  if (candidates.length === 0) return undefined

  const sameName = candidates.filter((c) => c.name === deleteEntry.name)
  if (sameName.length === 1) return sameName[0]
  if (candidates.length === 1) return candidates[0]
  return undefined
}

/**
 * Pair Remove+Add rows into Move/Rename.
 * Passes: exact size+mtime → size+loose mtime → uniquely-sized leftover (no hashing).
 */
export function pairMoves(creates: MoveIndexEntry[], deletes: MoveIndexEntry[]): MovePair[] {
  const usedCreate = new Set<string>()
  const usedDelete = new Set<string>()
  const pairs: MovePair[] = []

  function take(deleteEntry: MoveIndexEntry, createEntry: MoveIndexEntry): void {
    usedDelete.add(deleteEntry.id)
    usedCreate.add(createEntry.id)
    pairs.push({
      deleteId: deleteEntry.id,
      createId: createEntry.id,
      newRelPath: createEntry.relPath,
      oldRelPath: deleteEntry.relPath,
      kind: moveKind(deleteEntry, createEntry),
    })
  }

  function unusedCreates(list: MoveIndexEntry[] | undefined, pairId: string): MoveIndexEntry[] {
    return (list ?? []).filter((c) => c.pairId === pairId && !usedCreate.has(c.id))
  }

  function indexCreates(keyFn: (entry: MoveIndexEntry) => string | null): Map<string, MoveIndexEntry[]> {
    const map = new Map<string, MoveIndexEntry[]>()
    for (const create of creates) {
      if (create.isDir || usedCreate.has(create.id)) continue
      const key = keyFn(create)
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(create)
      map.set(key, list)
    }
    return map
  }

  function passIndexed(keyFn: (entry: MoveIndexEntry) => string | null): void {
    const createMap = indexCreates(keyFn)
    for (const del of deletes) {
      if (del.isDir || usedDelete.has(del.id)) continue
      const key = keyFn(del)
      if (!key) continue
      const pick = pickMoveCandidate(del, unusedCreates(createMap.get(key), del.pairId))
      if (pick) take(del, pick)
    }
  }

  passIndexed(exactFileKey)

  for (const del of deletes) {
    if (del.isDir || usedDelete.has(del.id)) continue
    const cands = creates.filter(
      (c) =>
        !c.isDir &&
        !usedCreate.has(c.id) &&
        c.pairId === del.pairId &&
        c.size === del.size &&
        mtimesLooselyMatch(c.mtimeMs, del.mtimeMs),
    )
    const pick = pickMoveCandidate(del, cands)
    if (pick) take(del, pick)
  }

  const deletesBySize = new Map<string, MoveIndexEntry[]>()
  const createsBySize = new Map<string, MoveIndexEntry[]>()
  for (const del of deletes) {
    if (del.isDir || usedDelete.has(del.id)) continue
    const key = sizeKey(del)
    const list = deletesBySize.get(key) ?? []
    list.push(del)
    deletesBySize.set(key, list)
  }
  for (const create of creates) {
    if (create.isDir || usedCreate.has(create.id)) continue
    const key = sizeKey(create)
    const list = createsBySize.get(key) ?? []
    list.push(create)
    createsBySize.set(key, list)
  }
  for (const [key, dels] of deletesBySize) {
    const cres = createsBySize.get(key) ?? []
    if (dels.length !== 1 || cres.length !== 1) continue
    const del = dels[0]!
    const pick = pickMoveCandidate(del, cres)
    if (pick) take(del, pick)
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
 * Pair Create/Delete **files** already in the compare store. Folders stay Create/Delete
 * so a moved directory is still one row per nested item (FreeFileSync).
 */
export async function applyMoveDetection(store: CompareRowStore): Promise<number> {
  const stats = store.getStats()
  if (stats.creates === 0 || stats.deletes === 0) return 0

  const creates: MoveIndexEntry[] = []
  const deletes: MoveIndexEntry[] = []

  for await (const row of store.iterateAll()) {
    const entry = entryFromRow(row)
    if (!entry) continue
    if (entry.action === 'Create') creates.push(entry)
    else deletes.push(entry)
  }

  if (creates.length === 0 || deletes.length === 0) return 0

  const pairs = pairMoves(creates, deletes)
  if (pairs.length === 0) return 0

  const dropIds = new Set<string>()
  const replacements = new Map<string, CompareRow>()

  for (const pair of pairs) {
    const deleteRow = await store.getRow(pair.deleteId)
    const createRow = await store.getRow(pair.createId)
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
