import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  compareUsnFilterKey,
  compareUsnPairIdentityKey,
  compareUsnPairKey,
  compareUsnStoreKey,
  describeUsnFilterKeyDiff,
  describeUsnPairIdentityDiff,
  describeJournalCursorInvalid,
  journalCursorValid,
  legacyUsnPairKeyMatches,
  pairIdentityKeysEqual,
  type UsnJournalCursor,
  type UsnSkipReason,
} from '@shared/compare/usnPlan'
import type { JobFile, JobPair } from '@shared/schemas/job'
import { queryUsnJournal } from '../win32/usn'
import type { CompareRowStore } from './rowStore'

export type PersistedUsnPair = {
  left: UsnJournalCursor
  right: UsnJournalCursor
  outstanding: string[]
  /** Legacy per-job AppData only. */
  pairKey?: string
}

type PersistedUsnPairFile = {
  version: 1
  filterKey: string
  pairIdentityKey: string
  left: UsnJournalCursor
  right: UsnJournalCursor
  outstanding: string[]
}

/** Legacy: one JSON file per job id. */
export type PersistedUsnState = {
  version: 1
  jobId: string
  filterKey: string
  pairs: Record<string, PersistedUsnPair>
}

async function userDataDir(...parts: string[]): Promise<string> {
  const { app } = await import('electron')
  const dir = path.join(app.getPath('userData'), ...parts)
  await fsp.mkdir(dir, { recursive: true })
  return dir
}

function pairStoreFileName(storeKey: string): string {
  const hash = createHash('sha256').update(storeKey, 'utf8').digest('hex').slice(0, 32)
  return `${hash}.json`
}

async function pairStorePath(storeKey: string): Promise<string> {
  const dir = await userDataDir('compare-usn', 'pairs')
  return path.join(dir, pairStoreFileName(storeKey))
}

