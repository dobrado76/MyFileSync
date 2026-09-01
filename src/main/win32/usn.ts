import koffi from 'koffi'
import { toLongPath } from '@shared/ads/paths'
import { pathUnderRoot, usnRecordAbsPaths, type UsnJournalLive } from '@shared/compare/usnPlan'
import { ioError, ok, type Result } from '@shared/result'
import { withNativeLock } from './nativeLock'

const GENERIC_READ = 0x80000000
const FILE_READ_ATTRIBUTES = 0x00000080
const FILE_SHARE_READ = 0x00000001
const FILE_SHARE_WRITE = 0x00000002
const FILE_SHARE_DELETE = 0x00000004
const OPEN_EXISTING = 3
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const INVALID_HANDLE_VALUE = 0xffffffffffffffffn

/** FILE_DEVICE_FILE_SYSTEM=9, function 61, METHOD_BUFFERED */
const FSCTL_QUERY_USN_JOURNAL = 0x000900f4
/** FILE_DEVICE_FILE_SYSTEM=9, function 46, METHOD_NEITHER — usually needs admin */
const FSCTL_READ_USN_JOURNAL = 0x000900bb
/** Same read without admin (Windows 8+), works on a volume-root directory handle */
const FSCTL_READ_UNPRIVILEGED_USN_JOURNAL = 0x000903ab

const FileIdType = 0
const MAX_RECORDS = 1_000_000

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
const CloseHandle = kernel32.func('CloseHandle', 'bool', ['void *'])
const DeviceIoControl = kernel32.func('DeviceIoControl', 'bool', [
  'void *',
  'uint32',
  'void *',
  'uint32',
  'void *',
  'uint32',
  'void *',
  'void *',
])
const GetVolumePathNameW = kernel32.func('GetVolumePathNameW', 'bool', ['str16', 'void *', 'uint32'])
const GetFinalPathNameByHandleW = kernel32.func('GetFinalPathNameByHandleW', 'uint32', [
  'void *',
  'void *',
  'uint32',
  'uint32',
])
const OpenFileById = kernel32.func('OpenFileById', 'void *', [
  'void *',
  'void *',
  'uint32',
  'uint32',
  'void *',
  'uint32',
])
const GetLastError = kernel32.func('GetLastError', 'uint32', [])
const GetVolumeInformationW = kernel32.func('GetVolumeInformationW', 'bool', [
  'str16',
  'void *',
  'uint32',
  'void *',
  'void *',
  'void *',
  'void *',
  'uint32',
])
const GetVolumeNameForVolumeMountPointW = kernel32.func(
  'GetVolumeNameForVolumeMountPointW',
  'bool',
  ['str16', 'void *', 'uint32'],
)

const ERROR_HANDLE_EOF = 38
const ERROR_JOURNAL_ENTRY_DELETED = 1181

