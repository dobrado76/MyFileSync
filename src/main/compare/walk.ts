import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { shouldIncludePath } from '@shared/compare/filters'
import type { AdsManifest } from '@shared/ads/paths'
import type { JobFile } from '@shared/schemas/job'
import type { SideRecord } from '@shared/schemas/compare'
import { readFileHashCache, writeFileHashCache, readFolderStats } from '../ads/cache'
import { listStreams } from '../ads/list'
import { canSkipSubtree } from './fastFolder'
import { hasArchiveFlag } from '../win32/attrs'
import { yieldToEventLoop } from '../win32/nativeLock'

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
  listAds?: boolean
  onProgress?: (currentPath: string) => void
  isCancelled?: () => boolean
}

export async function walkSide(options: WalkOptions): Promise<Map<string, SideRecord>> {
  const records = new Map<string, SideRecord>()
  const seen = new Set<string>()
  await walkDirectory(options.root, '', options, records, seen)
  return records
}

async function walkDirectory(
  root: string,
  relDir: string,
  options: WalkOptions,
  records: Map<string, SideRecord>,
  seen: Set<string>,
): Promise<void> {
  if (options.isCancelled?.()) return

  const absDir = relDir ? path.join(root, relDir) : root
  let identity = absDir
  try {
    identity = await fsp.realpath(absDir)
  } catch {
    /* keep absDir */
  }
  const seenKey = identity.toLowerCase()
  if (seen.has(seenKey)) return
  seen.add(seenKey)

  if (
    options.listAds !== false &&
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

  let entries: string[]
  try {
    entries = await fsp.readdir(absDir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (options.isCancelled?.()) return

    const relPath = relDir ? path.posix.join(relDir.replace(/\\/g, '/'), entry) : entry
    const absPath = path.join(root, relPath)
    if (!shouldIncludePath(relPath, options.filters.include, options.filters.exclude, root)) {
      continue
    }

    let stat
    try {
      stat = await fsp.lstat(absPath)
    } catch {
      continue
    }

    if (stat.isSymbolicLink()) continue

    if (options.archiveFlagScanOnly && process.platform === 'win32' && !stat.isDirectory()) {
      if (!(await hasArchiveFlag(absPath))) continue
    }

    const isDir = stat.isDirectory()
    let adsManifest: AdsManifest = []
    if (options.listAds !== false && process.platform === 'win32') {
      try {
        const adsResult = await listStreams(absPath)
        if (adsResult.ok) adsManifest = adsResult.value
      } catch {
        adsManifest = []
      }
    }

    let primaryHash: string | undefined
    if (!isDir && options.hashContent) {
      try {
        primaryHash = await resolveFileHash(absPath, stat.size, stat.mtimeMs, stat.atimeMs, options)
      } catch {
        primaryHash = undefined
      }
    }

    const rel = relPath.replace(/\\/g, '/')
    records.set(rel, {
      relPath: rel,
      isDir,
      dataSize: stat.size,
      mtimeMs: stat.mtimeMs,
      primaryHash,
      adsManifest,
    })
    options.onProgress?.(rel)

    await yieldToEventLoop()

    if (isDir) {
      await walkDirectory(root, rel, options, records, seen)
    }
  }
}

async function resolveFileHash(
  absPath: string,
  size: number,
  mtimeMs: number,
  atimeMs: number,
  options: WalkOptions,
): Promise<string> {
  if (options.listAds !== false && options.useAdsCache && process.platform === 'win32') {
    const cached = await readFileHashCache(absPath, options.hashCacheStreamName, size, mtimeMs)
    if (cached.ok && cached.value) {
      return cached.value
    }
  }

  const hash = await hashFileStreaming(absPath, options.hashAlgorithm)

  if (options.listAds !== false && options.writeCacheToAds && process.platform === 'win32') {
    await writeFileHashCache(absPath, options.hashCacheStreamName, { hash, size, mtimeMs }, atimeMs)
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
