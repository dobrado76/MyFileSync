import type { BrowserWindow } from 'electron'
import { computeStats, rowMatchesFilter } from '@shared/compare/classify'
import type { CompareFilter, CompareRun, CompareRow } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'
import { loadJob } from '../jobs/store'
import { openDb, loadStatesForPair } from '../db/syncState'
import { getFiles } from '../compare/getFiles'
import { preflightPairUncPaths } from '../remote/preflight'

export type CompareEvent =
  | { type: 'compare:progress'; runId: string; done: number; total: number; currentPath?: string }
  | { type: 'compare:done'; runId: string; stats: CompareRun['stats'] }

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

const compareRuns = new Map<string, CompareRun>()
const cancelFlags = new Map<string, boolean>()
let activeCompareRunId: string | null = null

export function getCompareRun(runId: string): CompareRun | undefined {
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
): Promise<CompareRun> {
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

  const rows: CompareRow[] = []
  let equalCount = 0
  activeCompareRunId = runId
  if (cancelFlags.get(runId) !== true) {
    cancelFlags.set(runId, false)
  }

  const enabledPairs = job.pairs.filter((p) => p.enabled)
  if (enabledPairs.length === 0) {
    throw new Error('No enabled folder pairs. Edit the job and enable at least one pair.')
  }
  for (const pair of enabledPairs) {
    if (!pair.left.trim() || !pair.right.trim()) {
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
        onProgress: (currentPath) => {
          progress.note(currentPath)
        },
        isCancelled: () => cancelFlags.get(runId) === true,
      })

      if (cancelFlags.get(runId)) break

      for (const row of result.rows) {
        rows.push(row)
      }
      equalCount += result.equalCount
      pairIndex++
    }
  } finally {
    progress.stop()
    if (syncDb) await syncDb.close()
    if (activeCompareRunId === runId) activeCompareRunId = null
  }

  const run: CompareRun = {
    runId,
    jobId,
    job,
    rows,
    extraEqual: equalCount,
    stats: computeStats(rows, equalCount),
    cancelled: cancelFlags.get(runId) === true,
    createdAt: Date.now(),
  }

  compareRuns.set(runId, run)
  emit({ type: 'compare:done', runId, stats: run.stats })
  return run
}

export function setRowIncluded(runId: string, rowId: string, included: boolean): boolean {
  const run = compareRuns.get(runId)
  if (!run) return false
  const row = run.rows.find((r) => r.id === rowId)
  if (!row) return false
  row.included = included
  run.stats = computeStats(run.rows, run.extraEqual)
  return true
}

export function getCompareRows(
  runId: string,
  offset: number,
  limit: number,
  filter: CompareFilter = 'all',
): { rows: CompareRow[]; total: number } {
  const run = compareRuns.get(runId)
  if (!run) return { rows: [], total: 0 }

  const filtered = run.rows.filter((row) => rowMatchesFilter(row, filter))
  return {
    rows: filtered.slice(offset, offset + limit),
    total: filtered.length,
  }
}

export function broadcastCompareEvent(window: BrowserWindow | null, event: CompareEvent): void {
  window?.webContents.send('sync:event', event)
}
