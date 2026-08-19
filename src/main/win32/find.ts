import koffi from 'koffi'
import { toLongPath } from '@shared/ads/paths'

const FILE_ATTRIBUTE_DIRECTORY = 0x00000010
const FILE_ATTRIBUTE_ARCHIVE = 0x00000020
const FILE_ATTRIBUTE_REPARSE_POINT = 0x00000400
const IO_REPARSE_TAG_SYMLINK = 0xa000000c
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn
/** Milliseconds between 1601-01-01 and 1970-01-01. */
const EPOCH_DIFF_MS = 11644473600000n

const kernel32 = koffi.load('kernel32.dll')

const WIN32_FIND_DATAW = koffi.struct('WIN32_FIND_DATAW', {
  dwFileAttributes: 'uint32',
  ftCreationTimeLow: 'uint32',
  ftCreationTimeHigh: 'uint32',
  ftLastAccessTimeLow: 'uint32',
  ftLastAccessTimeHigh: 'uint32',
  ftLastWriteTimeLow: 'uint32',
  ftLastWriteTimeHigh: 'uint32',
  nFileSizeHigh: 'uint32',
  nFileSizeLow: 'uint32',
  dwReserved0: 'uint32',
  dwReserved1: 'uint32',
  cFileName: koffi.array('char16', 260),
  cAlternateFileName: koffi.array('char16', 14),
})

const FindFirstFileW = kernel32.func('FindFirstFileW', 'void *', ['str16', 'WIN32_FIND_DATAW *'])
const FindNextFileW = kernel32.func('FindNextFileW', 'bool', ['void *', 'WIN32_FIND_DATAW *'])
const FindClose = kernel32.func('FindClose', 'bool', ['void *'])

export type DirEntry = {
  name: string
  isDir: boolean
  isSymlink: boolean
  isReparse: boolean
  size: number
  mtimeMs: number
  atimeMs: number
  archive: boolean
}

/** One WIN32_FIND_DATAW for the process. Safe on the serial compare walk. */
const findDataScratch = koffi.alloc(WIN32_FIND_DATAW, 1)

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

function decodeWString(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    const codes = raw as number[]
    let end = codes.findIndex((c) => c === 0)
    if (end < 0) end = codes.length
    return String.fromCharCode(...codes.slice(0, end))
  }
  return String(raw ?? '')
}

export function fileTimeToMs(low: number, high: number): number {
  const ticks = BigInt(low >>> 0) + (BigInt(high >>> 0) << 32n)
  return Number(ticks / 10000n - EPOCH_DIFF_MS)
}

function searchGlob(absDir: string): string {
  const normalized = absDir.replace(/\//g, '\\').replace(/\\+$/, '')
  return toLongPath(`${normalized}\\*`)
}

type RawFind = {
  dwFileAttributes: number
  ftLastAccessTimeLow: number
  ftLastAccessTimeHigh: number
  ftLastWriteTimeLow: number
  ftLastWriteTimeHigh: number
  nFileSizeHigh: number
  nFileSizeLow: number
  dwReserved0: number
  cFileName: unknown
}

function decodeEntry(raw: RawFind): DirEntry | undefined {
  const name = decodeWString(raw.cFileName)
  if (!name || name === '.' || name === '..') return undefined

  const attrs = raw.dwFileAttributes >>> 0
  const isDir = (attrs & FILE_ATTRIBUTE_DIRECTORY) !== 0
  const isReparse = (attrs & FILE_ATTRIBUTE_REPARSE_POINT) !== 0
  const isSymlink = isReparse && raw.dwReserved0 >>> 0 === IO_REPARSE_TAG_SYMLINK
  const size = (raw.nFileSizeHigh >>> 0) * 0x1_0000_0000 + (raw.nFileSizeLow >>> 0)

  return {
    name,
    isDir,
    isSymlink,
    isReparse,
    size,
    mtimeMs: fileTimeToMs(raw.ftLastWriteTimeLow, raw.ftLastWriteTimeHigh),
    atimeMs: fileTimeToMs(raw.ftLastAccessTimeLow, raw.ftLastAccessTimeHigh),
    archive: (attrs & FILE_ATTRIBUTE_ARCHIVE) !== 0,
  }
}

/**
 * Directory listing via FindFirstFileW — size and mtime come from the directory
 * index. Does not open each file (so antivirus does not scan $DATA).
 */
export function readDirectoryWin32(absDir: string): Map<string, DirEntry> {
  const entries = new Map<string, DirEntry>()
  const data = findDataScratch
  const handle = FindFirstFileW(searchGlob(absDir), data)
  if (isInvalidHandle(handle)) return entries

  try {
    do {
      const entry = decodeEntry(koffi.decode(data, WIN32_FIND_DATAW) as RawFind)
      if (entry) entries.set(entry.name.toLowerCase(), entry)
    } while (FindNextFileW(handle, data))
  } finally {
    FindClose(handle)
  }

  return entries
}
