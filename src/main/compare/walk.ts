import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { shouldIncludePath } from '@shared/compare/filters'
import type { AdsManifest } from '@shared/ads/paths'
import type { JobFile } from '@shared/schemas/job'
import type { SideRecord } from '@shared/schemas/compare'
import { readFileHashCache, readFolderStats } from '../ads/cache'
import { listStreams } from '../ads/list'
import { canSkipSubtree } from './fastFolder'
import { hasArchiveFlag } from '../win32/attrs'

export type WalkOptions = {
  root: string
  otherRoot?: string
  filters: JobFile['filters']
  hashContent: boolean
  hashAlgorithm: 'md5' | 'sha256'
  useAdsCache: boolean
  writeCacheToAds: boolean
  hashCacheStreamName: string
  fastFolderCompare: boolean
  folderStatStreamNames: readonly string[]
  archiveFlagScanOnly: boolean
  compareWorkers: number
  onProgress?: (currentPath: string) => void
  isCancelled?: () => boolean
}

export async function walkSide(options: WalkOptions): Promise<Map<string, SideRecord>> {
  const records = new Map<string, SideRecord>()
  await walkDirectory(options.root, '', options, records)
  return records
}

async function walkDirectory(
  root: string,
  relDir: string,
  options: WalkOptions,
  records: Map<string, SideRecord>,
): Promise<void> {
  if (options.isCancelled?.()) return

  const absDir = relDir ? path.join(root, relDir) : root
  let entries: string[]
  try {
    entries = await fs.readdir(absDir)
  } catch {
    return
  }

  if (
    options.fastFolderCompare &&
    options.writeCacheToAds &&
    options.otherRoot &&
    process.platform === 'win32'
  ) {
    const otherAbsDir = relDir ? path.join(options.otherRoot, relDir) : options.otherRoot
    const [leftStatsResult, rightStatsResult] = await Promise.all([
      readFolderStats(absDir, options.folderStatStreamNames),
      readFolderStats(otherAbsDir, options.folderStatStreamNames),
    ])

    if (
      leftStatsResult.ok &&
      rightStatsResult.ok &&
      canSkipSubtree(leftStatsResult.value, rightStatsResult.value, options.folderStatStreamNames)
    ) {
      return
    }
  }

  await mapConcurrent(entries, options.compareWorkers, async (entry) => {
    if (options.isCancelled?.()) return

    const relPath = relDir ? path.posix.join(relDir.replace(/\\/g, '/'), entry) : entry
    if (!shouldIncludePath(relPath, options.filters.include, options.filters.exclude)) {
      return
    }

    const absPath = path.join(root, relPath)
    options.onProgress?.(relPath)

    let stat
    try {
      stat = await fs.lstat(absPath)
    } catch {
      return
    }

    if (stat.isSymbolicLink()) return

    if (options.archiveFlagScanOnly && process.platform === 'win32' && !stat.isDirectory()) {
      if (!hasArchiveFlag(absPath)) return
    }

    const isDir = stat.isDirectory()
    let adsManifest: AdsManifest = []
    if (process.platform === 'win32') {
      const adsResult = listStreams(absPath)
      if (adsResult.ok) adsManifest = adsResult.value
    }

    let primaryHash: string | undefined
    if (!isDir && options.hashContent) {
      primaryHash = await resolveFileHash(absPath, stat.size, stat.mtimeMs, options)
    }

    records.set(relPath.replace(/\\/g, '/'), {
      relPath: relPath.replace(/\\/g, '/'),
      isDir,
      dataSize: stat.size,
      mtimeMs: stat.mtimeMs,
      primaryHash,
      adsManifest,
    })

    if (isDir) {
      await walkDirectory(root, relPath, options, records)
    }
  })
}

async function resolveFileHash(
  absPath: string,
  size: number,
  mtimeMs: number,
  options: WalkOptions,
): Promise<string> {
  if (options.useAdsCache && process.platform === 'win32') {
    const cached = await readFileHashCache(absPath, options.hashCacheStreamName)
    if (cached.ok && cached.value) {
      return cached.value
    }
  }

  return hashFile(absPath, options.hashAlgorithm)
}

async function hashFile(filePath: string, algorithm: 'md5' | 'sha256'): Promise<string> {
  const data = await fs.readFile(filePath)
  return createHash(algorithm).update(data).digest('hex')
}

async function mapConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, concurrency)
  let index = 0

  async function runWorker(): Promise<void> {
    while (index < items.length) {
      const current = items[index]
      index++
      if (current === undefined) continue
      await worker(current)
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker())
  await Promise.all(workers)
}
