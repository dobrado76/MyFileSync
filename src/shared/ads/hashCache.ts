/**
 * ADS hash cache payload. A hash alone is not trusted — it is only valid when
 * the recorded $DATA size and mtime still match the host file.
 *
 * Format: `v1|{hash}|{size}|{mtimeMs}` plus BackupMirror `\0\r\n` suffix.
 * Legacy hex-only MD5/SHA streams are treated as unknown (must re-hash).
 */
export const HASH_CACHE_PREFIX = 'v1'

export type FileHashCache = {
  hash: string
  size: number
  mtimeMs: number
}

export function serializeFileHashCache(entry: FileHashCache): string {
  return `${HASH_CACHE_PREFIX}|${entry.hash}|${entry.size}|${entry.mtimeMs}`
}

export function parseFileHashCache(raw: string): FileHashCache | undefined {
  const trimmed = raw.replace(/\0/g, '').replace(/\r\n/g, '').trim()
  if (!trimmed) return undefined

  const parts = trimmed.split('|')
  if (parts[0] === HASH_CACHE_PREFIX && parts.length >= 4) {
    const hash = parts[1] ?? ''
    const size = Number(parts[2])
    const mtimeMs = Number(parts[3])
    if (!hash || !Number.isFinite(size) || !Number.isFinite(mtimeMs)) return undefined
    return { hash, size, mtimeMs }
  }

  return undefined
}

export function isFileHashCacheCurrent(
  entry: FileHashCache,
  size: number,
  mtimeMs: number,
): boolean {
  return entry.size === size && Math.abs(entry.mtimeMs - mtimeMs) < 2
}
