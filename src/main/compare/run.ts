import type { BrowserWindow } from 'electron'
import { computeStats, rowMatchesFilter } from '@shared/compare/classify'
import type { CompareFilter, CompareRun, CompareRow } from '@shared/schemas/compare'
import type { JobFile } from '@shared/schemas/job'
import { loadJob } from '../jobs/store'
import { openDb, loadStatesForPair } from '../db/syncState'
import { mergePairRows, walkPair } from '../compare/merge'
import { mergePairRowsTwoWay } from './twoWay'
import { preflightPairUncPaths } from '../remote/preflight'

export type CompareEvent =
  | { type: 'compare:progress'; runId: string; done: number; total: number; currentPath?: string }
  | { type: 'compare:done'; runId: string; stats: CompareRun['stats'] }

const compareRuns = new Map<string, CompareRun>()
const cancelFlags = new Map<string, boolean>()

export function getCompareRun(runId: string): CompareRun | undefined {
  return compareRuns.get(runId)
}

export function cancelCompareRun(runId: string): void {
  cancelFlags.set(runId, true)
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
  cancelFlags.set(runId, false)

  const enabledPairs = job.pairs.filter((p) => p.enabled)
  let pairIndex = 0

  const syncDb = job.variant === 'twoWay' ? await openDb(job.id) : null

  try {
    for (const pair of enabledPairs) {
      if (cancelFlags.get(runId)) break

      await preflightPairUncPaths(pair.left, pair.right)

      const input = await walkPair(
        pair,
        job,
        (_side, currentPath) => {
          emit({
            type: 'compare:progress',
            runId,
            done: pairIndex,
            total: enabledPairs.length,
            currentPath,
          })
        },
        () => cancelFlags.get(runId) === true,
      )

      if (job.variant === 'twoWay' && syncDb) {
        const pairStates = loadStatesForPair(syncDb, pair.id)
        rows.push(...mergePairRowsTwoWay(input, job, pairStates))
      } else {
        rows.push(...mergePairRows(input, job))
      }
      pairIndex++
    }
  } finally {
    if (syncDb) await syncDb.close()
  }

  const run: CompareRun = {
    runId,
    jobId,
    job,
    rows,
    stats: computeStats(rows),
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
  run.stats = computeStats(run.rows)
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
