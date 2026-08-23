import type { UsnJournalCursor } from './usnPlan'

/** ADS on each pair root — shared across jobs with the same folders. */
export const USN_CURSOR_STREAM_NAME = 'MyFileSyncUsn'

export type UsnAdsPayload = {
  version: 1
  filterKey: string
  leftRoot: string
  rightRoot: string
  left: UsnJournalCursor
  right: UsnJournalCursor
  outstanding: string[]
}

export function normalizePairRootPath(absPath: string): string {
  return absPath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

export function pairRootsMatch(a: string, b: string): boolean {
  return normalizePairRootPath(a) === normalizePairRootPath(b)
}

export function serializeUsnAdsPayload(payload: UsnAdsPayload): string {
  return `${JSON.stringify(payload)}\n`
}

export function parseUsnAdsPayload(raw: string): UsnAdsPayload | null {
  try {
    const parsed = JSON.parse(raw.trim()) as UsnAdsPayload
    if (parsed.version !== 1) return null
    if (typeof parsed.filterKey !== 'string') return null
    if (typeof parsed.leftRoot !== 'string' || typeof parsed.rightRoot !== 'string') return null
    if (!parsed.left?.journalId || !parsed.left?.nextUsn) return null
    if (!parsed.right?.journalId || !parsed.right?.nextUsn) return null
    if (!Array.isArray(parsed.outstanding)) return null
    return parsed
  } catch {
    return null
  }
}

export function usnAdsPayloadMatchesPair(
  payload: UsnAdsPayload,
  leftRoot: string,
  rightRoot: string,
  filterKey: string,
): boolean {
  if (payload.filterKey !== filterKey) return false
  if (!pairRootsMatch(payload.leftRoot, leftRoot)) return false
  if (!pairRootsMatch(payload.rightRoot, rightRoot)) return false
  return true
}

export function usnAdsToPersistedPair(payload: UsnAdsPayload): {
  left: UsnJournalCursor
  right: UsnJournalCursor
  outstanding: string[]
} {
  return {
    left: payload.left,
    right: payload.right,
    outstanding: [...payload.outstanding],
  }
}

export function persistedPairToUsnAds(
  filterKey: string,
  pair: { left: string; right: string },
  saved: {
    left: UsnJournalCursor
    right: UsnJournalCursor
    outstanding: string[]
  },
): UsnAdsPayload {
  return {
    version: 1,
    filterKey,
    leftRoot: pair.left,
    rightRoot: pair.right,
    left: saved.left,
    right: saved.right,
    outstanding: [...saved.outstanding],
  }
}
