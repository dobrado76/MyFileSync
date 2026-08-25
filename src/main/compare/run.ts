import type { BrowserWindow } from 'electron'
import type { CompareFilter, CompareRun, CompareRow, CompareStats, FolderTreeNode } from '@shared/schemas/compare'
import { z } from 'zod'
import { enabledJobPairs, jobSchema, type JobFile, type JobPair } from '@shared/schemas/job'
import { loadJob } from '../jobs/store'
import { openDb, loadStatesForPair, type PairFileStates } from '../db/syncState'
import { enumerateFiles, getFiles, type EnumerateResult } from '../compare/getFiles'
import { planPairUsn } from '../compare/usnWalk'
import { compareUsnFilterKey, usnSkipReasonLabel } from '@shared/compare/usnPlan'
import { persistUsnAfterCompare, snapshotPairCursors, outstandingRelPaths, type PersistedUsnPair } from '../compare/usnState'
import {
  CompareRowStore,
  hydrateRowPaths,
  openCompareRowStore,
} from '../compare/rowStore'
import { applyMoveDetection } from '../compare/moveDetect'
import { preflightPairUncPaths } from '../remote/preflight'
import { assertEnabledPairRootsReady } from '../compare/pairRoots'
import {
  isMultiPairTree,
  pairLabelFromLeftPath,
  pathMatchesFolderName,
  rowMatchesTreePath,
  type PairTreeLabel,
} from '@shared/compare/folderTree'

export type CompareProgressPhase = 'enumerating' | 'comparing'

export type CompareEvent =
  | {
      type: 'compare:progress'
      runId: string
      done: number
      total: number
      currentPath?: string
      phase?: CompareProgressPhase
      /** Shown in the window title; not overwritten by per-file progress paths. */
      titleNote?: string
    }
  | { type: 'compare:done'; runId: string; stats: CompareRun['stats'] }

export type ActiveCompareRun = CompareRun & { store: CompareRowStore }

const PROGRESS_INTERVAL_MS = 100

function createCompareProgress(runId: string, emit: (event: CompareEvent) => void) {
  let scanned = 0
  let total = 0
  let phase: CompareProgressPhase = 'enumerating'
  let currentPath = ''
  let titleNote = ''
  let lastEmitAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    lastEmitAt = Date.now()
    emit({
      type: 'compare:progress',
      runId,
      done: scanned,
      total,
      currentPath,
      phase,
      titleNote: titleNote || undefined,
    })
  }

  return {
    beginEnumerate(): void {
      phase = 'enumerating'
      scanned = 0
      total = 0
      currentPath = 'Enumerating…'
      titleNote = 'Enumerating'
      flush()
    },
    beginCompare(itemTotal: number): void {
      phase = 'comparing'
      scanned = 0
      total = itemTotal
      currentPath = 'Comparing…'
      titleNote = 'Comparing'
      flush()
    },
    setTitleNote(note: string): void {
      titleNote = note
      flush()
    },
    note(relPath: string): void {
      scanned++
      currentPath = relPath
      const now = Date.now()
      if (now - lastEmitAt >= PROGRESS_INTERVAL_MS) {
        flush()
        return
      }
      if (!timer) {
        timer = setTimeout(flush, PROGRESS_INTERVAL_MS - (now - lastEmitAt))
      }
    },
    message(text: string): void {
      currentPath = text
      flush()
    },
    stop(): void {
      titleNote = ''
      flush()
    },
  }
}

const compareRuns = new Map<string, ActiveCompareRun>()
const cancelFlags = new Map<string, boolean>()
let activeCompareRunId: string | null = null

function enumerateTitleNote(
  pairIndex: number,
  pairCount: number,
  pairLabel: string,
  usedJournal: boolean,
  skipReason?: Parameters<typeof usnSkipReasonLabel>[0],
  skipDetail?: string,
): string {
  const who =
    pairCount > 1 ? `Pair ${pairIndex + 1}/${pairCount} (${pairLabel})` : pairLabel
  if (usedJournal) {
    const settingsHint =
      skipDetail && skipDetail.includes('compare settings changed') ? ` — ${skipDetail}` : ''
    return `${who} · change journal${settingsHint}`
  }
  const why = usnSkipReasonLabel(skipReason ?? 'no_cursor', skipDetail)
  const detail = skipDetail && !why.includes(skipDetail) ? `${why} (${skipDetail})` : why
  return `${who} · full walk — ${detail}`
}

