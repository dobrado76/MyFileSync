import fs from 'node:fs/promises'
import path from 'node:path'
import koffi from 'koffi'
import { toLongPath } from '@shared/ads/paths'
import { err, ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from './nativeLock'

export const FILE_ATTRIBUTE_READONLY = 0x00000001
const FILE_ATTRIBUTE_ARCHIVE = 0x00000020

export function attrsWithReadOnly(attrs: number, readonly: boolean): number {
  return readonly ? attrs | FILE_ATTRIBUTE_READONLY : attrs & ~FILE_ATTRIBUTE_READONLY
}

const kernel32 = koffi.load('kernel32.dll')
const GetFileAttributesW = kernel32.func('GetFileAttributesW', 'uint32', ['str16'])
const SetFileAttributesW = kernel32.func('SetFileAttributesW', 'bool', ['str16', 'uint32'])

const INVALID_FILE_ATTRIBUTES = 0xffffffff

function readAttributesSync(hostPath: string): Result<number> {
  const attrs = GetFileAttributesW(hostPath)
  if (attrs === INVALID_FILE_ATTRIBUTES) {
    return ioError('Could not read file attributes.', hostPath)
  }
  return ok(attrs)
}

export async function getFileAttributes(hostPath: string): Promise<Result<number>> {
  if (process.platform !== 'win32') {
    return ioError('File attributes are only available on Windows.')
  }
  return withNativeLock(() => readAttributesSync(hostPath))
}

export async function isReadOnly(hostPath: string): Promise<boolean> {
  const attrs = await getFileAttributes(hostPath)
  if (!attrs.ok) return false
  return (attrs.value & FILE_ATTRIBUTE_READONLY) !== 0
}

export async function hasArchiveFlag(hostPath: string): Promise<boolean> {
  const attrs = await getFileAttributes(hostPath)
  if (!attrs.ok) return false
  return (attrs.value & FILE_ATTRIBUTE_ARCHIVE) !== 0
}

export function readOnlyWriteError(targetPath: string): Result<never> {
  return err({
    code: 'not-allowed',
    message: 'Cannot write — folder or file is read-only.',
    hint: `Clear the read-only attribute on "${targetPath}" or choose a writable destination.`,
  })
}

export function permissionDeniedError(action: string, targetPath: string, detail?: string): Result<never> {
  return err({
    code: 'not-allowed',
    message: `Cannot ${action} — permission was denied.`,
    hint: detail ?? `Check permissions for "${targetPath}".`,
  })
}

function setReadOnlyBitSync(hostPath: string, readonly: boolean): Result<void> {
  const attrs = readAttributesSync(hostPath)
  if (!attrs.ok) return attrs
  const next = attrsWithReadOnly(attrs.value, readonly)
  if (next === attrs.value) return ok(undefined)
  const changed = SetFileAttributesW(toLongPath(hostPath), next)
  if (!changed) {
    return ioError(
      readonly ? 'Could not set the read-only attribute.' : 'Could not clear the read-only attribute.',
      `Check permissions for "${hostPath}".`,
    )
  }
  return ok(undefined)
}

export async function clearReadOnly(hostPath: string): Promise<Result<void>> {
  if (process.platform !== 'win32') {
    return ioError('Clearing read-only is only supported on Windows.')
  }
  return withNativeLock(() => setReadOnlyBitSync(hostPath, false))
}

/** Clear dest read-only so a write or delete can proceed. Missing path is fine. */
export async function clearReadOnlyIfExists(hostPath: string): Promise<Result<void>> {
  if (process.platform !== 'win32') return ok(undefined)
  const attrs = await getFileAttributes(hostPath)
  if (!attrs.ok) return ok(undefined)
  if ((attrs.value & FILE_ATTRIBUTE_READONLY) === 0) return ok(undefined)
  return clearReadOnly(hostPath)
}

/** Dest read-only must match source after a successful copy. Attribute failure does not undo the copy. */
export async function applyReadOnlyFromSource(sourcePath: string, destPath: string): Promise<void> {
  if (process.platform !== 'win32') return
  const src = await getFileAttributes(sourcePath)
  if (!src.ok) return
  await withNativeLock(() =>
    setReadOnlyBitSync(destPath, (src.value & FILE_ATTRIBUTE_READONLY) !== 0),
  )
}

/** Clear read-only on a file or every file/folder under a tree so delete/overwrite can proceed. */
export async function clearReadOnlyTree(hostPath: string): Promise<void> {
  if (process.platform !== 'win32') return
  await clearReadOnlyIfExists(hostPath)
  try {
    const st = await fs.lstat(hostPath)
    if (!st.isDirectory()) return
    const dir = await fs.opendir(hostPath)
    for await (const entry of dir) {
      if (entry.isSymbolicLink()) continue
      await clearReadOnlyTree(path.join(hostPath, entry.name))
    }
  } catch {
    /* missing or not a directory */
  }
}

export function plainIoMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('EPERM') || message.includes('EACCES') || message.includes('read-only')) {
    return 'Permission was denied or the target is read-only.'
  }
  return `${fallback}: ${message}`
}
