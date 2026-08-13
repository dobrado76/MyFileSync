import fs from 'node:fs/promises'
import { buildStreamPath } from '@shared/ads/paths'
import {
  isFileHashCacheCurrent,
  parseFileHashCache,
  serializeFileHashCache,
  type FileHashCache,
} from '@shared/ads/hashCache'
import { ioError, ok, type Result } from '@shared/result'

/** BackupMirror text stream payload suffix. */
const TEXT_STREAM_SUFFIX = '\0\r\n'

export type FolderStats = Record<string, number>
export type { FileHashCache }

function parseNumericStreamText(raw: string): number | undefined {
  const trimmed = raw.replace(/\0/g, '').replace(/\r\n/g, '').trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Read a cached file hash from ADS. Returns undefined unless the payload includes
 * size + mtime that still match the current $DATA (hash-only streams are ignored).
 */
export async function readFileHashCache(
  hostPath: string,
  streamName: string,
  size: number,
  mtimeMs: number,
): Promise<Result<string | undefined>> {
  if (process.platform !== 'win32') {
    return ok(undefined)
  }

  try {
    const streamPath = buildStreamPath(hostPath, streamName)
    const data = await fs.readFile(streamPath, 'utf8')
    const parsed = parseFileHashCache(data)
    if (!parsed || !isFileHashCacheCurrent(parsed, size, mtimeMs)) {
      return ok(undefined)
    }
    return ok(parsed.hash)
  } catch {
    return ok(undefined)
  }
}

/**
 * Write hash + size + mtime, then restore host timestamps so the ADS write
 * does not invalidate the cache on the next compare.
 */
export async function writeFileHashCache(
  hostPath: string,
  streamName: string,
  entry: FileHashCache,
  atimeMs: number,
): Promise<Result<void>> {
  if (process.platform !== 'win32') {
    return ioError('ADS hash cache requires Windows.', 'Run on NTFS.')
  }

  try {
    const streamPath = buildStreamPath(hostPath, streamName)
    await fs.writeFile(streamPath, `${serializeFileHashCache(entry)}${TEXT_STREAM_SUFFIX}`, 'utf8')
    await fs.utimes(hostPath, new Date(atimeMs), new Date(entry.mtimeMs))
    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to write hash cache stream: ${message}`)
  }
}

/**
 * Read folder aggregate statistics from ADS streams on a directory host.
 */
export async function readFolderStats(
  hostPath: string,
  streamNames: readonly string[],
): Promise<Result<FolderStats>> {
  if (process.platform !== 'win32') {
    return ok({})
  }

  const stats: FolderStats = {}

  for (const name of streamNames) {
    try {
      const streamPath = buildStreamPath(hostPath, name)
      const data = await fs.readFile(streamPath, 'utf8')
      const value = parseNumericStreamText(data)
      if (value !== undefined) {
        stats[name] = value
      }
    } catch {
      // Stream missing — leave unset
    }
  }

  return ok(stats)
}

/**
 * Write folder aggregate statistics to ADS streams (compare cache mode).
 */
export async function writeFolderStats(
  hostPath: string,
  stats: FolderStats,
): Promise<Result<void>> {
  if (process.platform !== 'win32') {
    return ioError('Folder stats ADS requires Windows.', 'Run on NTFS.')
  }

  try {
    for (const [name, value] of Object.entries(stats)) {
      const streamPath = buildStreamPath(hostPath, name)
      await fs.writeFile(streamPath, `${value}${TEXT_STREAM_SUFFIX}`, 'utf8')
    }
    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to write folder stats streams: ${message}`)
  }
}