function ioctl(
  handle: unknown,
  code: number,
  input: Buffer | null,
  output: Buffer,
): { ok: boolean; bytes: number; lastError: number } {
  const returned = Buffer.alloc(4)
  const succeeded = DeviceIoControl(
    handle,
    code,
    input,
    input?.length ?? 0,
    output,
    output.length,
    returned,
    null,
  )
  return {
    ok: Boolean(succeeded),
    bytes: returned.readUInt32LE(0),
    lastError: succeeded ? 0 : GetLastError(),
  }
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

function readUtf16z(buf: Buffer, maxChars: number): string {
  const chars: number[] = []
  for (let i = 0; i < maxChars; i++) {
    const c = buf.readUInt16LE(i * 2)
    if (c === 0) break
    chars.push(c)
  }
  return String.fromCharCode(...chars)
}

function stripDosPrefix(absPath: string): string {
  let p = absPath
  if (p.startsWith('\\\\?\\UNC\\')) p = `\\\\${p.slice(8)}`
  else if (p.startsWith('\\\\?\\')) p = p.slice(4)
  return p
}

export function volumeRootForPath(absPath: string): string | null {
  const out = Buffer.alloc(520)
  if (!GetVolumePathNameW(toLongPath(absPath), out, 260)) return null
  const root = readUtf16z(out, 260)
  return root || null
}

function volumeDeviceName(volumeRoot: string): string | null {
  const mount = volumeRoot.endsWith('\\') ? volumeRoot : `${volumeRoot}\\`
  const out = Buffer.alloc(200)
  if (!GetVolumeNameForVolumeMountPointW(mount, out, 50)) return null
  const name = readUtf16z(out, 50)
  if (!name) return null
  return name.replace(/^\\\\\?\\/, '\\\\.\\').replace(/\\+$/, '')
}

function openVolumeHandle(volumeRoot: string): unknown {
  const letter = volumeRoot.replace(/[\\/]+$/, '')
  const device = volumeDeviceName(volumeRoot)
  const candidates = [
    volumeRoot.endsWith('\\') ? volumeRoot : `${volumeRoot}\\`,
    `\\\\.\\${letter}`,
    ...(device ? [device] : []),
  ]
  for (const name of candidates) {
    const handle = CreateFileW(
      name,
      GENERIC_READ,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      null,
      OPEN_EXISTING,
      FILE_FLAG_BACKUP_SEMANTICS,
      null,
    )
    if (!isInvalidHandle(handle)) return handle
  }
  return null
}

function volumeSerialSync(volumeRoot: string): string | undefined {
  const serial = Buffer.alloc(4)
  if (!GetVolumeInformationW(volumeRoot, null, 0, serial, null, null, null, 0)) return undefined
  return String(serial.readUInt32LE(0))
}

function queryJournalSync(volumeHandle: unknown, volumeRoot: string): Result<UsnJournalLive> {
  const out = Buffer.alloc(80)
  const queried = ioctl(volumeHandle, FSCTL_QUERY_USN_JOURNAL, null, out)
  if (!queried.ok) {
    return ioError('This volume has no NTFS change journal (or it could not be read).')
  }
  return ok({
    journalId: out.readBigUInt64LE(0).toString(),
    firstUsn: out.readBigUInt64LE(8).toString(),
    nextUsn: out.readBigUInt64LE(16).toString(),
    volumeSerial: volumeSerialSync(volumeRoot),
    maximumSize: out.readBigUInt64LE(40).toString(),
  })
}

export async function queryUsnJournal(absPath: string): Promise<Result<UsnJournalLive & { volumeRoot: string }>> {
  if (process.platform !== 'win32') {
    return ioError('The NTFS change journal is only available on Windows.')
  }
  return withNativeLock(() => {
    const volumeRoot = volumeRootForPath(absPath)
    if (!volumeRoot) return ioError('Could not resolve the volume for this folder.')
    const handle = openVolumeHandle(volumeRoot)
    if (isInvalidHandle(handle)) {
      return ioError('Could not open the volume to read the change journal.')
    }
    try {
      const queried = queryJournalSync(handle, volumeRoot)
      if (!queried.ok) return queried
      return ok({ ...queried.value, volumeRoot })
    } finally {
      CloseHandle(handle)
    }
  })
}

function writeReadJournalRequest(startUsn: bigint, journalId: bigint, versioned: boolean): Buffer {
  const buf = Buffer.alloc(versioned ? 44 : 40)
  buf.writeBigUInt64LE(startUsn, 0)
  buf.writeUInt32LE(0xffffffff, 8)
  buf.writeUInt32LE(0, 12)
  buf.writeBigUInt64LE(0n, 16)
  buf.writeBigUInt64LE(0n, 24)
  buf.writeBigUInt64LE(journalId, 32)
  if (versioned) {
    buf.writeUInt16LE(2, 40)
    buf.writeUInt16LE(3, 42)
  }
  return buf
}

function decodeFinalPath(handle: unknown): string | null {
  const out = Buffer.alloc(1320)
  const n = GetFinalPathNameByHandleW(handle, out, 660, 0)
  if (!n) return null
  return stripDosPrefix(readUtf16z(out, n))
}

function openByFileId(volumeHandle: unknown, fileId: bigint): unknown {
  const desc = Buffer.alloc(24)
  desc.writeUInt32LE(24, 0)
  desc.writeUInt32LE(FileIdType, 4)
  // NTFS file reference numbers are opaque uint64 — high bit set is normal.
  desc.writeBigUInt64LE(fileId, 8)
  return OpenFileById(
    volumeHandle,
    desc,
    FILE_READ_ATTRIBUTES,
    FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
    null,
    FILE_FLAG_BACKUP_SEMANTICS,
  )
}

function resolveFrnPath(
  volumeHandle: unknown,
  frn: bigint,
  cache: Map<string, string | null>,
): string | null {
  const key = frn.toString()
  if (cache.has(key)) return cache.get(key) ?? null
  const handle = openByFileId(volumeHandle, frn)
  if (isInvalidHandle(handle)) {
    cache.set(key, null)
    return null
  }
  try {
    const abs = decodeFinalPath(handle)
    cache.set(key, abs)
    return abs
  } finally {
    CloseHandle(handle)
  }
}

function parseUsnRecords(
  buf: Buffer,
  bytes: number,
  volumeHandle: unknown,
  pairRoot: string,
  cache: Map<string, string | null>,
): { relPaths: string[]; unresolved: number; recordCount: number; nextStartUsn: bigint } {
  const relPaths: string[] = []
  let unresolved = 0
  let recordCount = 0
  const nextStartUsn = buf.readBigUInt64LE(0)
  let offset = 8
  while (offset + 60 <= bytes) {
    const recordLength = buf.readUInt32LE(offset)
    if (recordLength < 60 || offset + recordLength > bytes) break
    const major = buf.readUInt16LE(offset + 4)
    let fileId: bigint
    let parentId: bigint
    let nameOff: number
    let nameLen: number
    if (major === 2) {
      fileId = buf.readBigUInt64LE(offset + 8)
      parentId = buf.readBigUInt64LE(offset + 16)
      nameLen = buf.readUInt16LE(offset + 56)
      nameOff = buf.readUInt16LE(offset + 58)
    } else if (major === 3) {
      fileId = buf.readBigUInt64LE(offset + 8)
      parentId = buf.readBigUInt64LE(offset + 24)
      nameLen = buf.readUInt16LE(offset + 72)
      nameOff = buf.readUInt16LE(offset + 74)
    } else {
      offset += recordLength
      continue
    }
    recordCount++
    const name = buf.toString('utf16le', offset + nameOff, offset + nameOff + nameLen)
    const selfPath = resolveFrnPath(volumeHandle, fileId, cache)
    const parentPath = resolveFrnPath(volumeHandle, parentId, cache)
    const candidates = usnRecordAbsPaths(selfPath, parentPath, name)
    if (candidates.length === 0) {
      unresolved++
    } else {
      for (const abs of candidates) {
        const rel = pathUnderRoot(abs, pairRoot)
        if (rel !== null) relPaths.push(rel)
      }
    }
    offset += recordLength
  }
  return { relPaths, unresolved, recordCount, nextStartUsn }
}

export type UsnDirtyResult = {
  relPaths: string[]
  live: UsnJournalLive
  volumeRoot: string
  consumedNextUsn: string
}

/**
 * When journal records cannot be turned into paths, incremental compare may be unsafe.
 * Unresolvable FRNs (deleted files elsewhere on the volume) are ignored — only abort when
 * OpenFileById failed for every record, which usually means the volume cannot be read.
 */
export function usnReadShouldAbort(
  recordCount: number,
  unresolved: number,
  relPathCount: number,
): string | null {
  if (recordCount >= MAX_RECORDS) {
    return 'Too many change-journal records; doing a full compare.'
  }
  const resolvedCount = recordCount - unresolved
  if (recordCount > 0 && relPathCount === 0 && resolvedCount === 0) {
    return 'Could not resolve any change-journal paths; doing a full compare.'
  }
  return null
}

/**
 * Rel paths under `pairRoot` that changed since `startUsn` (inclusive lower bound).
 * Returns an error when the journal cannot be used (caller should full-walk).
 */
export async function readUsnDirtyRelPaths(
  pairRoot: string,
  startUsn: string,
  expectedJournalId: string,
): Promise<Result<UsnDirtyResult>> {
  if (process.platform !== 'win32') {
    return ioError('The NTFS change journal is only available on Windows.')
  }
  try {
    return await withNativeLock(() => {
    const volumeRoot = volumeRootForPath(pairRoot)
    if (!volumeRoot) return ioError('Could not resolve the volume for this folder.')
    const handle = openVolumeHandle(volumeRoot)
    if (isInvalidHandle(handle)) {
      return ioError('Could not open the volume to read the change journal.')
    }
    try {
      const live = queryJournalSync(handle, volumeRoot)
      if (!live.ok) return live
      if (live.value.journalId !== expectedJournalId) {
        return ioError('The change journal was recreated.')
      }
      const start = BigInt(startUsn)
      const first = BigInt(live.value.firstUsn)
      if (start < first) return ioError('The change journal wrapped; older records are gone.')

      const relPaths: string[] = []
      const cache = new Map<string, string | null>()
      let unresolved = 0
      let recordCount = 0
      let cursor = start
      const out = Buffer.alloc(256 * 1024)
      let useVersioned = true
      const readCodes = [FSCTL_READ_UNPRIVILEGED_USN_JOURNAL, FSCTL_READ_USN_JOURNAL]
      let readCode = readCodes[0] ?? FSCTL_READ_UNPRIVILEGED_USN_JOURNAL

      while (cursor < BigInt(live.value.nextUsn) && recordCount < MAX_RECORDS) {
        let request = writeReadJournalRequest(cursor, BigInt(live.value.journalId), useVersioned)
        let read = ioctl(handle, readCode, request, out)
        if (!read.ok && useVersioned) {
          useVersioned = false
          request = writeReadJournalRequest(cursor, BigInt(live.value.journalId), false)
          read = ioctl(handle, readCode, request, out)
        }
        if (!read.ok && readCode === FSCTL_READ_UNPRIVILEGED_USN_JOURNAL) {
          readCode = FSCTL_READ_USN_JOURNAL
          read = ioctl(handle, readCode, request, out)
        }
        if (!read.ok) {
          if (read.lastError === ERROR_HANDLE_EOF) break
          if (read.lastError === ERROR_JOURNAL_ENTRY_DELETED) {
            return ioError('The change journal wrapped; older records are gone.')
          }
          return ioError('Could not read the NTFS change journal.')
        }
        const bytes = read.bytes
        if (bytes < 8) break
        const parsed = parseUsnRecords(out, bytes, handle, pairRoot, cache)
        relPaths.push(...parsed.relPaths)
        unresolved += parsed.unresolved
        recordCount += parsed.recordCount
        if (parsed.nextStartUsn <= cursor) break
        cursor = parsed.nextStartUsn
      }

      if (recordCount >= MAX_RECORDS) {
        return ioError('Too many change-journal records; doing a full compare.')
      }
      const abort = usnReadShouldAbort(recordCount, unresolved, relPaths.length)
      if (abort) return ioError(abort)

      return ok({
        relPaths,
        live: live.value,
        volumeRoot,
        consumedNextUsn: live.value.nextUsn,
      })
    } finally {
      CloseHandle(handle)
    }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(message)
  }
}
