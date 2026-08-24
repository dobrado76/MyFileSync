import fsp from 'node:fs/promises'
import path from 'node:path'
import { shouldIncludePath } from '@shared/compare/filters'
import type { AdsManifest } from '@shared/ads/paths'
import type { JobFile } from '@shared/schemas/job'
import type { SideRecord } from '@shared/schemas/compare'
import { listStreams } from '../ads/list'
import { hasArchiveFlag } from '../win32/attrs'
import { yieldToEventLoop } from '../win32/nativeLock'

export type WalkOptions = {
  root: string
  filters: JobFile['filters']
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

    const rel = relPath.replace(/\\/g, '/')
    records.set(rel, {
      relPath: rel,
      isDir,
      dataSize: stat.size,
      mtimeMs: stat.mtimeMs,
      adsManifest,
    })
    options.onProgress?.(rel)

    await yieldToEventLoop()

    if (isDir) {
      await walkDirectory(root, rel, options, records, seen)
    }
  }
}
