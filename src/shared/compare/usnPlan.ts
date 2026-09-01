import type { JobFile, JobPair } from '../schemas/job'
import { pairComparesAds } from '../schemas/job'

export type UsnJournalLive = {
  journalId: string
  firstUsn: string
  nextUsn: string
  volumeSerial?: string
  /** USN_JOURNAL_DATA.MaximumSize in bytes, when the query returns it. */
  maximumSize?: string
}

export type UsnJournalCursor = {
  volumeRoot: string
  journalId: string
  nextUsn: string
  volumeSerial?: string
}

/** True when the saved cursor is still inside the live journal ring. */
export function journalCursorValid(saved: UsnJournalCursor, live: UsnJournalLive): boolean {
  return describeJournalCursorInvalid(saved, live) === null
}

/** Plain-language reason when {@link journalCursorValid} is false. */
export function describeJournalCursorInvalid(
  saved: UsnJournalCursor,
  live: UsnJournalLive,
): string | null {
  if (saved.volumeSerial && live.volumeSerial && saved.volumeSerial !== live.volumeSerial) {
    return `volume serial changed (${saved.volumeSerial} → ${live.volumeSerial})`
  }
  if (saved.journalId !== live.journalId) {
    return `change journal was recreated (id ${saved.journalId} → ${live.journalId})`
  }
  try {
    const savedUsn = BigInt(saved.nextUsn)
    const first = BigInt(live.firstUsn)
    const next = BigInt(live.nextUsn)
    if (savedUsn < first) {
      return `cursor USN ${saved.nextUsn} is before journal start ${live.firstUsn} (journal wrapped)`
    }
    if (savedUsn > next) {
      return `cursor USN ${saved.nextUsn} is ahead of journal head ${live.nextUsn}`
    }
    return null
  } catch {
    return 'cursor USN values are invalid'
  }
}

export function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

/** Folder prefixes that must be walked (the path and every ancestor). */
export function buildDirtyPrefixSet(relPaths: readonly string[]): Set<string> {
  const prefixes = new Set<string>()
  for (const raw of relPaths) {
    const rel = normalizeRelPath(raw)
    if (!rel) {
      prefixes.add('')
      continue
    }
    prefixes.add(rel)
    const parts = rel.split('/')
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? `${acc}/${parts[i]}` : (parts[i] ?? '')
      prefixes.add(acc)
    }
  }
  return prefixes
}

/**
 * Skip a folder when nothing dirty lives at or under it.
 * The pair root (`''`) is never skipped.
 */
export function shouldSkipUsnSubtree(relDir: string, dirtyPrefixes: Set<string>): boolean {
  const dir = normalizeRelPath(relDir)
  if (!dir) return false
  if (dirtyPrefixes.has(dir)) return false
  const prefix = `${dir}/`
  for (const dirty of dirtyPrefixes) {
    if (dirty === dir || dirty.startsWith(prefix)) return false
  }
  return true
}

