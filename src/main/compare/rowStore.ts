import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  accountDiff,
  accountEquals,
  categoryMatchesFilter,
} from '@shared/compare/classify'
import {
  createEmptyStats,
  type CompareCategory,
  type CompareFilter,
  type CompareRow,
  type CompareStats,
  type FolderTreeNode,
  type SyncActionType,
} from '@shared/schemas/compare'
import {
  createFolderTreeBuilder,
  isMultiPairTree,
  rowMatchesTreePath,
  type PairTreeLabel,
} from '@shared/compare/folderTree'
import type { JobFile } from '@shared/schemas/job'
import { yieldToEventLoop } from '../win32/nativeLock'

const CATEGORY_CODE: Record<CompareCategory, number> = {
  equal: 0,
  leftOnly: 1,
  rightOnly: 2,
  leftNewer: 3,
  rightNewer: 4,
  contentDiff: 5,
  adsDiff: 6,
  conflict: 7,
}

const CODE_CATEGORY: CompareCategory[] = [
  'equal',
  'leftOnly',
  'rightOnly',
  'leftNewer',
  'rightNewer',
  'contentDiff',
  'adsDiff',
  'conflict',
]

/**
 * Append-only JSONL change list. Offsets + category live in compact typed arrays;
 * row objects are parsed only for the current grid page or the current sync action.
 */
export class CompareRowStore {
  readonly filePath: string
  private stream: fs.WriteStream
  private offsets = new Uint32Array(1024)
  private categories = new Uint8Array(1024)
  private adsEqualBits = new Uint8Array(1024)
  private includedBits = new Uint8Array(1024)
  private deleteBits = new Uint8Array(1024)
  private moveBits = new Uint8Array(1024)
  private count = 0
  private bytes = 0
  private includedOverrides = new Map<string, boolean>()
  private syncErrorIds = new Set<string>()
  private stats: CompareStats = createEmptyStats()
  private extraEqual = 0
  private fh: fs.promises.FileHandle | null = null
  private writableClosed = false
  private pairIds: string[] = []
  private relPaths: string[] = []
  private fromRelPaths: string[] = []
  private actions: SyncActionType[] = []
  private dirBits = new Uint8Array(1024)

  constructor(filePath: string) {
    this.filePath = filePath
    this.stream = fs.createWriteStream(filePath, { flags: 'w' })
  }

  async append(row: CompareRow): Promise<void> {
    row.id = String(this.count)
    const line = `${JSON.stringify(row)}\n`
    if (this.count >= this.offsets.length) this.grow()
    this.offsets[this.count] = this.bytes
    this.categories[this.count] = CATEGORY_CODE[row.category]
    this.adsEqualBits[this.count] = row.adsDelta.equal ? 1 : 0
    this.includedBits[this.count] = row.included ? 1 : 0
    this.deleteBits[this.count] = row.action === 'Delete' ? 1 : 0
    this.moveBits[this.count] = row.action === 'Move' || row.action === 'Rename' ? 1 : 0
    this.recordSlim(this.count, row)
    this.count++
    accountDiff(this.stats, row)
    const size = Buffer.byteLength(line)
    this.bytes += size
    if (this.bytes > 0xfffffff0) {
      throw new Error('Compare change list exceeded 4 GB. Narrow the folder pair or add filters.')
    }
    if (!this.stream.write(line)) {
      await new Promise<void>((resolve) => this.stream.once('drain', resolve))
    }
  }

  addEquals(count: number): void {
    this.extraEqual += count
    accountEquals(this.stats, count)
  }

  getStats(): CompareStats {
    return { ...this.stats }
  }

  get length(): number {
    return this.count
  }

  markSyncError(rowId: string): void {
    this.syncErrorIds.add(rowId)
  }

  clearSyncError(rowId: string): void {
    this.syncErrorIds.delete(rowId)
  }

  clearSyncErrors(): void {
    this.syncErrorIds.clear()
  }

  hasSyncErrors(): boolean {
    return this.syncErrorIds.size > 0
  }

  setIncluded(rowId: string, included: boolean): boolean {
    const index = Number(rowId)
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return false
    const currently = this.includedOverrides.get(rowId) ?? this.includedBits[index] === 1
    if (currently === included) return true
    this.includedOverrides.set(rowId, included)
    if (included) this.stats.toSync++
    else this.stats.toSync--
    return true
  }

