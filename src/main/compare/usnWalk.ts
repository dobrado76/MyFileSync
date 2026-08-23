import {
  buildDirtyPrefixSet,
  classifyUsnReadError,
  describeJournalCursorInvalid,
  journalCursorValid,
  shouldSkipUsnSubtree,
  type UsnJournalCursor,
  type UsnSkipReason,
} from '@shared/compare/usnPlan'
import type { JobFile, JobPair } from '@shared/schemas/job'
import { queryUsnJournal, readUsnDirtyRelPaths } from '../win32/usn'
import { loadPairUsnCandidates, type PersistedUsnPair } from './usnState'

export type PairUsnPlan = {
  usedJournal: boolean
  skipReason?: UsnSkipReason
  skipDetail?: string
  skipSubtree?: (relDir: string) => boolean
  cursors?: PersistedUsnPair
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

type IncrementalTry =
  | { ok: true; plan: PairUsnPlan }
  | { ok: false; reason: UsnSkipReason; detail?: string }

async function tryIncremental(
  pair: JobPair,
  saved: PersistedUsnPair,
): Promise<IncrementalTry> {
  const [leftDirty, rightDirty] = await Promise.all([
    readUsnDirtyRelPaths(pair.left, saved.left.nextUsn, saved.left.journalId),
    readUsnDirtyRelPaths(pair.right, saved.right.nextUsn, saved.right.journalId),
  ])
  if (!leftDirty.ok) {
    return {
      ok: false,
      reason: classifyUsnReadError(leftDirty.error.message),
      detail: leftDirty.error.message,
    }
  }
  if (!rightDirty.ok) {
    return {
      ok: false,
      reason: classifyUsnReadError(rightDirty.error.message),
      detail: rightDirty.error.message,
    }
  }
  if (!journalCursorValid(saved.left, leftDirty.value.live)) {
    return {
      ok: false,
      reason: 'cursor_stale',
      detail: `left: ${describeJournalCursorInvalid(saved.left, leftDirty.value.live) ?? 'cursor invalid'}`,
    }
  }
  if (!journalCursorValid(saved.right, rightDirty.value.live)) {
    return {
      ok: false,
      reason: 'cursor_stale',
      detail: `right: ${describeJournalCursorInvalid(saved.right, rightDirty.value.live) ?? 'cursor invalid'}`,
    }
  }

  const dirty = buildDirtyPrefixSet([
    ...leftDirty.value.relPaths,
    ...rightDirty.value.relPaths,
    ...saved.outstanding,
  ])
  return {
    ok: true,
    plan: {
      usedJournal: true,
      skipSubtree: (relDir) => shouldSkipUsnSubtree(relDir, dirty),
      cursors: {
        left: {
          volumeRoot: leftDirty.value.volumeRoot,
          journalId: leftDirty.value.live.journalId,
          nextUsn: leftDirty.value.consumedNextUsn,
          volumeSerial: leftDirty.value.live.volumeSerial,
        },
        right: {
          volumeRoot: rightDirty.value.volumeRoot,
          journalId: rightDirty.value.live.journalId,
          nextUsn: rightDirty.value.consumedNextUsn,
          volumeSerial: rightDirty.value.live.volumeSerial,
        },
        outstanding: saved.outstanding,
      },
    },
  }
}

export async function planPairUsn(job: JobFile, pair: JobPair): Promise<PairUsnPlan> {
  const [leftSnap, rightSnap] = await Promise.all([snapshotCursor(pair.left), snapshotCursor(pair.right)])
  const fullCursors =
    leftSnap && rightSnap
      ? { left: leftSnap, right: rightSnap, outstanding: [] as string[] }
      : undefined

  if (process.platform !== 'win32' || job.compare.useUsnJournal === false) {
    return {
      usedJournal: false,
      skipReason: job.compare.useUsnJournal === false ? 'disabled' : 'no_journal',
      cursors: fullCursors,
    }
  }

  if (!leftSnap || !rightSnap) {
    return {
      usedJournal: false,
      skipReason: 'no_journal',
      cursors: fullCursors,
    }
  }

  const loaded = await loadPairUsnCandidates(job, pair)
  let lastFail: { reason: UsnSkipReason; detail?: string } | undefined

  for (const saved of loaded.candidates) {
    const incremental = await tryIncremental(pair, saved)
    if (incremental.ok) {
      const plan = incremental.plan
      if (loaded.missDetail) plan.skipDetail = loaded.missDetail
      return plan
    }
    lastFail = { reason: incremental.reason, detail: incremental.detail }
  }

  return {
    usedJournal: false,
    skipReason: lastFail?.reason ?? loaded.missReason ?? 'no_cursor',
    skipDetail: lastFail?.detail ?? loaded.missDetail,
    cursors: fullCursors,
  }
}
