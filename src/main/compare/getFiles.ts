import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { compilePathFilter, isSystemSkipPath } from '@shared/compare/filters'
import { classifyPair, pairIsEqual } from '@shared/compare/classify'
import type { AdsManifest } from '@shared/ads/paths'
import type { CompareRow, SideRecord, SideSummary } from '@shared/schemas/compare'
import type { JobFile, JobPair } from '@shared/schemas/job'
import { readFileHashCache, writeFileHashCache, readFolderStats } from '../ads/cache'
import { listStreamsSync } from '../ads/list'
import { canSkipSubtree } from './fastFolder'
import { yieldToEventLoop } from '../win32/nativeLock'
import { readDirectoryWin32, type DirEntry } from '../win32/find'
import { classifyTwoWayPair } from './twoWay'
import type { PairFileStates } from '../db/syncState'

export type GetFilesResult = {
  equalCount: number
  scanned: number
  diffCount: number
}

type GetFilesOptions = {
  pair: JobPair
  job: JobFile
  pairStates?: PairFileStates
  onDiff: (row: CompareRow) => void | Promise<void>
  onProgress?: (relPath: string) => void
  isCancelled?: () => boolean
}

/** Yield often enough for Cancel IPC; not on every item. */
const YIELD_INTERVAL_MS = 75

/**
 * BackupMirror GetFiles, memory-safe:
 * - Equals are counted, never stored.
 * - A folder missing on the other side is one Create/Delete; children are not listed
 *   (sync copies or removes the tree). 75 million files in a new folder → one row.
 * - File-level diffs are emitted one at a time via onDiff (caller must not buffer them all).
 */
export async function getFiles(options: GetFilesOptions): Promise<GetFilesResult> {
  let equalCount = 0
  let scanned = 0
  let diffCount = 0
  let lastYieldAt = Date.now()
  const seen = new Set<string>()

  const leftRoot = options.pair.left
  const rightRoot = options.pair.right
  const job = options.job
  const hashContent = job.compare.method === 'content' && job.compare.contentHash !== 'none'
  const includeLeft = compilePathFilter(job.filters.include, job.filters.exclude, leftRoot)
  const includeRight =
    leftRoot.toLowerCase() === rightRoot.toLowerCase()
      ? includeLeft
      : compilePathFilter(job.filters.include, job.filters.exclude, rightRoot)
  const twoWayPromotesEquals =
    job.variant === 'twoWay' &&
    job.syncRules.some((rule) => rule.action === 'forceMirror' || rule.action === 'forceUpdate')

  function note(relPath: string): Promise<void> | undefined {
    scanned++
    options.onProgress?.(relPath)
    const now = Date.now()
    if (now - lastYieldAt >= YIELD_INTERVAL_MS) {
      lastYieldAt = now
      return yieldToEventLoop()
    }
    return undefined
  }

  function diffRow(relPath: string, left?: SideRecord, right?: SideRecord): CompareRow | undefined {
    if (!twoWayPromotesEquals && pairIsEqual(left, right, job)) {
      equalCount++
      return undefined
    }
    const row =
      job.variant === 'twoWay'
        ? classifyTwoWayPair(
            options.pair.id,
            relPath,
            left,
            right,
            job,
            options.pairStates?.get(relPath),
          )
        : classifyPair(options.pair.id, relPath, left, right, job)
    if (row.category === 'equal') {
      equalCount++
      return undefined
    }
    row.left = slimSide(row.left)
    row.right = slimSide(row.right)
    diffCount++
    return row
  }

  function folderKey(absDir: string): string {
    return path.normalize(absDir).replace(/[/\\]+$/, '').toLowerCase()
  }

  function seenByPath(absDir: string): boolean {
    const identity = folderKey(absDir)
    if (seen.has(identity)) return true
    seen.add(identity)
    return false
  }

  async function seenByRealpath(absDir: string): Promise<boolean> {
    try {
      const identity = (await fsp.realpath(absDir)).toLowerCase()
      if (seen.has(identity)) return true
      seen.add(identity)
      return false
    } catch {
      return false
    }
  }

  async function visit(relDir: string, resolveIdentity: boolean): Promise<void> {
    if (options.isCancelled?.()) return
    if (isSystemSkipPath(relDir)) return

    const leftDir = relDir ? path.join(leftRoot, relDir) : leftRoot
    const rightDir = relDir ? path.join(rightRoot, relDir) : rightRoot

    if (resolveIdentity) {
      if (await seenByRealpath(leftDir)) return
    } else if (seenByPath(leftDir)) {
      return
    }

    if (
      job.compare.fastFolderCompare &&
      job.ads.writeCacheToAds &&
      process.platform === 'win32'
    ) {
      const [leftStats, rightStats] = await Promise.all([
        readFolderStats(leftDir, job.ads.cacheStreamNames.folderStats),
        readFolderStats(rightDir, job.ads.cacheStreamNames.folderStats),
      ])
      if (
        leftStats.ok &&
        rightStats.ok &&
        canSkipSubtree(leftStats.value, rightStats.value, job.ads.cacheStreamNames.folderStats)
      ) {
        return
      }
    }

    const leftEntries = await readDirectory(leftDir)
    const rightEntries = await readDirectory(rightDir)

    const leftDirs: DirEntry[] = []
    const leftFiles: DirEntry[] = []
    for (const entry of leftEntries.values()) {
      if (entry.isSymlink) continue
      if (entry.isDir) leftDirs.push(entry)
      else leftFiles.push(entry)
    }

    for (const leftEnt of leftDirs) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, leftEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!includeLeft(relPath)) continue

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)

      const yielded = note(relPath)
      if (yielded) await yielded

      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && rightEnt.isDir && !rightEnt.isSymlink)

      const leftRec = toRecord(relPath, leftAbs, leftEnt, rightOk)
      const rightRec = rightOk ? toRecord(relPath, rightAbs, rightEnt!, true) : undefined
      const row = diffRow(relPath, leftRec, rightRec)
      if (row) await options.onDiff(row)
      if (!rightOk) continue
      await visit(relPath, leftEnt.isReparse)
    }

    for (const leftEnt of leftFiles) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, leftEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!includeLeft(relPath)) continue

      if (job.behavior.archiveFlagScanOnly && !leftEnt.archive) continue

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)

      const yielded = note(relPath)
      if (yielded) await yielded

      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && !rightEnt.isDir && !rightEnt.isSymlink)
      const sizeTimeEqual =
        rightOk && leftEnt.size === rightEnt!.size && leftEnt.mtimeMs === rightEnt!.mtimeMs
      const wantAds = Boolean(sizeTimeEqual)
      const wantHash = hashContent && sizeTimeEqual

      const leftRec = wantHash
        ? await toRecordHashed(relPath, leftAbs, leftEnt, wantAds, job)
        : toRecord(relPath, leftAbs, leftEnt, wantAds)
      const rightRec = rightOk
        ? wantHash
          ? await toRecordHashed(relPath, rightAbs, rightEnt!, wantAds, job)
          : toRecord(relPath, rightAbs, rightEnt!, wantAds)
        : undefined
      const row = diffRow(relPath, leftRec, rightRec)
      if (row) await options.onDiff(row)
    }

    if (job.variant === 'update') return

    for (const [key, rightEnt] of rightEntries) {
      if (options.isCancelled?.()) return
      if (leftEntries.has(key)) continue
      if (rightEnt.isSymlink) continue

      const relPath = joinRel(relDir, rightEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!includeRight(relPath)) continue

      const yielded = note(relPath)
      if (yielded) await yielded
      const rightAbs = path.join(rightRoot, relPath)
      const rightRec = toRecord(relPath, rightAbs, rightEnt, false)
      const row = diffRow(relPath, undefined, rightRec)
      if (row) await options.onDiff(row)
    }
  }

  await visit('', true)
  return { equalCount, scanned, diffCount }
}

