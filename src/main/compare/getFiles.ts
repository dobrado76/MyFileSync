import fsp from 'node:fs/promises'
import path from 'node:path'
import { compilePathFilter, isSystemSkipPath } from '@shared/compare/filters'
import { classifyPair, pairIsEqual } from '@shared/compare/classify'
import type { AdsManifest } from '@shared/ads/paths'
import type { CompareRow, SideRecord, SideSummary } from '@shared/schemas/compare'
import { pairComparesAds, type JobFile, type JobPair } from '@shared/schemas/job'
import { listStreamsSync } from '../ads/list'
import { yieldToEventLoop } from '../win32/nativeLock'
import { readDirectoryWin32, type DirEntry } from '../win32/find'
import { classifyTwoWayPair } from './twoWay'
import type { PairFileStates } from '../db/syncState'

export type GetFilesResult = {
  equalCount: number
  scanned: number
  diffCount: number
}

export type ListingCache = {
  dirs: Map<string, Map<string, DirEntry>>
  entries: number
}

export type EnumerateResult = {
  total: number
  cache: ListingCache
}

type GetFilesOptions = {
  pair: JobPair
  job: JobFile
  pairStates?: PairFileStates
  onDiff: (row: CompareRow) => void | Promise<void>
  onProgress?: (absPath: string) => void
  isCancelled?: () => boolean
  /** When set, skip folders with no USN / outstanding diffs under them. */
  skipSubtree?: (relDir: string) => boolean
  /** Reuse FindFirstFile results from enumerateFiles so Compare does not list twice. */
  listingCache?: ListingCache
}

type EnumerateOptions = Omit<GetFilesOptions, 'onDiff' | 'pairStates'>

type WalkItem = {
  relPath: string
  leftAbs: string
  rightAbs: string
  leftEnt?: DirEntry
  rightEnt?: DirEntry
  isDir: boolean
}

type WalkOptions = {
  pair: JobPair
  job: JobFile
  isCancelled?: () => boolean
  skipSubtree?: (relDir: string) => boolean
  listingCache?: ListingCache
  onProgress?: (absPath: string) => void
  onItem: (item: WalkItem) => void | Promise<void>
}

/** Yield often enough for Cancel IPC; not on every item. */
const YIELD_INTERVAL_MS = 75

/**
 * Stop pinning listings above this so huge trees do not hold RAM.
 * Compare then re-lists those folders from disk.
 */
const LISTING_CACHE_MAX_ENTRIES = 2_000_000

export function createListingCache(): ListingCache {
  return { dirs: new Map(), entries: 0 }
}

/**
 * Count every item Compare will visit (same filters, system skips, USN skip,
 * missing-side listing, Update dest-only skip). Caches directory listings
 * so the classify pass does not FindFirstFile again.
 */
export async function enumerateFiles(options: EnumerateOptions): Promise<EnumerateResult> {
  const cache = options.listingCache ?? createListingCache()
  const total = await walkPair({
    pair: options.pair,
    job: options.job,
    isCancelled: options.isCancelled,
    skipSubtree: options.skipSubtree,
    listingCache: cache,
    onProgress: options.onProgress,
    onItem: () => undefined,
  })
  return { total, cache }
}

/**
 * Paired walk (FreeFileSync-style):
 * - Equals are counted, never stored.
 * - A folder missing on one side still lists every nested file and folder.
 * - File-level diffs are emitted one at a time via onDiff (caller must not buffer them all).
 */
