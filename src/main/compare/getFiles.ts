import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { isSystemSkipPath, shouldIncludePath } from '@shared/compare/filters'
import { classifyPair } from '@shared/compare/classify'
import type { AdsManifest } from '@shared/ads/paths'
import type { CompareRow, SideRecord, SideSummary } from '@shared/schemas/compare'
import type { JobFile, JobPair } from '@shared/schemas/job'
import { readFileHashCache, writeFileHashCache, readFolderStats } from '../ads/cache'
import { listStreams } from '../ads/list'
import { canSkipSubtree } from './fastFolder'
import { hasArchiveFlag } from '../win32/attrs'
import { yieldToEventLoop } from '../win32/nativeLock'
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
  let sinceYield = 0
  const seen = new Set<string>()

  const leftRoot = options.pair.left
  const rightRoot = options.pair.right
  const job = options.job
  const hashContent = job.compare.method === 'content' && job.compare.contentHash !== 'none'

  async function note(relPath: string): Promise<void> {
    scanned++
    sinceYield++
    options.onProgress?.(relPath)
    if (sinceYield >= 10) {
      sinceYield = 0
      await yieldToEventLoop()
    }
  }

  async function emit(relPath: string, left?: SideRecord, right?: SideRecord): Promise<boolean> {
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
      return false
    }
    row.left = slimSide(row.left)
    row.right = slimSide(row.right)
    diffCount++
    await options.onDiff(row)
    return true
  }

  async function visit(relDir: string): Promise<void> {
    if (options.isCancelled?.()) return
    if (isSystemSkipPath(relDir)) return

    const leftDir = relDir ? path.join(leftRoot, relDir) : leftRoot
    const rightDir = relDir ? path.join(rightRoot, relDir) : rightRoot

    try {
      const identity = (await fsp.realpath(leftDir)).toLowerCase()
      if (seen.has(identity)) return
      seen.add(identity)
    } catch {
      /* keep going with abs path */
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

    const leftNames = await readChildNames(leftDir)
    const rightNames = await readChildNames(rightDir)

    const leftDirs: string[] = []
    const leftFiles: string[] = []
    for (const [, name] of leftNames) {
      const relPath = joinRel(relDir, name)
      const leftAbs = path.join(leftRoot, relPath)
      const leftStat = await lstatSafe(leftAbs)
      if (!leftStat || leftStat.isSymbolicLink()) continue
      if (leftStat.isDirectory()) leftDirs.push(name)
      else leftFiles.push(name)
    }

    for (const name of leftDirs) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, name)
      if (isSystemSkipPath(relPath)) continue
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, leftRoot)) {
        continue
      }

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)
      const leftStat = await lstatSafe(leftAbs)
      if (!leftStat) continue

      await note(relPath)

      const rightStat = rightNames.has(name.toLowerCase()) ? await lstatSafe(rightAbs) : undefined
      const rightOk = Boolean(rightStat && !rightStat.isSymbolicLink() && rightStat.isDirectory())

      const leftRec = await toRecord(relPath, leftAbs, leftStat, true, false, true, job)
      const rightRec = rightOk
        ? await toRecord(relPath, rightAbs, rightStat!, true, false, true, job)
        : undefined
      await emit(relPath, leftRec, rightRec)
      if (!rightOk) continue
      await visit(relPath)
    }

    for (const name of leftFiles) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, name)
      if (isSystemSkipPath(relPath)) continue
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, leftRoot)) {
        continue
      }

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)
      const leftStat = await lstatSafe(leftAbs)
      if (!leftStat) continue

      if (job.behavior.archiveFlagScanOnly && process.platform === 'win32') {
        if (!(await hasArchiveFlag(leftAbs))) continue
      }

      await note(relPath)

      const rightStat = rightNames.has(name.toLowerCase()) ? await lstatSafe(rightAbs) : undefined
      const rightOk = Boolean(rightStat && !rightStat.isSymbolicLink() && !rightStat.isDirectory())
      const sizeTimeEqual =
        rightOk && leftStat.size === rightStat!.size && leftStat.mtimeMs === rightStat!.mtimeMs
      const wantAds = !rightOk || sizeTimeEqual
      const wantHash = hashContent && sizeTimeEqual

      const leftRec = await toRecord(relPath, leftAbs, leftStat, false, wantHash, wantAds, job)
      const rightRec = rightOk
        ? await toRecord(relPath, rightAbs, rightStat!, false, wantHash, wantAds, job)
        : undefined
      await emit(relPath, leftRec, rightRec)
    }

    if (job.variant === 'update') return

    for (const [key, name] of rightNames) {
      if (options.isCancelled?.()) return
      if (leftNames.has(key)) continue

      const relPath = joinRel(relDir, name)
      if (isSystemSkipPath(relPath)) continue
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, rightRoot)) {
        continue
      }

      const rightAbs = path.join(rightRoot, relPath)
      const rightStat = await lstatSafe(rightAbs)
      if (!rightStat || rightStat.isSymbolicLink()) continue

      await note(relPath)
      const isDir = rightStat.isDirectory()
      const rightRec = await toRecord(relPath, rightAbs, rightStat, isDir, false, true, job)
      await emit(relPath, undefined, rightRec)
    }
  }

  await visit('')
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

async function readChildNames(dir: string): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  try {
    const entries = await fsp.readdir(dir)
    for (const entry of entries) {
      names.set(entry.toLowerCase(), entry)
    }
  } catch {
    /* folder missing */
  }
  return names
}

async function lstatSafe(absPath: string): Promise<fs.Stats | undefined> {
  try {
    return await fsp.lstat(absPath)
  } catch {
    return undefined
  }
}

async function toRecord(
  relPath: string,
  absPath: string,
  stat: fs.Stats,
  isDir: boolean,
  hashContent: boolean,
  wantAds: boolean,
  job: JobFile,
): Promise<SideRecord> {
  let adsManifest: AdsManifest = []
  if (wantAds && process.platform === 'win32') {
    try {
      const listed = await listStreams(absPath)
      if (listed.ok) adsManifest = listed.value
    } catch {
      adsManifest = []
    }
  }

  let primaryHash: string | undefined
  if (!isDir && hashContent) {
    try {
      primaryHash = await resolveFileHash(absPath, stat.size, stat.mtimeMs, stat.atimeMs, job)
    } catch {
      primaryHash = undefined
    }
  }

  return {
    relPath,
    isDir,
    dataSize: stat.size,
    mtimeMs: stat.mtimeMs,
    primaryHash,
    adsManifest,
  }
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
