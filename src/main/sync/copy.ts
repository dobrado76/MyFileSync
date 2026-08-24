import fs from 'node:fs/promises'
import path from 'node:path'
import { shell } from 'electron'
import { shouldIncludePath, isSystemSkipPath } from '@shared/compare/filters'
import { copyStreams } from '../ads/copyStreams'
import { copyFileEx, isCopyAborted } from '../win32/copy'
import { copyFileTimes } from '../win32/times'
import { yieldToEventLoop } from '../win32/nativeLock'
import {
  applyReadOnlyFromSource,
  clearReadOnlyIfExists,
  clearReadOnlyTree,
  permissionDeniedError,
  plainIoMessage,
} from '../win32/attrs'
import { handleLockedFileCopy } from './vss'
import { err, ioError, ok, type Result } from '@shared/result'
import type { PlannedAction } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'

export type CopyOptions = {
  excludeStreams: string[]
  deleteExtraStreams?: boolean
  vssEnabled?: boolean
  filters?: JobFile['filters']
  filterRoot?: string
  /** Extra named-stream copy. CopyFileEx still copies ADS on NTFS→NTFS. */
  copyAds?: boolean
  /** Create of a new file — skip dest/source lstat (lstat opens $DATA and wakes AV). */
  destLikelyMissing?: boolean
  /** Shared across one Sync so mkdir is not repeated for every file in a folder. */
  ensuredDirs?: Set<string>
  onProgress?: (absPath: string) => void
  isCancelled?: () => boolean
}

function shouldCopyAds(options: CopyOptions): boolean {
  return options.copyAds !== false
}

function syncAborted(options: CopyOptions): boolean {
  return Boolean(options.isCancelled?.() || isCopyAborted())
}

async function ensureParentDir(dest: string, ensuredDirs?: Set<string>): Promise<void> {
  const dir = path.dirname(dest)
  if (ensuredDirs?.has(dir)) return
  await fs.mkdir(dir, { recursive: true })
  ensuredDirs?.add(dir)
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
      return createDir(action.sourcePath, action.destPath, options)
    }
    if (action.action === 'Move' || action.action === 'Rename') {
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

    await ensureParentDir(dest, options.ensuredDirs)
    const unlocked = await clearReadOnlyIfExists(dest)
    if (!unlocked.ok) return unlocked

    if (!options.destLikelyMissing) {
      try {
        const destStat = await fs.lstat(dest)
        const srcStat = await fs.lstat(source)
        if (destStat.size === srcStat.size && destStat.mtimeMs === srcStat.mtimeMs && !destStat.isDirectory()) {
          if (shouldCopyAds(options)) {
            const streams = await copyStreams(source, dest, streamCopyOptions(options))
            if (!streams.ok) return streams
          }
          return ok(undefined)
        }
      } catch {
        /* dest missing — CopyFileEx; do not stat the source (that opens $DATA). */
      }
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
        await applyReadOnlyFromSource(source, dest)
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

    if (shouldCopyAds(options)) {
      const streams = await copyStreams(source, dest, streamCopyOptions(options))
      if (!streams.ok) {
        return streams
      }
    }

    if (process.platform === 'win32') {
      const times = await copyFileTimes(source, dest)
      if (!times.ok) return times
    }
    await applyReadOnlyFromSource(source, dest)

    return ok(undefined)
  } catch (error) {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = plainIoMessage(error, 'Copy failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return permissionDeniedError('copy', dest, message)
    }
    return ioError(message)
  }
}

/** Folder Create is mkdir only — children are their own compare rows. */
async function createDir(
  source: string,
  dest: string,
  options: CopyOptions,
): Promise<Result<void>> {
  try {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    await fs.mkdir(dest, { recursive: true })
    options.ensuredDirs?.add(dest)
    const unlocked = await clearReadOnlyIfExists(dest)
    if (!unlocked.ok) return unlocked
    if (shouldCopyAds(options) && process.platform === 'win32') {
      const dirStreams = await copyStreams(source, dest, streamCopyOptions(options))
      if (!dirStreams.ok) return dirStreams
    }
    if (process.platform === 'win32') {
      const times = await copyFileTimes(source, dest)
      if (!times.ok) return times
    }
    await applyReadOnlyFromSource(source, dest)
    return ok(undefined)
  } catch (error) {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = plainIoMessage(error, 'Create folder failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return permissionDeniedError('copy', dest, message)
    }
    return ioError(message)
  }
}

