import koffi from 'koffi'
import { normalizeListedStreamName, PRIMARY_STREAM_NAME, toAdsManifest, toLongPath, type AdsManifest } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from '../win32/nativeLock'

const FILE_READ_ATTRIBUTES = 0x00000080
const FILE_SHARE_READ = 0x00000001
const FILE_SHARE_WRITE = 0x00000002
const FILE_SHARE_DELETE = 0x00000004
const OPEN_EXISTING = 3
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000
const FileStreamInfo = 7
const ERROR_MORE_DATA = 234
const ERROR_BAD_LENGTH = 24
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn
const STREAM_INFO_INITIAL_BYTES = 65_536
const STREAM_INFO_MAX_ATTEMPTS = 6

/**
 * One FileStreamInfo scratch buffer for the process. Grown if a file has an
 * unusually large stream list; never shrunk. Safe on the serial compare path
 * (and inside withNativeLock for the async IPC wrapper).
 */
let streamInfoBuffer = Buffer.allocUnsafe(STREAM_INFO_INITIAL_BYTES)

function streamInfoScratch(minBytes: number): Buffer {
  if (streamInfoBuffer.length < minBytes) {
    streamInfoBuffer = Buffer.allocUnsafe(minBytes)
  }
  return streamInfoBuffer
}

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
const GetFileInformationByHandleEx = kernel32.func('GetFileInformationByHandleEx', 'bool', [
  'void *',
  'uint32',
  'void *',
  'uint32',
])
const CloseHandle = kernel32.func('CloseHandle', 'bool', ['void *'])
const GetLastError = kernel32.func('GetLastError', 'uint32', [])

type RawStream = { name: string; size: number }

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

/**
 * List named alternate streams (name + size). Opens the host with
 * FILE_READ_ATTRIBUTES only — never FILE_READ_DATA — so compare does not
 * read $DATA. Stream names/sizes come from NTFS MFT (FileStreamInfo).
 */
export function listStreamsSync(hostPath: string): Result<AdsManifest> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data streams are only supported on Windows.', 'Run on NTFS.')
  }

  try {
    return ok(toAdsManifest(enumerateStreams(hostPath)))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to list alternate streams: ${message}`)
  }
}

export async function listStreams(hostPath: string): Promise<Result<AdsManifest>> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data streams are only supported on Windows.', 'Run on NTFS.')
  }

  try {
    return await withNativeLock(() => listStreamsSync(hostPath))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to list alternate streams: ${message}`)
  }
}

function enumerateStreams(hostPath: string): RawStream[] {
  const handle = CreateFileW(
    toLongPath(hostPath),
    FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    null,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT,
    null,
  )
  if (isInvalidHandle(handle)) return []

  try {
    let byteLength = streamInfoBuffer.length
    for (let attempt = 0; attempt < STREAM_INFO_MAX_ATTEMPTS; attempt++) {
      const buf = streamInfoScratch(byteLength)
      const okCall = GetFileInformationByHandleEx(handle, FileStreamInfo, buf, buf.length)
      if (okCall) return parseStreamInfo(buf)
      const code = GetLastError()
      if (code === ERROR_MORE_DATA || code === ERROR_BAD_LENGTH) {
        byteLength = buf.length * 2
        continue
      }
      return []
    }
    return []
  } finally {
    CloseHandle(handle)
  }
}

function parseStreamInfo(buf: Buffer): RawStream[] {
  const streams: RawStream[] = []
  let offset = 0

  for (let n = 0; n < 4096; n++) {
    if (offset + 24 > buf.length) break
    const next = buf.readUInt32LE(offset)
    const nameBytes = buf.readUInt32LE(offset + 4)
    if (nameBytes === 0 || offset + 24 + nameBytes > buf.length) break

    const size = Number(buf.readBigUInt64LE(offset + 8))
    const rawName = buf.toString('utf16le', offset + 24, offset + 24 + nameBytes)
    const name = normalizeListedStreamName(rawName.replace(/\0+$/, ''))
    if (name && Number.isFinite(size)) {
      streams.push({ name: name === PRIMARY_STREAM_NAME ? PRIMARY_STREAM_NAME : name, size })
    }

    if (next === 0) break
    offset += next
  }

  return streams
}
