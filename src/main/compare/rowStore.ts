import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'
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
} from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'

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
  private count = 0
  private bytes = 0
  private includedOverrides = new Map<string, boolean>()
  private stats: CompareStats = createEmptyStats()
  private extraEqual = 0
  private fh: fs.promises.FileHandle | null = null

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
    await new Promise<void>((resolve, reject) => {
      this.stream.end((err: Error | null | undefined) => {
        if (err) reject(err)
        else resolve()
      })
    })
    this.fh = await fsp.open(this.filePath, 'r')
  }

  async getPage(
    offset: number,
    limit: number,
    filter: CompareFilter,
  ): Promise<{ rows: CompareRow[]; total: number }> {
    const rows: CompareRow[] = []
    let total = 0
    for (let i = 0; i < this.count; i++) {
      if (!this.matches(i, filter)) continue
      if (total >= offset && rows.length < limit) {
        const row = await this.readIndex(i)
        if (row) rows.push(row)
      }
      total++
    }
    return { rows, total }
  }

  async *iterateIncluded(): AsyncGenerator<CompareRow> {
    for (let i = 0; i < this.count; i++) {
      const row = await this.readIndex(i)
      if (!row) continue
      if (!row.included || row.action === 'Skip') continue
      yield row
    }
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
    const category = CODE_CATEGORY[this.categories[index] ?? 0] ?? 'equal'
    const adsEqual = this.adsEqualBits[index] === 1
    return categoryMatchesFilter(category, adsEqual, filter)
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
  }
}

export async function openCompareRowStore(runId: string): Promise<CompareRowStore> {
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
  if (row.right) row.rightPath = path.join(pair.right, row.relPath)
  return row
}