/** Prefer an empty rmdir. Recursive only if a leftover collapsed-folder compare left children. */
async function removeDir(targetPath: string): Promise<void> {
  try {
    await fs.rmdir(targetPath)
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
    if (code === 'ENOTEMPTY' || code === 'ENOENT') {
      if (code === 'ENOENT') return
      await fs.rm(targetPath, { recursive: true, force: true })
      return
    }
    throw error
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
    options.ensuredDirs?.add(dest)
    const unlocked = await clearReadOnlyIfExists(dest)
    if (!unlocked.ok) return unlocked
    if (shouldCopyAds(options) && process.platform === 'win32') {
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
      options.onProgress?.(childDest)

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
    await applyReadOnlyFromSource(source, dest)

    return ok(undefined)
  } catch (error) {
    if (syncAborted(options)) {
      return err({ code: 'cancelled', message: 'Sync cancelled.' })
    }
    const message = plainIoMessage(error, 'Copy failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return permissionDeniedError('copy', dest, message)
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

  if (options && !shouldCopyAds(options)) return ok(undefined)

  const unlocked = await clearReadOnlyIfExists(action.destPath)
  if (!unlocked.ok) return unlocked

  const result = await copyStreams(action.sourcePath, action.destPath, {
    excludeStreams: options?.excludeStreams ?? action.excludeStreams,
    deleteExtra: options?.deleteExtraStreams ?? true,
    restoreHostTimes: true,
    isCancelled: () => Boolean(options?.isCancelled?.() || isCopyAborted()),
  })
  if (!result.ok) return result
  await applyReadOnlyFromSource(action.sourcePath, action.destPath)
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
    const message = error instanceof Error ? error.message : String(error)
    const code =
      error instanceof Error && 'code' in error ? String((error as { code?: string }).code) : ''
    if (code === 'EXDEV') {
      const copied = await copyEntry(action, { excludeStreams: action.excludeStreams })
      if (!copied.ok) return copied
      return deleteEntry(action.sourcePath, action.isDir, false)
    }
    if (code === 'EPERM' || code === 'EACCES' || message.includes('read-only')) {
      return permissionDeniedError('move', action.destPath, message)
    }
    if (code === 'EBUSY' || /locked|in use/i.test(message)) {
      return err({
        code: 'busy',
        message: 'File is in use by another program.',
        hint: `Close apps using "${action.destPath}" and retry sync.`,
      })
    }
    return ioError(`Move failed: ${message}`, action.destPath)
  }
}

export async function deleteEntry(
  targetPath: string,
  isDir: boolean,
  useRecycleBin: boolean,
): Promise<Result<void>> {
  try {
    await clearReadOnlyTree(targetPath)
    if (useRecycleBin) {
      await shell.trashItem(targetPath)
      return ok(undefined)
    }

    if (isDir) {
      await removeDir(targetPath)
    } else {
      await fs.unlink(targetPath)
    }
    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('EPERM') || message.includes('read-only')) {
      await clearReadOnlyTree(targetPath)
      try {
        if (useRecycleBin) {
          await shell.trashItem(targetPath)
        } else if (isDir) {
          await removeDir(targetPath)
        } else {
          await fs.unlink(targetPath)
        }
        return ok(undefined)
      } catch (retryError) {
        const retry = retryError instanceof Error ? retryError.message : String(retryError)
        return permissionDeniedError('delete', targetPath, retry)
      }
    }
    return ioError(`Delete failed: ${message}`)
  }
}

export async function touchTimeEntry(action: PlannedAction): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Touch-time action is missing source or destination path.')
  }
  const unlocked = await clearReadOnlyIfExists(action.destPath)
  if (!unlocked.ok) return unlocked
  const times = await copyFileTimes(action.sourcePath, action.destPath)
  if (!times.ok) return times
  await applyReadOnlyFromSource(action.sourcePath, action.destPath)
  return ok(undefined)
}
