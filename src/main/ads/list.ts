import koffi from 'koffi'
import { normalizeListedStreamName, PRIMARY_STREAM_NAME, toAdsManifest, type AdsManifest } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from '../win32/nativeLock'

const FIND_STREAM_INFO_STANDARD = 0
const ERROR_HANDLE_EOF = 38
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn

const kernel32 = koffi.load('kernel32.dll')

const WIN32_FIND_STREAM_DATA = koffi.struct('WIN32_FIND_STREAM_DATA', {
  StreamSize: 'int64',
  cStreamName: koffi.array('char16', 296),
})

/** FindFirstStreamW last argument is DWORD dwFlags (must be 0), not a pointer. */
const FindFirstStreamW = kernel32.func('FindFirstStreamW', 'void *', [
  'str16',
  'uint32',
  'WIN32_FIND_STREAM_DATA *',
  'uint32',
])
const FindNextStreamW = kernel32.func('FindNextStreamW', 'bool', [
  'void *',
  'WIN32_FIND_STREAM_DATA *',
])
const FindClose = kernel32.func('FindClose', 'bool', ['void *'])
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

function decodeStreamName(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const codes = raw as number[]
    let end = codes.findIndex((c) => c === 0)
    if (end < 0) end = codes.length
    return String.fromCharCode(...codes.slice(0, end))
  }
  return String(raw ?? '')
}

/**
 * List alternate data streams on a host path.
 * Native failures return an empty-ok-style error Result — they must never crash the process.
 */
export async function listStreams(hostPath: string): Promise<Result<AdsManifest>> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data streams are only supported on Windows.', 'Run on NTFS.')
  }

  try {
    return await withNativeLock(() => {
      try {
        const raw = enumerateStreamsFindFirst(hostPath)
        return ok(toAdsManifest(raw))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return ioError(`Failed to list alternate streams: ${message}`)
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to list alternate streams: ${message}`)
  }
}

function enumerateStreamsFindFirst(hostPath: string): RawStream[] {
  const data = koffi.alloc(WIN32_FIND_STREAM_DATA, 1)
  const findHandle = FindFirstStreamW(hostPath, FIND_STREAM_INFO_STANDARD, data, 0)

  if (isInvalidHandle(findHandle)) {
    const code = GetLastError()
    if (code === ERROR_HANDLE_EOF) return []
    return []
  }

  const streams: RawStream[] = []

  try {
    do {
      const entry = koffi.decode(data, WIN32_FIND_STREAM_DATA) as {
        StreamSize: bigint | number
        cStreamName: unknown
      }

      const name = normalizeListedStreamName(decodeStreamName(entry.cStreamName))
      const size = Number(entry.StreamSize)
      if (!name || !Number.isFinite(size)) continue

      streams.push({ name: name === PRIMARY_STREAM_NAME ? PRIMARY_STREAM_NAME : name, size })
    } while (FindNextStreamW(findHandle, data))
  } finally {
    FindClose(findHandle)
  }

  return streams
}
