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
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, leftRoot)) {
        continue
      }

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)

      await note(relPath)

      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && rightEnt.isDir && !rightEnt.isSymlink)

      const leftRec = await toRecord(relPath, leftAbs, leftEnt, false, rightOk, job)
      const rightRec = rightOk ? await toRecord(relPath, rightAbs, rightEnt!, false, true, job) : undefined
      await emit(relPath, leftRec, rightRec)
      if (!rightOk) continue
      await visit(relPath)
    }

    for (const leftEnt of leftFiles) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, leftEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, leftRoot)) {
        continue
      }

      if (job.behavior.archiveFlagScanOnly && !leftEnt.archive) continue

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)

      await note(relPath)

      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && !rightEnt.isDir && !rightEnt.isSymlink)
      const sizeTimeEqual =
        rightOk && leftEnt.size === rightEnt!.size && leftEnt.mtimeMs === rightEnt!.mtimeMs
      const wantAds = Boolean(sizeTimeEqual)
      const wantHash = hashContent && sizeTimeEqual

      const leftRec = await toRecord(relPath, leftAbs, leftEnt, wantHash, wantAds, job)
      const rightRec = rightOk
        ? await toRecord(relPath, rightAbs, rightEnt!, wantHash, wantAds, job)
        : undefined
      await emit(relPath, leftRec, rightRec)
    }

    if (job.variant === 'update') return

    for (const [key, rightEnt] of rightEntries) {
      if (options.isCancelled?.()) return
      if (leftEntries.has(key)) continue
      if (rightEnt.isSymlink) continue

      const relPath = joinRel(relDir, rightEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!shouldIncludePath(relPath, job.filters.include, job.filters.exclude, rightRoot)) {
        continue
      }

      await note(relPath)
      const rightAbs = path.join(rightRoot, relPath)
      const rightRec = await toRecord(relPath, rightAbs, rightEnt, false, false, job)
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
    entries.set(name.toLowerCase(), {
      name,
      isDir: stat.isDirectory(),
      isSymlink: stat.isSymbolicLink(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      atimeMs: stat.atimeMs,
      archive: false,
    })
  }
  return entries
}

async function toRecord(
  relPath: string,
  absPath: string,
  meta: DirEntry,
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
  if (!meta.isDir && hashContent) {
    try {
      primaryHash = await resolveFileHash(absPath, meta.size, meta.mtimeMs, meta.atimeMs, job)
    } catch {
      primaryHash = undefined
    }
  }

  return {
    relPath,
    isDir: meta.isDir,
    dataSize: meta.size,
    mtimeMs: meta.mtimeMs,
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
