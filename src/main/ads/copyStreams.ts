import fs from 'node:fs/promises'
import path from 'node:path'
import { buildStreamPath, sortManifest, withoutIgnoredStreams, type AdsManifest } from '@shared/ads/paths'
import { err, ioError, ok, type Result } from '@shared/result'
import { listStreams } from './list'
import { isCopyAborted } from '../win32/copy'
import { copyFileTimes } from '../win32/times'
import { clearReadOnlyIfExists, permissionDeniedError, plainIoMessage } from '../win32/attrs'

export type CopyStreamsOptions = {
  excludeStreams?: string[]
  /** Mirror: remove dest streams that are not on the source (ignored names are left alone). */
  deleteExtra?: boolean
  /** Restore dest host atime/mtime after named-stream writes (default true). */
  restoreHostTimes?: boolean
  isCancelled?: () => boolean
}

export type CopyStreamsResult = {
  copiedStreams: string[]
  deletedStreams: string[]
  manifest: AdsManifest
}

function streamsAborted(options: CopyStreamsOptions): boolean {
  return Boolean(options.isCancelled?.() || isCopyAborted())
}

/**
 * Copy alternate data streams from source host to dest host.
 * Primary $DATA is not copied — use CopyFileEx for full file replication.
 */
export async function copyStreams(
  sourcePath: string,
  destPath: string,
  options: CopyStreamsOptions = {},
): Promise<Result<CopyStreamsResult>> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data stream copy requires Windows.', 'Run on NTFS.')
  }
  const unlocked = await clearReadOnlyIfExists(destPath)
  if (!unlocked.ok) return unlocked

  if (streamsAborted(options)) {
    return err({ code: 'cancelled', message: 'Sync cancelled.' })
  }

  const ignored = options.excludeStreams ?? []
  const listResult = await listStreams(sourcePath)
  if (!listResult.ok) {
    return listResult
  }
  if (streamsAborted(options)) {
    return err({ code: 'cancelled', message: 'Sync cancelled.' })
  }

  const toCopy = withoutIgnoredStreams(listResult.value, ignored)
  const sourceKeep = new Set(toCopy.map((entry) => entry.name))
  const copiedStreams: string[] = []
  const deletedStreams: string[] = []

  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true })

    for (const entry of toCopy) {
      if (streamsAborted(options)) {
        return err({ code: 'cancelled', message: 'Sync cancelled.' })
      }
      const srcStream = buildStreamPath(sourcePath, entry.name)
      const destStream = buildStreamPath(destPath, entry.name)
      const data = await fs.readFile(srcStream)
      await fs.writeFile(destStream, data)
      copiedStreams.push(entry.name)
    }

    if (options.deleteExtra) {
      const destList = await listStreams(destPath)
      if (streamsAborted(options)) {
        return err({ code: 'cancelled', message: 'Sync cancelled.' })
      }
      if (!destList.ok) return destList
      const destOwned = withoutIgnoredStreams(destList.value, ignored)
      for (const entry of destOwned) {
        if (sourceKeep.has(entry.name)) continue
        if (streamsAborted(options)) {
          return err({ code: 'cancelled', message: 'Sync cancelled.' })
        }
        await fs.unlink(buildStreamPath(destPath, entry.name))
        deletedStreams.push(entry.name)
      }
    }

    if (streamsAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }

    if (options.restoreHostTimes !== false) {
      const times = await copyFileTimes(sourcePath, destPath)
      if (!times.ok) return times
    }

    const verifyResult = await listStreams(destPath)
    if (!verifyResult.ok) {
      return verifyResult
    }

    const expected = sortManifest(toCopy)
    const actual = sortManifest(withoutIgnoredStreams(verifyResult.value, ignored))

    if (options.deleteExtra) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        return ioError('Stream copy verification failed — manifests do not match.', undefined)
      }
    } else {
      const actualMap = new Map(actual.map((entry) => [entry.name, entry.size]))
      const missing = expected.some((entry) => actualMap.get(entry.name) !== entry.size)
      if (missing) {
        return ioError('Stream copy verification failed — destination is missing streams.', undefined)
      }
    }

    return ok({ copiedStreams, deletedStreams, manifest: actual })
  } catch (error) {
    if (streamsAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = error instanceof Error ? error.message : String(error)
    const code =
      error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
    if (code === 'EPERM' || code === 'EACCES' || /read-only/i.test(message)) {
      return permissionDeniedError('copy streams to', destPath, message)
    }
    if (code === 'ENOENT') {
      return ioError('Alternate stream copy failed — source or destination was not found.', destPath)
    }
    if (code === 'EBUSY' || /locked|in use/i.test(message)) {
      return err({
        code: 'busy',
        message: 'File is in use by another program.',
        hint: `Close apps using "${destPath}" and retry sync.`,
      })
    }
    return ioError(`Failed to copy alternate streams: ${plainIoMessage(error, 'Stream copy failed')}`, destPath)
  }
}
