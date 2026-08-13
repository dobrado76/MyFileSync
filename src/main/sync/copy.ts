import fs from 'node:fs/promises'
import path from 'node:path'
import { shell } from 'electron'
import { copyStreams } from '../ads/copyStreams'
import { copyFileEx } from '../win32/copy'
import { isReadOnly, plainIoMessage, readOnlyWriteError } from '../win32/attrs'
import { handleLockedFileCopy } from './vss'
import { verifyCopy } from './verify'
import { ioError, ok, type Result } from '@shared/result'
import type { PlannedAction } from '@shared/schemas/compare'

export type CopyOptions = {
  excludeStreams: string[]
  verifyAfterCopy?: boolean
  hashAlgorithm?: 'md5' | 'sha256'
  vssEnabled?: boolean
}

export async function copyEntry(
  action: PlannedAction,
  options: CopyOptions,
): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Copy action is missing source or destination path.')
  }

  const source = action.sourcePath
  const dest = action.destPath

  try {
    if (action.isDir) {
      await fs.mkdir(dest, { recursive: true })
      return ok(undefined)
    }

    if (process.platform === 'win32' && isReadOnly(dest)) {
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

export async function copyStreamsOnly(action: PlannedAction): Promise<Result<void>> {
  if (!action.sourcePath || !action.destPath) {
    return ioError('Stream update is missing source or destination path.')
  }

  if (process.platform === 'win32' && isReadOnly(action.destPath)) {
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