function slimSide(side?: SideSummary): SideSummary | undefined {
  if (!side) return undefined
  return {
    size: side.size,
    mtimeMs: side.mtimeMs,
    isDir: side.isDir,
    primaryHash: side.primaryHash,
    adsManifest: [],
  }
}

function joinRel(relDir: string, name: string): string {
  return relDir ? path.posix.join(relDir.replace(/\\/g, '/'), name) : name
}

async function readDirectory(absDir: string): Promise<Map<string, DirEntry>> {
  if (process.platform === 'win32') {
    return readDirectoryWin32(absDir)
  }

  const entries = new Map<string, DirEntry>()
  let names: string[]
  try {
    names = await fsp.readdir(absDir)
  } catch {
    return entries
  }
  for (const name of names) {
    let stat
    try {
      stat = await fsp.lstat(path.join(absDir, name))
    } catch {
      continue
    }
    const isSymlink = stat.isSymbolicLink()
    entries.set(name.toLowerCase(), {
      name,
      isDir: stat.isDirectory(),
      isSymlink,
      isReparse: isSymlink,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      atimeMs: stat.atimeMs,
      archive: false,
    })
  }
  return entries
}

function toRecord(
  relPath: string,
  absPath: string,
  meta: DirEntry,
  wantAds: boolean,
): SideRecord {
  let adsManifest: AdsManifest = []
  if (wantAds && process.platform === 'win32') {
    try {
      const listed = listStreamsSync(absPath)
      if (listed.ok) adsManifest = listed.value
    } catch {
      adsManifest = []
    }
  }

  return {
    relPath,
    isDir: meta.isDir,
    dataSize: meta.size,
    mtimeMs: meta.mtimeMs,
    adsManifest,
  }
}

async function toRecordHashed(
  relPath: string,
  absPath: string,
  meta: DirEntry,
  wantAds: boolean,
  job: JobFile,
): Promise<SideRecord> {
  const record = toRecord(relPath, absPath, meta, wantAds)
  try {
    record.primaryHash = await resolveFileHash(absPath, meta.size, meta.mtimeMs, meta.atimeMs, job)
  } catch {
    record.primaryHash = undefined
  }
  return record
}

async function resolveFileHash(
  absPath: string,
  size: number,
  mtimeMs: number,
  atimeMs: number,
  job: JobFile,
): Promise<string> {
  const algorithm: 'md5' | 'sha256' = job.compare.contentHash === 'sha256' ? 'sha256' : 'md5'
  if (job.compare.useAdsCache && process.platform === 'win32') {
    const cached = await readFileHashCache(absPath, job.ads.cacheStreamNames.fileHash, size, mtimeMs)
    if (cached.ok && cached.value) return cached.value
  }

  const hash = await hashFileStreaming(absPath, algorithm)

  if (job.ads.writeCacheToAds && process.platform === 'win32') {
    await writeFileHashCache(
      absPath,
      job.ads.cacheStreamNames.fileHash,
      { hash, size, mtimeMs },
      atimeMs,
    )
  }

  return hash
}

function hashFileStreaming(filePath: string, algorithm: 'md5' | 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm)
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}