async function legacyJobStatePath(jobId: string): Promise<string> {
  const dir = await userDataDir('compare-usn')
  return path.join(dir, `${jobId}.json`)
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.tmp`
  await fsp.writeFile(tmp, `${JSON.stringify(value)}\n`, 'utf8')
  await fsp.rename(tmp, file)
}

async function snapshotCursor(absPath: string): Promise<UsnJournalCursor | null> {
  const queried = await queryUsnJournal(absPath)
  if (!queried.ok) return null
  return {
    volumeRoot: queried.value.volumeRoot,
    journalId: queried.value.journalId,
    nextUsn: queried.value.nextUsn,
    volumeSerial: queried.value.volumeSerial,
  }
}

export async function snapshotPairCursors(
  pair: JobPair,
  outstanding: string[],
): Promise<PersistedUsnPair | null> {
  const [left, right] = await Promise.all([snapshotCursor(pair.left), snapshotCursor(pair.right)])
  if (!left || !right) return null
  return {
    left,
    right,
    outstanding: [...outstanding],
    pairKey: compareUsnPairKey(pair),
  }
}

/** True when saved cursors are still inside the live journal ring on both volumes. */
export async function pairCursorsStillValid(
  pair: JobPair,
  saved: PersistedUsnPair,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const [leftLive, rightLive] = await Promise.all([
    queryUsnJournal(pair.left),
    queryUsnJournal(pair.right),
  ])
  if (!leftLive.ok) {
    return { ok: false, detail: `left: could not read journal (${leftLive.error.message})` }
  }
  if (!rightLive.ok) {
    return { ok: false, detail: `right: could not read journal (${rightLive.error.message})` }
  }
  const leftWhy = describeJournalCursorInvalid(saved.left, leftLive.value)
  if (leftWhy) return { ok: false, detail: `left: ${leftWhy}` }
  const rightWhy = describeJournalCursorInvalid(saved.right, rightLive.value)
  if (rightWhy) return { ok: false, detail: `right: ${rightWhy}` }
  return { ok: true }
}

export function outstandingRelPaths(store: CompareRowStore, pairId?: string): string[] {
  const out: string[] = []
  for (const row of store.listSlimPaths()) {
    if (pairId && row.pairId !== pairId) continue
    if (row.relPath) out.push(row.relPath)
    if (row.fromRelPath) out.push(row.fromRelPath)
  }
  return out
}

function pairFileToPersisted(saved: PersistedUsnPairFile): PersistedUsnPair {
  return {
    left: saved.left,
    right: saved.right,
    outstanding: saved.outstanding,
  }
}

function describeStoreMismatch(saved: PersistedUsnPairFile, job: JobFile, pair: JobPair): string {
  const parts = [
    ...describeUsnPairIdentityDiff(saved.pairIdentityKey, pair),
    ...describeUsnFilterKeyDiff(saved.filterKey, job),
  ]
  return parts.length > 0 ? parts.join('; ') : 'cursor file does not match this pair'
}

async function listPairStoreFiles(): Promise<PersistedUsnPairFile[]> {
  const dir = await userDataDir('compare-usn', 'pairs')
  let names: string[] = []
  try {
    names = await fsp.readdir(dir)
  } catch {
    return []
  }
  const out: PersistedUsnPairFile[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const saved = await readJsonFile<PersistedUsnPairFile>(path.join(dir, name))
    if (saved?.version === 1) out.push(saved)
  }
  return out
}

async function findStoreByPairIdentity(
  pair: JobPair,
): Promise<PersistedUsnPairFile | null> {
  for (const saved of await listPairStoreFiles()) {
    if (pairIdentityKeysEqual(saved.pairIdentityKey, pair)) return saved
  }
  return null
}

async function loadPairUsnFromStore(job: JobFile, pair: JobPair): Promise<PersistedUsnPair | null> {
  const storeKey = compareUsnStoreKey(job, pair)
  const file = await pairStorePath(storeKey)
  let saved = await readJsonFile<PersistedUsnPairFile>(file)
  if (!saved) saved = await findStoreByPairIdentity(pair)
  if (!saved || saved.version !== 1 || !pairIdentityKeysEqual(saved.pairIdentityKey, pair)) return null
  return pairFileToPersisted(saved)
}

async function loadLegacyJobPair(
  job: JobFile,
  pair: JobPair,
): Promise<PersistedUsnPair | null> {
  const saved = await readJsonFile<PersistedUsnState>(await legacyJobStatePath(job.id))
  if (!saved || saved.version !== 1 || saved.jobId !== job.id) return null

  const byId = saved.pairs[pair.id]
  if (byId && legacyUsnPairKeyMatches(pair, byId.pairKey)) return byId

  for (const entry of Object.values(saved.pairs)) {
    if (legacyUsnPairKeyMatches(pair, entry.pairKey)) return entry
  }
  return null
}

async function pairStoreFileExists(job: JobFile, pair: JobPair): Promise<boolean> {
  const storeKey = compareUsnStoreKey(job, pair)
  const file = await pairStorePath(storeKey)
  try {
    await fsp.access(file)
    return true
  } catch {
    return (await findStoreByPairIdentity(pair)) !== null
  }
}

async function savePairUsnToStore(
  job: JobFile,
  pair: JobPair,
  cursors: PersistedUsnPair,
): Promise<void> {
  const storeKey = compareUsnStoreKey(job, pair)
  const file = await pairStorePath(storeKey)
  const body: PersistedUsnPairFile = {
    version: 1,
    filterKey: compareUsnFilterKey(job),
    pairIdentityKey: compareUsnPairIdentityKey(pair),
    left: cursors.left,
    right: cursors.right,
    outstanding: cursors.outstanding,
  }
  await writeJsonAtomic(file, body)
}

export async function loadPairUsnCandidates(
  job: JobFile,
  pair: JobPair,
): Promise<{ candidates: PersistedUsnPair[]; missReason?: UsnSkipReason; missDetail?: string }> {
  const out: PersistedUsnPair[] = []
  let missReason: UsnSkipReason | undefined
  let missDetail: string | undefined

  const storeKey = compareUsnStoreKey(job, pair)
  const storeFile = await pairStorePath(storeKey)
  let storeRaw = await readJsonFile<PersistedUsnPairFile>(storeFile)
  if (!storeRaw) storeRaw = await findStoreByPairIdentity(pair)

  const identityMatches =
    storeRaw?.version === 1 && pairIdentityKeysEqual(storeRaw.pairIdentityKey, pair)
  const fromStore = identityMatches ? pairFileToPersisted(storeRaw!) : null

  if (fromStore) {
    const valid = await pairCursorsStillValid(pair, fromStore)
    if (valid.ok) {
      out.push(fromStore)
      const filterDiff = describeUsnFilterKeyDiff(storeRaw!.filterKey, job)
      if (filterDiff.length > 0) {
        missDetail = `compare settings changed since cursor saved: ${filterDiff.join('; ')}`
      }
    } else {
      missReason = 'cursor_stale'
      missDetail = valid.detail
    }
  } else if (storeRaw?.version === 1) {
    missReason = 'settings_mismatch'
    missDetail = describeStoreMismatch(storeRaw, job, pair)
  }

  const fromLegacy = await loadLegacyJobPair(job, pair)
  if (fromLegacy) {
    const valid = await pairCursorsStillValid(pair, fromLegacy)
    if (valid.ok) {
      const sameAsStore =
        fromStore &&
        fromStore.left.nextUsn === fromLegacy.left.nextUsn &&
        fromStore.right.nextUsn === fromLegacy.right.nextUsn
      if (!sameAsStore) out.push(fromLegacy)
    } else if (!missReason) {
      missReason = 'cursor_stale'
      missDetail = valid.detail
    }
  } else {
    const legacyState = await readJsonFile<PersistedUsnState>(await legacyJobStatePath(job.id))
    if (legacyState?.version === 1 && legacyState.filterKey !== compareUsnFilterKey(job) && !missReason) {
      const filterDiff = describeUsnFilterKeyDiff(legacyState.filterKey, job)
      if (filterDiff.length > 0) {
        missReason = 'settings_mismatch'
        missDetail = `legacy job cursor settings differ: ${filterDiff.join('; ')}`
      }
    }
  }

  if (out.length === 0 && !missReason) {
    missReason = (await pairStoreFileExists(job, pair)) ? 'cursor_stale' : 'no_cursor'
    if (missReason === 'no_cursor') {
      missDetail = 'finish one Compare for this pair to save a cursor'
    }
  }

  return { candidates: out, missReason, missDetail }
}

export async function persistUsnAfterCompare(
  job: JobFile,
  store: CompareRowStore,
  pairs: Record<string, PersistedUsnPair>,
  filterKey: string,
): Promise<void> {
  void filterKey
  for (const [pairId, cursors] of Object.entries(pairs)) {
    const pair = job.pairs.find((item) => item.id === pairId)
    if (!pair) continue
    const outstanding = outstandingRelPaths(store, pairId)
    const refreshed = await snapshotPairCursors(pair, outstanding)
    if (!refreshed) continue
    await savePairUsnToStore(job, pair, refreshed)
  }
}

export async function persistUsnAfterSync(job: JobFile, store: CompareRowStore): Promise<void> {
  for (const pair of job.pairs) {
    if (!pair.enabled) continue
    const outstanding = outstandingRelPaths(store, pair.id)
    const refreshed = await snapshotPairCursors(pair, outstanding)
    if (!refreshed) continue
    await savePairUsnToStore(job, pair, refreshed)
  }
}
