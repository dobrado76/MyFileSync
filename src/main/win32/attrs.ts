import koffi from 'koffi'
import { err, ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from './nativeLock'

const FILE_ATTRIBUTE_READONLY = 0x00000001
const FILE_ATTRIBUTE_ARCHIVE = 0x00000020

const kernel32 = koffi.load('kernel32.dll')
const GetFileAttributesW = kernel32.func('GetFileAttributesW', 'uint32', ['str16'])

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

export function plainIoMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('EPERM') || message.includes('EACCES') || message.includes('read-only')) {
    return 'Permission was denied or the target is read-only.'
  }
  return `${fallback}: ${message}`
}