function pairLabelsForJob(job: JobFile): PairTreeLabel[] {
  return enabledJobPairs(job).map((p) => ({ pairId: p.id, label: pairLabelFromLeftPath(p.left) }))
}

export function getCompareRun(runId: string): ActiveCompareRun | undefined {
  return compareRuns.get(runId)
}

export function cancelCompareRun(runId?: string): void {
  if (runId) {
    cancelFlags.set(runId, true)
    return
  }
  if (activeCompareRunId) cancelFlags.set(activeCompareRunId, true)
  for (const id of [...cancelFlags.keys()]) {
    cancelFlags.set(id, true)
  }
}

export async function runCompare(
  runId: string,
  jobId: string,
  emit: (event: CompareEvent) => void,
  jobOverride?: z.input<typeof jobSchema>,
): Promise<ActiveCompareRun> {
  let job: JobFile
  if (jobOverride) {
    job = jobSchema.parse(jobOverride)
  } else {
    const jobResult = await loadJob(jobId)
    if (!jobResult.ok) {
      throw new Error(jobResult.error.message)
    }
    job = jobResult.value
  }

  const previous = [...compareRuns.values()]
  for (const prior of previous) {
    await prior.store.dispose().catch(() => undefined)
  }
  compareRuns.clear()

  const store = await openCompareRowStore(runId)
  activeCompareRunId = runId
  if (cancelFlags.get(runId) !== true) {
    cancelFlags.set(runId, false)
  }

  const enabledPairs = enabledJobPairs(job)
  if (enabledPairs.length === 0) {
    await store.dispose()
    throw new Error('No enabled folder pairs. Edit the job and enable at least one pair.')
  }
  for (const pair of enabledPairs) {
    if (!pair.left.trim() || !pair.right.trim()) {
      await store.dispose()
      throw new Error('Folder paths are not set. Edit the job and choose left and right folders.')
    }
  }
  const roots = await assertEnabledPairRootsReady(job)
  if (!roots.ok) {
    await store.dispose()
    throw new Error(
      roots.error.hint ? `${roots.error.message} ${roots.error.hint}` : roots.error.message,
    )
  }

  const pairUsnCursors: Record<string, PersistedUsnPair> = {}

  const syncDb = job.variant === 'twoWay' ? await openDb(job.id) : null
  const progress = createCompareProgress(runId, emit)

  type PairPrep = {
    pair: JobPair
    pairStates?: PairFileStates
    usnPlan: Awaited<ReturnType<typeof planPairUsn>>
    listing: EnumerateResult
  }

  try {
    const preps: PairPrep[] = []
    progress.beginEnumerate()
    let pairIndex = 0
    for (const pair of enabledPairs) {
      if (cancelFlags.get(runId)) break

      await preflightPairUncPaths(pair.left, pair.right)
      const pairStates =
        job.variant === 'twoWay' && syncDb ? loadStatesForPair(syncDb, pair.id) : undefined

      const usnPlan = await planPairUsn(job, pair)
      progress.setTitleNote(
        enumerateTitleNote(
          pairIndex,
          enabledPairs.length,
          pairLabelFromLeftPath(pair.left),
          usnPlan.usedJournal,
          usnPlan.skipReason,
          usnPlan.skipDetail,
        ),
      )

      const listing = await enumerateFiles({
        pair,
        job,
        onProgress: (currentPath) => {
          progress.note(currentPath)
        },
        isCancelled: () => cancelFlags.get(runId) === true,
        skipSubtree: usnPlan.skipSubtree,
      })
      if (cancelFlags.get(runId)) break
      preps.push({ pair, pairStates, usnPlan, listing })
      pairIndex++
    }

    if (!cancelFlags.get(runId)) {
      const itemTotal = preps.reduce((sum, prep) => sum + prep.listing.total, 0)
      progress.beginCompare(itemTotal)
      pairIndex = 0
      for (const prep of preps) {
        if (cancelFlags.get(runId)) break
        if (enabledPairs.length > 1) {
          progress.setTitleNote(`Comparing pair ${pairIndex + 1} of ${enabledPairs.length}`)
        }
        const result = await getFiles({
          pair: prep.pair,
          job,
          pairStates: prep.pairStates,
          listingCache: prep.listing.cache,
          onDiff: (row) => store.append(row),
          onProgress: (currentPath) => {
            progress.note(currentPath)
          },
          isCancelled: () => cancelFlags.get(runId) === true,
          skipSubtree: prep.usnPlan.skipSubtree,
        })
        if (prep.usnPlan.cursors) pairUsnCursors[prep.pair.id] = prep.usnPlan.cursors
        store.addEquals(result.equalCount)
        prep.listing.cache.dirs.clear()
        if (cancelFlags.get(runId)) break
        pairIndex++
      }
    }

    if (!cancelFlags.get(runId)) {
      progress.message('Detecting moved files…')
      await store.close()
      await applyMoveDetection(store)
      if (Object.keys(pairUsnCursors).length > 0 || preps.length > 0) {
        const toPersist: Record<string, PersistedUsnPair> = { ...pairUsnCursors }
        for (const prep of preps) {
          if (toPersist[prep.pair.id]) continue
          const snap = await snapshotPairCursors(
            prep.pair,
            outstandingRelPaths(store, prep.pair.id),
          )
          if (snap) toPersist[prep.pair.id] = snap
        }
        if (Object.keys(toPersist).length > 0) {
          await persistUsnAfterCompare(job, store, toPersist, compareUsnFilterKey(job))
        }
      }
    }
  } finally {
    progress.stop()
    if (syncDb) await syncDb.close()
    if (activeCompareRunId === runId) activeCompareRunId = null
    await store.close()
  }

  const run: ActiveCompareRun = {
    runId,
    jobId,
    job,
    extraEqual: store.getStats().equal,
    stats: store.getStats(),
    cancelled: cancelFlags.get(runId) === true,
    createdAt: Date.now(),
    store,
  }

  compareRuns.set(runId, run)
  emit({ type: 'compare:done', runId, stats: run.stats })
  return run
}