/** Normalize a pair root for stable cross-job identity (Windows paths). */
export function normalizeUsnRootPath(p: string): string {
  let s = p.trim().replace(/\//g, '\\').replace(/\\+$/, '')
  if (s.startsWith('\\\\?\\UNC\\')) s = `\\\\${s.slice(8)}`
  else if (s.startsWith('\\\\?\\')) s = s.slice(4)
  return s.toLowerCase()
}

const USN_FILTER_LABELS = [
  'variant',
  'sync all ADS streams',
  'excluded ADS streams',
  'include filters',
  'exclude filters',
] as const

/** Parts that make up {@link compareUsnFilterKey} (sorted where order is irrelevant). */
export function compareUsnFilterKeyParts(job: JobFile): string[] {
  return [
    job.variant,
    String(job.ads.syncAllStreams ? 1 : 0),
    [...job.ads.excludeStreams].sort().join(','),
    [...job.filters.include].sort().join(','),
    [...job.filters.exclude].sort().join(','),
  ]
}

/**
 * Job-level settings that change which rows Compare would emit.
 * Pair enable ticks are not included — ticking a second pair must not
 * throw away the first pair’s journal cursor.
 */
export function compareUsnFilterKey(job: JobFile): string {
  return compareUsnFilterKeyParts(job).join('::')
}

export function describeUsnFilterKeyDiff(savedKey: string, job: JobFile): string[] {
  const savedParts = savedKey.split('::')
  const currentParts = compareUsnFilterKeyParts(job)
  const diffs: string[] = []
  for (let i = 0; i < USN_FILTER_LABELS.length; i++) {
    const label = USN_FILTER_LABELS[i]!
    const before = savedParts[i] ?? ''
    const after = currentParts[i] ?? ''
    if (before !== after) {
      const empty = (value: string) => (value ? value : '(none)')
      diffs.push(`${label}: ${empty(before)} → ${empty(after)}`)
    }
  }
  return diffs
}

export function parsePairIdentityKey(
  key: string,
): { ads: boolean; left: string; right: string } | null {
  const sep = key.indexOf('\0')
  if (sep < 0) return null
  const adsFlag = key.slice(0, sep)
  const pathPart = key.slice(sep + 1)
  const split = pathPart.indexOf('\0')
  if (split < 0) return null
  return {
    ads: adsFlag === '1',
    left: pathPart.slice(0, split),
    right: pathPart.slice(split + 1),
  }
}

export function pairIdentityKeysEqual(savedKey: string, pair: JobPair): boolean {
  if (savedKey === compareUsnPairIdentityKey(pair)) return true
  const saved = parsePairIdentityKey(savedKey)
  if (!saved) return false
  return (
    saved.ads === pairComparesAds(pair) &&
    normalizeUsnRootPath(saved.left) === normalizeUsnRootPath(pair.left) &&
    normalizeUsnRootPath(saved.right) === normalizeUsnRootPath(pair.right)
  )
}

export function describeUsnPairIdentityDiff(savedKey: string, pair: JobPair): string[] {
  if (pairIdentityKeysEqual(savedKey, pair)) return []
  const sep = savedKey.indexOf('\0')
  if (sep < 0) return ['folder paths changed']
  const adsFlag = savedKey.slice(0, sep)
  const pathPart = savedKey.slice(sep + 1)
  const split = pathPart.indexOf('\0')
  if (split < 0) return ['folder paths changed']
  const savedLeft = pathPart.slice(0, split)
  const savedRight = pathPart.slice(split + 1)
  const diffs: string[] = []
  if (adsFlag !== String(pairComparesAds(pair) ? 1 : 0)) {
    diffs.push(`pair ADS compare: ${adsFlag === '1' ? 'on' : 'off'} → ${pairComparesAds(pair) ? 'on' : 'off'}`)
  }
  if (normalizeUsnRootPath(savedLeft) !== normalizeUsnRootPath(pair.left)) {
    diffs.push(`left folder: ${savedLeft} → ${pair.left}`)
  }
  if (normalizeUsnRootPath(savedRight) !== normalizeUsnRootPath(pair.right)) {
    diffs.push(`right folder: ${savedRight} → ${pair.right}`)
  }
  return diffs.length > 0 ? diffs : ['folder paths changed']
}

/**
 * Pair path / ADS identity. Same left/right in another job shares USN state.
 * Pair enable ticks and pair.id are not included.
 */
export function compareUsnPairIdentityKey(pair: JobPair): string {
  return `${pairComparesAds(pair) ? 1 : 0}:${normalizeUsnRootPath(pair.left)}\0${normalizeUsnRootPath(pair.right)}`
}

/** AppData filename key: job compare settings + pair folder identity. */
export function compareUsnStoreKey(job: JobFile, pair: JobPair): string {
  return `${compareUsnFilterKey(job)}::${compareUsnPairIdentityKey(pair)}`
}

/** Per-job pair slot id — legacy AppData only; not used for shared pair files. */
export function compareUsnPairKey(pair: JobPair): string {
  return `${pair.id}:${pairComparesAds(pair) ? 1 : 0}:${pair.left}\0${pair.right}`
}

export type UsnSkipReason =
  | 'disabled'
  | 'no_journal'
  | 'no_cursor'
  | 'cursor_stale'
  | 'settings_mismatch'
  | 'too_many_changes'
  | 'unresolved_paths'
  | 'journal_read_failed'

export function usnSkipReasonLabel(reason: UsnSkipReason, detail?: string): string {
  switch (reason) {
    case 'disabled':
      return 'change journal is off in job settings'
    case 'no_journal':
      return 'volume has no NTFS change journal'
    case 'no_cursor':
      return 'no saved cursor yet — finish one Compare first'
    case 'cursor_stale':
      return detail ?? 'saved cursor is no longer valid for this volume'
    case 'settings_mismatch':
      return detail ?? 'compare settings or folder paths changed since last cursor'
    case 'too_many_changes':
      return 'too many file changes since last Compare'
    case 'unresolved_paths':
      return detail ?? 'change journal paths could not be resolved'
    case 'journal_read_failed':
      return detail ? `could not read change journal (${detail})` : 'could not read change journal'
  }
}

/** Parse Win32 USN read errors into a stable skip reason. */
export function classifyUsnReadError(message: string): UsnSkipReason {
  const lower = message.toLowerCase()
  if (lower.includes('wrapped') || lower.includes('recreated')) return 'cursor_stale'
  if (lower.includes('too many change-journal records')) return 'too_many_changes'
  if (lower.includes('could not be resolved')) return 'unresolved_paths'
  if (lower.includes('no ntfs change journal')) return 'no_journal'
  return 'journal_read_failed'
}

/** Paths stored in a legacy per-job cursor entry (pair id may differ). */
export function legacyUsnPairKeyMatches(pair: JobPair, savedKey: string | undefined): boolean {
  if (savedKey === undefined) return true
  if (savedKey === compareUsnPairKey(pair)) return true
  const sep = savedKey.indexOf('\0')
  if (sep < 0) return false
  const head = savedKey.slice(0, sep)
  const right = savedKey.slice(sep + 1)
  const firstColon = head.indexOf(':')
  const secondColon = head.indexOf(':', firstColon + 1)
  if (firstColon < 0 || secondColon < 0) return false
  const adsFlag = head.slice(firstColon + 1, secondColon)
  const left = head.slice(secondColon + 1)
  return (
    adsFlag === String(pairComparesAds(pair) ? 1 : 0) &&
    normalizeUsnRootPath(left) === normalizeUsnRootPath(pair.left) &&
    normalizeUsnRootPath(right) === normalizeUsnRootPath(pair.right)
  )
}

export function pathUnderRoot(absPath: string, root: string): string | null {
  const file = absPath.replace(/\//g, '\\').replace(/\\+$/, '')
  const base = root.replace(/\//g, '\\').replace(/\\+$/, '')
  if (file.toLowerCase() === base.toLowerCase()) return ''
  const prefix = `${base}\\`
  if (!file.toLowerCase().startsWith(prefix.toLowerCase())) return null
  return normalizeRelPath(file.slice(prefix.length))
}

/**
 * Absolute paths that may be dirty for one USN record.
 * Live FRN path alone misses rename/move sources: OpenFileById returns the
 * *current* location, while the record's parent+name is the path at event time
 * (RENAME_OLD_NAME). Both must be marked dirty so the old folder is rescanned
 * and right-side leftovers become Deletes (move detection).
 */
export function usnRecordAbsPaths(
  selfAbs: string | null,
  parentAbs: string | null,
  nameFromRecord: string,
): string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  function add(p: string | null | undefined): void {
    if (!p) return
    const normalized = p.replace(/\//g, '\\').replace(/\\+$/, '')
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    paths.push(normalized)
  }
  add(selfAbs)
  const name = nameFromRecord.trim()
  if (parentAbs && name && name !== '.' && name !== '..') {
    add(`${parentAbs.replace(/[\\/]+$/, '')}\\${name}`)
  }
  return paths
}
