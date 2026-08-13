import type { BrowserWindow } from 'electron'
import type { CompareFilter, CompareRun, CompareRow, CompareStats, FolderTreeNode } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'
import { loadJob } from '../jobs/store'
import { openDb, loadStatesForPair } from '../db/syncState'
import { getFiles } from '../compare/getFiles'
import {
  CompareRowStore,
  hydrateRowPaths,
  openCompareRowStore,
} from '../compare/rowStore'
import { applyMoveDetection } from '../compare/moveDetect'
import { preflightPairUncPaths } from '../remote/preflight'
import { pathMatchesFolderName, pathMatchesPrefix } from '@shared/compare/folderTree'

export type CompareEvent =
  | { type: 'compare:progress'; runId: string; done: number; total: number; currentPath?: string }
  | { type: 'compare:done'; runId: string; stats: CompareRun['stats'] }

export type ActiveCompareRun = CompareRun & { store: CompareRowStore }

const PROGRESS_INTERVAL_MS = 100

function createCompareProgress(runId: string, emit: (event: CompareEvent) => void) {
  let scanned = 0
  let currentPath = ''
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
      total: 0,
      currentPath,
    })
  }

  return {
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
      flush()
    },
  }
}

const compareRuns = new Map<string, ActiveCompareRun>()
const cancelFlags = new Map<string, boolean>()
let activeCompareRunId: string | null = null

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
  jobOverride?: JobFile,
): Promise<ActiveCompareRun> {
  let job: JobFile
  if (jobOverride) {
    job = jobOverride
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

  const enabledPairs = job.pairs.filter((p) => p.enabled)
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

  let pairIndex = 0

  const syncDb = job.variant === 'twoWay' ? await openDb(job.id) : null
  const progress = createCompareProgress(runId, emit)

  try {
    for (const pair of enabledPairs) {
      if (cancelFlags.get(runId)) break

      await preflightPairUncPaths(pair.left, pair.right)
      progress.message(
        enabledPairs.length > 1
          ? `Pair ${pairIndex + 1} of ${enabledPairs.length}`
          : 'Scanning folders…',
      )

      const pairStates =
        job.variant === 'twoWay' && syncDb ? loadStatesForPair(syncDb, pair.id) : undefined

      const result = await getFiles({
        pair,
        job,
        pairStates,
        onDiff: (row) => store.append(row),
        onProgress: (currentPath) => {
          progress.note(currentPath)
        },
        isCancelled: () => cancelFlags.get(runId) === true,
      })

      if (cancelFlags.get(runId)) break

      store.addEquals(result.equalCount)
      pairIndex++
    }

    if (!cancelFlags.get(runId)) {
      progress.message('Detecting moved files…')
      await store.close()
      await applyMoveDetection(store)
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
  const page = await run.store.getPage(offset, limit, filter, pathPrefix)
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
  return run.store.getFolderTree(filter)
}

export async function dropCompareRows(
  runId: string,
  opts: { pathPrefix?: string; folderName?: string },
): Promise<{ dropped: number; stats: CompareStats } | undefined> {
  const run = compareRuns.get(runId)
  if (!run) return undefined
  const dropped = await run.store.dropMatching((row) => {
    if (opts.folderName) {
      return (
        pathMatchesFolderName(row.relPath, opts.folderName) ||
        pathMatchesFolderName(row.fromRelPath ?? '', opts.folderName)
      )
    }
    const prefix = opts.pathPrefix ?? ''
    return pathMatchesPrefix(row.relPath, prefix) || pathMatchesPrefix(row.fromRelPath ?? '', prefix)
  })
  run.stats = run.store.getStats()
  return { dropped, stats: run.stats }
}

export function broadcastCompareEvent(window: BrowserWindow | null, event: CompareEvent): void {
  window?.webContents.send('sync:event', event)
}