export function setRowIncluded(runId: string, rowId: string, included: boolean): boolean {
  const run = compareRuns.get(runId)
  if (!run) return false
  const ok = run.store.setIncluded(rowId, included)
  if (ok) run.stats = run.store.getStats()
  return ok
}

export async function getCompareRows(
  runId: string,
  offset: number,
  limit: number,
  filter: CompareFilter = 'all',
  pathPrefix = '',
): Promise<{ rows: CompareRow[]; total: number }> {
  const run = compareRuns.get(runId)
  if (!run) return { rows: [], total: 0 }
  const page = await run.store.getPage(offset, limit, filter, pathPrefix, pairLabelsForJob(run.job))
  return {
    rows: page.rows.map((row) => hydrateRowPaths(row, run.job)),
    total: page.total,
  }
}

export async function getCompareFolderTree(
  runId: string,
  filter: CompareFilter = 'all',
): Promise<FolderTreeNode> {
  const run = compareRuns.get(runId)
  if (!run) {
    return { path: '', name: '', count: 0, creates: 0, updates: 0, deletes: 0, moves: 0, children: [] }
  }
  return run.store.getFolderTree(filter, pairLabelsForJob(run.job))
}

export async function dropCompareRows(
  runId: string,
  opts: { pathPrefix?: string; folderName?: string },
): Promise<{ dropped: number; stats: CompareStats } | undefined> {
  const run = compareRuns.get(runId)
  if (!run) return undefined
  const labels = pairLabelsForJob(run.job)
  const multiPair = isMultiPairTree(labels)
  const dropped = await run.store.dropMatching((row) => {
    if (opts.folderName) {
      return (
        pathMatchesFolderName(row.relPath, opts.folderName) ||
        pathMatchesFolderName(row.fromRelPath ?? '', opts.folderName)
      )
    }
    const prefix = opts.pathPrefix ?? ''
    return rowMatchesTreePath(row, prefix, multiPair)
  })
  run.stats = run.store.getStats()
  return { dropped, stats: run.stats }
}

export function broadcastCompareEvent(window: BrowserWindow | null, event: CompareEvent): void {
  window?.webContents.send('sync:event', event)
}
