import fs from 'node:fs/promises'
import path from 'node:path'
import { shell } from 'electron'
import { shouldIncludePath, isSystemSkipPath } from '@shared/compare/filters'
import { copyStreams } from '../ads/copyStreams'
import { copyFileEx, isCopyAborted } from '../win32/copy'
import { copyFileTimes } from '../win32/times'
import { yieldToEventLoop } from '../win32/nativeLock'
import { isReadOnly, plainIoMessage, readOnlyWriteError } from '../win32/attrs'
import { handleLockedFileCopy } from './vss'
import { verifyCopy } from './verify'
import { err, ioError, ok, type Result } from '@shared/result'
import type { PlannedAction } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'

export type CopyOptions = {
  excludeStreams: string[]
  deleteExtraStreams?: boolean
  verifyAfterCopy?: boolean
  hashAlgorithm?: 'md5' | 'sha256'
  vssEnabled?: boolean
  filters?: JobFile['filters']
  filterRoot?: string
  onProgress?: (relPath: string) => void
  isCancelled?: () => boolean
}

function syncAborted(options: CopyOptions): boolean {
  return Boolean(options.isCancelled?.() || isCopyAborted())
}

export async function copyEntry(
  action: PlannedAction,
  options: CopyOptions,
): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Copy action is missing source or destination path.')
  }

  if (action.isDir) {
    if (action.action === 'Create') {
      return copyTree(action.sourcePath, action.destPath, action.relPath, options)
    }
    return copyStreamsOnly(action, options)
  }

  return copyFile(action.sourcePath, action.destPath, options)
}

async function copyFile(source: string, dest: string, options: CopyOptions): Promise<Result<void>> {
  try {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }

    await fs.mkdir(path.dirname(dest), { recursive: true })

    try {
      const destStat = await fs.lstat(dest)
      if (process.platform === 'win32' && (await isReadOnly(dest))) {
        return readOnlyWriteError(dest)
      }
      const srcStat = await fs.lstat(source)
      if (destStat.size === srcStat.size && destStat.mtimeMs === srcStat.mtimeMs && !destStat.isDirectory()) {
        const streams = await copyStreams(source, dest, streamCopyOptions(options))
        if (!streams.ok) return streams
        return ok(undefined)
      }
    } catch {
      /* dest missing — CopyFileEx; do not stat the source (that opens $DATA). */
    }

    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }

    if (process.platform === 'win32') {
      const kernelCopy = await copyFileEx(source, dest)
      if (kernelCopy.ok) {
        if (syncAborted(options)) {
          return err({ code: 'cancelled', message: 'Sync cancelled.' })
        }
        const times = await copyFileTimes(source, dest)
        if (!times.ok) return times
        if (options.verifyAfterCopy) {
          const verified = await verifyCopy(source, dest, options.hashAlgorithm ?? 'md5')
          if (!verified.ok) return verified
        }
        return ok(undefined)
      }
      if (kernelCopy.error.code === 'cancelled' || syncAborted(options)) {
        return err({ code: 'cancelled', message: 'Sync cancelled.' })
      }
      const locked = handleLockedFileCopy(source, kernelCopy.error.message, {
        vssEnabled: options.vssEnabled ?? false,
      })
      if (!locked.ok && locked.error.code === 'busy') {
        return locked
      }
    }

    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }

    await fs.copyFile(source, dest)

    const streams = await copyStreams(source, dest, streamCopyOptions(options))
    if (!streams.ok) {
      return streams
    }

    if (process.platform === 'win32') {
      const times = await copyFileTimes(source, dest)
      if (!times.ok) return times
    }

    if (options.verifyAfterCopy) {
      const verified = await verifyCopy(source, dest, options.hashAlgorithm ?? 'md5')
      if (!verified.ok) return verified
    }

    return ok(undefined)
  } catch (error) {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = plainIoMessage(error, 'Copy failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return readOnlyWriteError(dest)
    }
    return ioError(message)
  }
}