export async function getFiles(options: GetFilesOptions): Promise<GetFilesResult> {
  let equalCount = 0
  let diffCount = 0

  const job = options.job
  const checkAds = pairComparesAds(options.pair)
  const twoWayPromotesEquals =
    job.variant === 'twoWay' &&
    job.syncRules.some((rule) => rule.action === 'forceMirror' || rule.action === 'forceUpdate')

  function diffRow(relPath: string, left?: SideRecord, right?: SideRecord): CompareRow | undefined {
    if (!twoWayPromotesEquals && pairIsEqual(left, right, job, options.pair.id)) {
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

  const scanned = await walkPair({
    pair: options.pair,
    job,
    isCancelled: options.isCancelled,
    skipSubtree: options.skipSubtree,
    listingCache: options.listingCache,
    onProgress: options.onProgress,
    onItem: async (item) => {
      if (item.isDir) {
        if (!item.leftEnt) {
          const rightRec = toRecord(item.relPath, item.rightAbs, item.rightEnt!, false)
          const row = diffRow(item.relPath, undefined, rightRec)
          if (row) await options.onDiff(row)
          return
        }
        const rightOk = Boolean(item.rightEnt && item.rightEnt.isDir && !item.rightEnt.isSymlink)
        const leftRec = toRecord(item.relPath, item.leftAbs, item.leftEnt, rightOk && checkAds)
        const rightRec = rightOk
          ? toRecord(item.relPath, item.rightAbs, item.rightEnt!, checkAds)
          : undefined
        const row = diffRow(item.relPath, leftRec, rightRec)
        if (row) await options.onDiff(row)
        return
      }

      if (!item.leftEnt) {
        const rightRec = toRecord(item.relPath, item.rightAbs, item.rightEnt!, false)
        const row = diffRow(item.relPath, undefined, rightRec)
        if (row) await options.onDiff(row)
        return
      }

      const rightOk = Boolean(item.rightEnt && !item.rightEnt.isDir && !item.rightEnt.isSymlink)
      const sizesMatch = rightOk && item.leftEnt.size === item.rightEnt!.size
      const timesMatch = rightOk && item.leftEnt.mtimeMs === item.rightEnt!.mtimeMs
      const sizeTimeEqual = sizesMatch && timesMatch
      const needAdsForTouchTime =
        job.behavior.touchTimeWhenSizeMatches && sizesMatch && !timesMatch && checkAds
      const wantAds = Boolean((sizeTimeEqual || needAdsForTouchTime) && checkAds)

      const leftRec = toRecord(item.relPath, item.leftAbs, item.leftEnt, wantAds)
      const rightRec = rightOk
        ? toRecord(item.relPath, item.rightAbs, item.rightEnt!, wantAds)
        : undefined
      const row = diffRow(item.relPath, leftRec, rightRec)
      if (row) await options.onDiff(row)
    },
  })

  return { equalCount, scanned, diffCount }
}

async function walkPair(options: WalkOptions): Promise<number> {
  let scanned = 0
  let lastYieldAt = Date.now()
  const seen = new Set<string>()

  const leftRoot = options.pair.left
  const rightRoot = options.pair.right
  const job = options.job
  const checkAds = pairComparesAds(options.pair)
  const includeLeft = compilePathFilter(job.filters.include, job.filters.exclude, leftRoot)
  const includeRight =
    leftRoot.toLowerCase() === rightRoot.toLowerCase()
      ? includeLeft
      : compilePathFilter(job.filters.include, job.filters.exclude, rightRoot)

  function note(absPath: string): Promise<void> | undefined {
    scanned++
    options.onProgress?.(absPath)
    const now = Date.now()
    if (now - lastYieldAt >= YIELD_INTERVAL_MS) {
      lastYieldAt = now
      return yieldToEventLoop()
    }
    return undefined
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
    if (relDir && options.skipSubtree?.(relDir)) return

    const leftDir = relDir ? path.join(leftRoot, relDir) : leftRoot
    const rightDir = relDir ? path.join(rightRoot, relDir) : rightRoot

    if (resolveIdentity) {
      if (await seenByRealpath(leftDir)) return
    } else if (seenByPath(leftDir)) {
      return
    }

    const leftEntries = await readDirectory(leftDir, options.listingCache)
    const rightEntries = await readDirectory(rightDir, options.listingCache)

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
      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && rightEnt.isDir && !rightEnt.isSymlink)

      const yielded = note(leftAbs)
      if (yielded) await yielded
      await options.onItem({
        relPath,
        leftAbs,
        rightAbs,
        leftEnt,
        rightEnt: rightOk ? rightEnt : undefined,
        isDir: true,
      })
      await visit(relPath, leftEnt.isReparse || !rightOk)
    }

    for (const leftEnt of leftFiles) {
      if (options.isCancelled?.()) return
      const relPath = joinRel(relDir, leftEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!includeLeft(relPath)) continue
      if (job.behavior.archiveFlagScanOnly && !leftEnt.archive) continue

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)
      const rightEnt = rightEntries.get(leftEnt.name.toLowerCase())
      const rightOk = Boolean(rightEnt && !rightEnt.isDir && !rightEnt.isSymlink)

      const yielded = note(leftAbs)
      if (yielded) await yielded
      await options.onItem({
        relPath,
        leftAbs,
        rightAbs,
        leftEnt,
        rightEnt: rightOk ? rightEnt : undefined,
        isDir: false,
      })
    }

    if (job.variant === 'update') return

    for (const [key, rightEnt] of rightEntries) {
      if (options.isCancelled?.()) return
      if (leftEntries.has(key)) continue
      if (rightEnt.isSymlink) continue

      const relPath = joinRel(relDir, rightEnt.name)
      if (isSystemSkipPath(relPath)) continue
      if (!includeRight(relPath)) continue

      const leftAbs = path.join(leftRoot, relPath)
      const rightAbs = path.join(rightRoot, relPath)

      const yielded = note(rightAbs)
      if (yielded) await yielded
      await options.onItem({
        relPath,
        leftAbs,
        rightAbs,
        rightEnt,
        isDir: rightEnt.isDir,
      })
      if (rightEnt.isDir) await visit(relPath, false)
    }
  }

  await visit('', true)
  return scanned
}

function folderKey(absDir: string): string {
  return path.normalize(absDir).replace(/[/\\]+$/, '').toLowerCase()
}

function slimSide(side?: SideSummary): SideSummary | undefined {
  if (!side) return undefined
  return {
    size: side.size,
    mtimeMs: side.mtimeMs,
    isDir: side.isDir,
    adsManifest: [],
  }
}

function joinRel(relDir: string, name: string): string {
  return relDir ? path.posix.join(relDir.replace(/\\/g, '/'), name) : name
}

async function readDirectory(
  absDir: string,
  cache?: ListingCache,
): Promise<Map<string, DirEntry>> {
  const key = folderKey(absDir)
  const cached = cache?.dirs.get(key)
  if (cached) return cached

  const entries = await readDirectoryFromDisk(absDir)
  if (cache && cache.entries + entries.size <= LISTING_CACHE_MAX_ENTRIES) {
    cache.dirs.set(key, entries)
    cache.entries += entries.size
  }
  return entries
}

async function readDirectoryFromDisk(absDir: string): Promise<Map<string, DirEntry>> {
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

