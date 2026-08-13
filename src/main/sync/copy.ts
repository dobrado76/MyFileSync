import fs from 'node:fs/promises'
import path from 'node:path'
import { shell } from 'electron'
import { shouldIncludePath, isSystemSkipPath } from '@shared/compare/filters'
import { copyStreams } from '../ads/copyStreams'
import { copyFileEx } from '../win32/copy'
import { isReadOnly, plainIoMessage, readOnlyWriteError } from '../win32/attrs'
import { handleLockedFileCopy } from './vss'
import { verifyCopy } from './verify'
import { ioError, ok, type Result } from '@shared/result'
import type { PlannedAction } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'

export type CopyOptions = {
  excludeStreams: string[]
  verifyAfterCopy?: boolean
  hashAlgorithm?: 'md5' | 'sha256'
  vssEnabled?: boolean
  filters?: JobFile['filters']
  filterRoot?: string
  onProgress?: (relPath: string) => void
}

export async function copyEntry(
  action: PlannedAction,
  options: CopyOptions,
): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Copy action is missing source or destination path.')
  }

  if (action.isDir) {
    return copyTree(action.sourcePath, action.destPath, action.relPath, options)
  }

  return copyFile(action.sourcePath, action.destPath, options)
}

async function copyFile(source: string, dest: string, options: CopyOptions): Promise<Result<void>> {
  try {
    if (process.platform === 'win32' && (await isReadOnly(dest))) {
      return readOnlyWriteError(dest)
    }

    await fs.mkdir(path.dirname(dest), { recursive: true })

    let kernelSucceeded = false

    if (process.platform === 'win32') {
      const kernelCopy = copyFileEx(source, dest)
      if (kernelCopy.ok) {
        kernelSucceeded = true
      } else {
        const locked = handleLockedFileCopy(source, kernelCopy.error.message, {
          vssEnabled: options.vssEnabled ?? false,
        })
        if (!locked.ok && locked.error.code === 'busy') {
          return locked
        }
      }
    }

    if (!kernelSucceeded) {
      await fs.copyFile(source, dest)

      const streams = await copyStreams(source, dest, {
        excludeStreams: options.excludeStreams,
      })
      if (!streams.ok) {
        return streams
      }
    }

    const stat = await fs.stat(source)
    await fs.utimes(dest, stat.atime, stat.mtime)

    if (options.verifyAfterCopy) {
      const algorithm = options.hashAlgorithm ?? 'md5'
      const verified = await verifyCopy(source, dest, algorithm)
      if (!verified.ok) return verified
    }

    return ok(undefined)
  } catch (error) {
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
    await fs.mkdir(dest, { recursive: true })
    if (process.platform === 'win32') {
      await copyStreams(source, dest, { excludeStreams: options.excludeStreams })
    }

    const dir = await fs.opendir(source)
    for await (const entry of dir) {
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

      const childSrc = path.join(source, entry.name)
      const childDest = path.join(dest, entry.name)
      let stat
      try {
        stat = await fs.lstat(childSrc)
      } catch {
        continue
      }
      if (stat.isSymbolicLink()) continue

      options.onProgress?.(childRel)

      if (stat.isDirectory()) {
        const nested = await copyTree(childSrc, childDest, childRel, options)
        if (!nested.ok) return nested
      } else {
        const copied = await copyFile(childSrc, childDest, options)
        if (!copied.ok) return copied
      }
    }

    return ok(undefined)
  } catch (error) {
    const message = plainIoMessage(error, 'Copy failed')
    if (message.includes('read-only') || message.includes('Permission')) {
      return readOnlyWriteError(dest)
    }
    return ioError(message)
  }
}

export async function copyStreamsOnly(action: PlannedAction): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Stream update is missing source or destination path.')
  }

  if (process.platform === 'win32' && (await isReadOnly(action.destPath))) {
    return readOnlyWriteError(action.destPath)
  }

  const result = await copyStreams(action.sourcePath, action.destPath, {
    excludeStreams: action.excludeStreams,
  })
  if (!result.ok) return result
  return ok(undefined)
}

export async function createEntry(action: PlannedAction, options: CopyOptions): Promise<Result<void>> {
  return copyEntry(action, options)
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