async function copyTree(
  source: string,
  dest: string,
  relPath: string,
  options: CopyOptions,
): Promise<Result<void>> {
  try {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    await fs.mkdir(dest, { recursive: true })
    if (process.platform === 'win32') {
      const dirStreams = await copyStreams(source, dest, streamCopyOptions(options))
      if (!dirStreams.ok) return dirStreams
    }

    const dir = await fs.opendir(source)
    for await (const entry of dir) {
      if (syncAborted(options)) {
        return err({ code: 'cancelled', message: 'Sync cancelled.' })
      }
      await yieldToEventLoop()
      const childRel = relPath ? `${relPath.replace(/\\/g, '/')}/${entry.name}` : entry.name
      if (isSystemSkipPath(childRel)) continue
      if (
        options.filters &&
        options.filterRoot &&
        !shouldIncludePath(
          childRel,
          options.filters.include,
          options.filters.exclude,
          options.filterRoot,
        )
      ) {
        continue
      }

      if (entry.isSymbolicLink()) continue

      const childSrc = path.join(source, entry.name)
      const childDest = path.join(dest, entry.name)
      options.onProgress?.(childRel)

      if (entry.isDirectory()) {
        const nested = await copyTree(childSrc, childDest, childRel, options)
        if (!nested.ok) return nested
      } else {
        const copied = await copyFile(childSrc, childDest, options)
        if (!copied.ok) return copied
      }
    }

    if (process.platform === 'win32') {
      const times = await copyFileTimes(source, dest)
      if (!times.ok) return times
    }

    return ok(undefined)
  } catch (error) {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = plainIoMessage(error, 'Copy failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return readOnlyWriteError(dest)
    }
    return ioError(message)
  }
}

function streamCopyOptions(options: CopyOptions): {
  excludeStreams: string[]
  deleteExtra: boolean
  restoreHostTimes: boolean
  isCancelled?: () => boolean
} {
  return {
    excludeStreams: options.excludeStreams,
    deleteExtra: options.deleteExtraStreams ?? true,
    restoreHostTimes: true,
    isCancelled: () => syncAborted(options),
  }
}

export async function copyStreamsOnly(
  action: PlannedAction,
  options?: CopyOptions,
): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Stream update is missing source or destination path.')
  }

  if (process.platform === 'win32' && (await isReadOnly(action.destPath))) {
    return readOnlyWriteError(action.destPath)
  }

  const result = await copyStreams(action.sourcePath, action.destPath, {
    excludeStreams: options?.excludeStreams ?? action.excludeStreams,
    deleteExtra: options?.deleteExtraStreams ?? true,
    restoreHostTimes: true,
    isCancelled: () => Boolean(options?.isCancelled?.() || isCopyAborted()),
  })
  if (!result.ok) return result
  return ok(undefined)
}

export async function createEntry(action: PlannedAction, options: CopyOptions): Promise<Result<void>> {
  return copyEntry(action, options)
}

export async function moveEntry(action: PlannedAction): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Move action is missing source or destination path.')
  }

  try {
    await fs.mkdir(path.dirname(action.destPath), { recursive: true })
    await fs.rename(action.sourcePath, action.destPath)
    return ok(undefined)
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
    if (code === 'EXDEV') {
      const copied = await copyEntry(action, { excludeStreams: action.excludeStreams })
      if (!copied.ok) return copied
      return deleteEntry(action.sourcePath, action.isDir, false)
    }
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Move failed: ${message}`)
  }
}

export async function deleteEntry(
  targetPath: string,
  isDir: boolean,
  useRecycleBin: boolean,
): Promise<Result<void>> {
  try {
    if (useRecycleBin) {
      await shell.trashItem(targetPath)
      return ok(undefined)
    }

    if (isDir) {
      await fs.rm(targetPath, { recursive: true, force: true })
    } else {
      await fs.unlink(targetPath)
    }
    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('EPERM') || message.includes('read-only')) {
      return ioError('Cannot delete — folder or file is read-only or permission was denied.', message)
    }
    return ioError(`Delete failed: ${message}`)
  }
}