  async close(): Promise<void> {
    if (!this.writableClosed) {
      this.writableClosed = true
      await new Promise<void>((resolve, reject) => {
        this.stream.end((err: Error | null | undefined) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
    if (!this.fh) this.fh = await fsp.open(this.filePath, 'r')
  }

  async getPage(
    offset: number,
    limit: number,
    filter: CompareFilter,
    pathPrefix = '',
    pairLabels?: PairTreeLabel[],
  ): Promise<{ rows: CompareRow[]; total: number }> {
    const multiPair = isMultiPairTree(pairLabels)
    const rows: CompareRow[] = []
    let total = 0
    for (let i = 0; i < this.count; i++) {
      if (!this.matches(i, filter)) continue
      if (pathPrefix && !this.slimMatchesPrefix(i, pathPrefix, multiPair)) continue
      if (total >= offset && rows.length < limit) {
        const row = await this.readIndex(i)
        if (row) rows.push(row)
      }
      total++
    }
    return { rows, total }
  }

  async getFolderTree(filter: CompareFilter, pairLabels?: PairTreeLabel[]): Promise<FolderTreeNode> {
    const builder = createFolderTreeBuilder(pairLabels)
    for (let i = 0; i < this.count; i++) {
      if (!this.matches(i, filter)) continue
      builder.add({
        pairId: this.pairIds[i] ?? '',
        relPath: this.relPaths[i] ?? '',
        fromRelPath: this.fromRelPaths[i] || undefined,
        action: this.actions[i] ?? 'Skip',
        category: CODE_CATEGORY[this.categories[i] ?? 0],
        left: this.dirBits[i] === 1 ? { isDir: true } : undefined,
      })
      if (i > 0 && i % 8192 === 0) await yieldToEventLoop()
    }
    return builder.finish()
  }

  async getRow(rowId: string): Promise<CompareRow | undefined> {
    const index = Number(rowId)
    if (!Number.isInteger(index) || index < 0 || index >= this.count) return undefined
    return this.readIndex(index)
  }

  async dropMatching(match: (row: CompareRow) => boolean): Promise<number> {
    const dropIds = new Set<string>()
    for await (const row of this.iterateAll()) {
      if (match(row)) dropIds.add(row.id)
    }
    if (dropIds.size === 0) return 0
    await this.applyReplacements(dropIds, new Map())
    return dropIds.size
  }

  async *iterateIncluded(): AsyncGenerator<CompareRow> {
    for await (const row of this.iterateAll()) {
      if (!row.included || row.action === 'Skip') continue
      yield row
    }
  }

  async *iterateAll(): AsyncGenerator<CompareRow> {
    for (let i = 0; i < this.count; i++) {
      const row = await this.readIndex(i)
      if (row) yield row
    }
  }

  async applyReplacements(dropIds: Set<string>, replacements: Map<string, CompareRow>): Promise<void> {
    if (dropIds.size === 0 && replacements.size === 0) return
    if (!this.fh) throw new Error('Compare store is not readable.')

    const tmpPath = `${this.filePath}.tmp`
    const tmp = fs.createWriteStream(tmpPath)
    const offsets = new Uint32Array(Math.max(1024, this.count))
    const categories = new Uint8Array(Math.max(1024, this.count))
    const adsEqualBits = new Uint8Array(Math.max(1024, this.count))
    const includedBits = new Uint8Array(Math.max(1024, this.count))
    const deleteBits = new Uint8Array(Math.max(1024, this.count))
    const moveBits = new Uint8Array(Math.max(1024, this.count))
    const dirBits = new Uint8Array(Math.max(1024, this.count))
    const pairIds: string[] = []
    const relPaths: string[] = []
    const fromRelPaths: string[] = []
    const actions: SyncActionType[] = []
    const stats = createEmptyStats()
    accountEquals(stats, this.extraEqual)

    let count = 0
    let bytes = 0

    const write = async (row: CompareRow): Promise<void> => {
      if (count >= offsets.length) {
        /* grow handled by using this.count as capacity; fall through */
      }
      row.id = String(count)
      const line = `${JSON.stringify(row)}\n`
      offsets[count] = bytes
      categories[count] = CATEGORY_CODE[row.category]
      adsEqualBits[count] = row.adsDelta.equal ? 1 : 0
      includedBits[count] = row.included ? 1 : 0
      deleteBits[count] = row.action === 'Delete' ? 1 : 0
      moveBits[count] = row.action === 'Move' || row.action === 'Rename' ? 1 : 0
      dirBits[count] = row.left?.isDir || row.right?.isDir ? 1 : 0
      pairIds[count] = row.pairId
      relPaths[count] = row.relPath
      fromRelPaths[count] = row.fromRelPath ?? ''
      actions[count] = row.action
      count++
      accountDiff(stats, row)
      const size = Buffer.byteLength(line)
      bytes += size
      if (!tmp.write(line)) {
        await new Promise<void>((resolve) => tmp.once('drain', resolve))
      }
    }

    for (let i = 0; i < this.count; i++) {
      const row = await this.readIndex(i)
      if (!row) continue
      if (dropIds.has(row.id)) continue
      await write(replacements.get(row.id) ?? row)
    }

    await new Promise<void>((resolve, reject) => {
      tmp.end((err: Error | null | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })

    await this.fh.close()
    this.fh = null
    await fsp.unlink(this.filePath)
    await fsp.rename(tmpPath, this.filePath)

    this.offsets = offsets
    this.categories = categories
    this.adsEqualBits = adsEqualBits
    this.includedBits = includedBits
    this.deleteBits = deleteBits
    this.moveBits = moveBits
    this.dirBits = dirBits
    this.pairIds = pairIds
    this.relPaths = relPaths
    this.fromRelPaths = fromRelPaths
    this.actions = actions
    this.count = count
    this.bytes = bytes
    this.stats = stats
    this.fh = await fsp.open(this.filePath, 'r')
  }

  async dispose(): Promise<void> {
    try {
      await this.fh?.close()
    } catch {
      /* ignore */
    }
    this.fh = null
    try {
      await fsp.unlink(this.filePath)
    } catch {
      /* ignore */
    }
  }

  private matches(index: number, filter: CompareFilter): boolean {
    if (filter === 'errors') {
      return this.syncErrorIds.has(String(index))
    }
    const category = CODE_CATEGORY[this.categories[index] ?? 0] ?? 'equal'
    const adsEqual = this.adsEqualBits[index] === 1
    const action =
      this.deleteBits[index] === 1 ? 'Delete' : this.moveBits[index] === 1 ? 'Move' : undefined
    return categoryMatchesFilter(category, adsEqual, filter, action)
  }

  private async readIndex(index: number): Promise<CompareRow | undefined> {
    if (!this.fh) return undefined
    const start = this.offsets[index]
    if (start === undefined) return undefined
    const row = await this.readLine(start)
    if (!row) return undefined
    const override = this.includedOverrides.get(row.id)
    if (override !== undefined) row.included = override
    return row
  }

  private async readLine(fileOffset: number): Promise<CompareRow | undefined> {
    if (!this.fh) return undefined
    const buf = Buffer.alloc(4096)
    let acc = ''
    let pos = fileOffset
    for (;;) {
      const { bytesRead } = await this.fh.read(buf, 0, buf.length, pos)
      if (bytesRead === 0) break
      const chunk = buf.toString('utf8', 0, bytesRead)
      const nl = chunk.indexOf('\n')
      if (nl >= 0) {
        acc += chunk.slice(0, nl)
        break
      }
      acc += chunk
      pos += bytesRead
      if (acc.length > 1_000_000) break
    }
    if (!acc) return undefined
    try {
      return JSON.parse(acc) as CompareRow
    } catch {
      return undefined
    }
  }

  private grow(): void {
    const next = this.offsets.length * 2
    const offsets = new Uint32Array(next)
    offsets.set(this.offsets)
    this.offsets = offsets
    const categories = new Uint8Array(next)
    categories.set(this.categories)
    this.categories = categories
    const ads = new Uint8Array(next)
    ads.set(this.adsEqualBits)
    this.adsEqualBits = ads
    const included = new Uint8Array(next)
    included.set(this.includedBits)
    this.includedBits = included
    const deletes = new Uint8Array(next)
    deletes.set(this.deleteBits)
    this.deleteBits = deletes
    const moves = new Uint8Array(next)
    moves.set(this.moveBits)
    this.moveBits = moves
    const dirs = new Uint8Array(next)
    dirs.set(this.dirBits)
    this.dirBits = dirs
  }

  private recordSlim(index: number, row: CompareRow): void {
    this.pairIds[index] = row.pairId
    this.relPaths[index] = row.relPath
    this.fromRelPaths[index] = row.fromRelPath ?? ''
    this.actions[index] = row.action
    this.dirBits[index] = row.left?.isDir || row.right?.isDir ? 1 : 0
  }

  private slimMatchesPrefix(index: number, pathPrefix: string, multiPair: boolean): boolean {
    return rowMatchesTreePath(
      {
        pairId: this.pairIds[index] ?? '',
        relPath: this.relPaths[index] ?? '',
        fromRelPath: this.fromRelPaths[index] || undefined,
      },
      pathPrefix,
      multiPair,
    )
  }
}

export async function openCompareRowStore(runId: string): Promise<CompareRowStore> {
  const { app } = await import('electron')
  const dir = path.join(app.getPath('userData'), 'compare')
  await fsp.mkdir(dir, { recursive: true })
  const entries = await fsp.readdir(dir)
  for (const entry of entries) {
    await fsp.unlink(path.join(dir, entry)).catch(() => undefined)
  }
  return new CompareRowStore(path.join(dir, `${runId}.jsonl`))
}

export function hydrateRowPaths(row: CompareRow, job: JobFile): CompareRow {
  const pair = job.pairs.find((p) => p.id === row.pairId)
  if (!pair) return row
  if (row.left) row.leftPath = path.join(pair.left, row.relPath)
  if (row.action === 'Move' || row.action === 'Rename') {
    row.rightPath = path.join(pair.right, row.fromRelPath ?? row.relPath)
  } else if (row.right) {
    row.rightPath = path.join(pair.right, row.relPath)
  }
  return row
}
