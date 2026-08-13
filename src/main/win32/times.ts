import koffi from 'koffi'
import { toLongPath } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from './nativeLock'

const FILE_READ_ATTRIBUTES = 0x00000080
const FILE_WRITE_ATTRIBUTES = 0x00000100
const FILE_SHARE_READ = 0x00000001
const FILE_SHARE_WRITE = 0x00000002
const FILE_SHARE_DELETE = 0x00000004
const OPEN_EXISTING = 3
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn

const kernel32 = koffi.load('kernel32.dll')

const CreateFileW = kernel32.func('CreateFileW', 'void *', [
  'str16',
  'uint32',
  'uint32',
  'void *',
  'uint32',
  'uint32',
  'void *',
])
const GetFileTime = kernel32.func('GetFileTime', 'bool', ['void *', 'void *', 'void *', 'void *'])
const SetFileTime = kernel32.func('SetFileTime', 'bool', ['void *', 'void *', 'void *', 'void *'])
const CloseHandle = kernel32.func('CloseHandle', 'bool', ['void *'])

export type WinFileTimes = {
  creation: Buffer
  access: Buffer
  write: Buffer
}

function isInvalidHandle(handle: unknown): boolean {
  if (handle === null || handle === undefined || handle === 0 || handle === false) return true
  if (handle === -1 || handle === -1n) return true
  try {
    const addr = koffi.address(handle as object)
    return addr === 0n || addr === INVALID_HANDLE_VALUE || addr === -1n
  } catch {
    return false
  }
}

function openAttrHandle(hostPath: string, access: number): unknown {
  return CreateFileW(
    toLongPath(hostPath),
    access,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    null,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    null,
  )
}

function copyTimeBuf(buf: Buffer): Buffer {
  return Buffer.from(buf)
}

/**
 * Read creation / access / write FILETIME without opening $DATA.
 */
export async function readFileTimes(hostPath: string): Promise<Result<WinFileTimes>> {
  if (process.platform !== 'win32') {
    return ioError('File times require Windows.')
  }
  return withNativeLock(() => {
    const handle = openAttrHandle(hostPath, FILE_READ_ATTRIBUTES)
    if (isInvalidHandle(handle)) {
      return ioError(`Could not read timestamps for ${hostPath}`)
    }
    try {
      const creation = Buffer.alloc(8)
      const access = Buffer.alloc(8)
      const write = Buffer.alloc(8)
      if (!GetFileTime(handle, creation, access, write)) {
        return ioError(`GetFileTime failed for ${hostPath}`)
      }
      return ok({
        creation: copyTimeBuf(creation),
        access: copyTimeBuf(access),
        write: copyTimeBuf(write),
      })
    } finally {
      CloseHandle(handle)
    }
  })
}

export async function writeFileTimes(hostPath: string, times: WinFileTimes): Promise<Result<void>> {
  if (process.platform !== 'win32') {
    return ioError('File times require Windows.')
  }
  return withNativeLock(() => {
    const handle = openAttrHandle(hostPath, FILE_WRITE_ATTRIBUTES)
    if (isInvalidHandle(handle)) {
      return ioError(`Could not write timestamps for ${hostPath}`)
    }
    try {
      if (!SetFileTime(handle, times.creation, times.access, times.write)) {
        return ioError(`SetFileTime failed for ${hostPath}`)
      }
      return ok(undefined)
    } finally {
      CloseHandle(handle)
    }
  })
}

/**
 * Copy exact NTFS FILETIME from source to dest (attributes-only handles).
 * Node `utimes` is millisecond-rounded and makes the next compare see an Update.
 */
export async function copyFileTimes(sourcePath: string, destPath: string): Promise<Result<void>> {
  const times = await readFileTimes(sourcePath)
  if (!times.ok) return times
  return writeFileTimes(destPath, times.value)
}
