import koffi from 'koffi'
import { normalizeListedStreamName, PRIMARY_STREAM_NAME, toAdsManifest, type AdsManifest } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'

const FIND_STREAM_INFO_STANDARD = 0

const kernel32 = koffi.load('kernel32.dll')

const WIN32_FIND_STREAM_DATA = koffi.struct('WIN32_FIND_STREAM_DATA', {
  StreamSize: 'int64',
  cStreamName: koffi.array('char16', 296),
})

const FindFirstStreamW = kernel32.func('FindFirstStreamW', 'void *', [
  'str16',
  'uint32',
  'WIN32_FIND_STREAM_DATA *',
  'uint32 *',
])
const FindNextStreamW = kernel32.func('FindNextStreamW', 'bool', [
  'void *',
  'WIN32_FIND_STREAM_DATA *',
])
const FindClose = kernel32.func('FindClose', 'bool', ['void *'])
const GetLastError = kernel32.func('GetLastError', 'uint32', [])

type RawStream = { name: string; size: number }

/**
 * List alternate data streams on a host path.
 *
 * BackupRead was spiked first; on this configuration it returns zero-byte reads
 * without backup privilege. FindFirstStreamW (Vista+) is used for reliable
 * enumeration while remaining a pure Win32/koffi path.
 */
export function listStreams(hostPath: string): Result<AdsManifest> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data streams are only supported on Windows.', 'Run on NTFS.')
  }

  try {
    const raw = enumerateStreamsFindFirst(hostPath)
    const manifest = toAdsManifest(raw)
    return ok(manifest)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to list alternate streams: ${message}`)
  }
}

function enumerateStreamsFindFirst(hostPath: string): RawStream[] {
  const data = koffi.alloc(WIN32_FIND_STREAM_DATA, 1)
  const findHandle = FindFirstStreamW(hostPath, FIND_STREAM_INFO_STANDARD, data, null)

  if (!findHandle) {
    const code = GetLastError()
    throw new Error(`FindFirstStreamW failed (error ${code}) for ${hostPath}`)
  }

  const streams: RawStream[] = []

  try {
    do {
      const entry = koffi.decode(data, WIN32_FIND_STREAM_DATA) as {
        StreamSize: bigint
        cStreamName: string
      }

      const name = normalizeListedStreamName(entry.cStreamName)
      const size = Number(entry.StreamSize)

      if (!name) continue

      if (name === PRIMARY_STREAM_NAME) {
        streams.push({ name: PRIMARY_STREAM_NAME, size })
      } else {
        streams.push({ name, size })
      }
    } while (FindNextStreamW(findHandle, data))
  } finally {
    FindClose(findHandle)
  }

  return streams
}
