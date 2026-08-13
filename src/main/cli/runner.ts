import fs from 'node:fs/promises'
import path from 'node:path'
import { jobSchema, type JobFile } from '@shared/schemas/job'
import { runCompare } from '../compare/run'
import { executeSync } from '../sync/execute'
import {
  openDb,
  persistSyncDb,
  recordRun,
  sideRecordToFileState,
  upsertFileState,
  deleteFileState,
  type SyncDb,
} from '../db/syncState'
import { walkPair } from '../compare/merge'
import type { ComparePairInput } from '../compare/merge'

export type HeadlessRunOptions = {
  compareOnly?: boolean
  onLog?: (line: string) => void
}

export type HeadlessRunResult =
  | { ok: true; compareRunId: string; syncRunId?: string }
  | { ok: false; error: string }

function log(options: HeadlessRunOptions, line: string): void {
  options.onLog?.(line)
  if (!options.onLog) {
    console.log(line)
  }
}

export async function loadJobFromPath(jobPath: string): Promise<JobFile> {
  const raw = await fs.readFile(path.resolve(jobPath), 'utf8')
  return jobSchema.parse(JSON.parse(raw))
}

async function updateSyncStateFromWalk(
  syncDb: SyncDb,
  job: JobFile,
  pairInputs: ComparePairInput[],
  generation: number,
): Promise<void> {
  for (const input of pairInputs) {
    const relPaths = new Set([
      ...input.leftRecords.keys(),
      ...input.rightRecords.keys(),
    ])

    for (const relPath of relPaths) {
      const left = input.leftRecords.get(relPath)
      const right = input.rightRecords.get(relPath)

      if (left) {
        upsertFileState(syncDb, sideRecordToFileState(input.pair.id, 'left', left, generation))
      } else {
        deleteFileState(syncDb, input.pair.id, relPath, 'left')
      }

      if (right) {
        upsertFileState(syncDb, sideRecordToFileState(input.pair.id, 'right', right, generation))
      } else {
        deleteFileState(syncDb, input.pair.id, relPath, 'right')
      }
    }
  }

  recordRun(syncDb, {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    finishedAt: Date.now(),
    generation,
    actionsCounts: {},
    error: null,
  })

  await persistSyncDb(syncDb)
}

export async function runJobHeadless(
  job: JobFile,
  options: HeadlessRunOptions = {},
): Promise<HeadlessRunResult> {
  const runId = crypto.randomUUID()
  log(options, `[${job.name}] Compare started`)

  let compareRun
  try {
    compareRun = await runCompare(runId, job.id, () => undefined, job)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }

  log(
    options,
    `[${job.name}] Compare done: ${compareRun.stats.toSync} actions (${compareRun.stats.total} rows)`,
  )

  if (options.compareOnly) {
    return { ok: true, compareRunId: runId }
  }

  if (compareRun.stats.toSync === 0) {
    log(options, `[${job.name}] Nothing to sync`)
    return { ok: true, compareRunId: runId }
  }

  const syncRunId = crypto.randomUUID()
  log(options, `[${job.name}] Sync started`)

  const summary = await executeSync(syncRunId, job, compareRun.rows, (event) => {
    if (event.type === 'sync:itemDone' && !event.ok) {
      log(options, `[${job.name}] Error: ${event.error ?? 'unknown'}`)
    }
  })

  log(
    options,
    `[${job.name}] Sync done: ${summary.succeeded}/${summary.total} succeeded, ${summary.failed} failed`,
  )

  if (summary.failed > 0 || summary.cancelled) {
    return {
      ok: false,
      error: summary.cancelled ? 'Sync cancelled' : `${summary.failed} action(s) failed`,
    }
  }

  const syncDb = await openDb(job.id)
  try {
    const pairInputs: ComparePairInput[] = []
    for (const pair of job.pairs.filter((p) => p.enabled)) {
      pairInputs.push(await walkPair(pair, job))
    }
    const generation = syncDb.generation + 1
    await updateSyncStateFromWalk(syncDb, job, pairInputs, generation)
  } finally {
    await syncDb.close()
  }

  return { ok: true, compareRunId: runId, syncRunId }
}

export type CliArgs = {
  run?: string
  batch?: string
  compareOnly: boolean
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { compareOnly: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--compare-only') {
      args.compareOnly = true
    } else if (arg === '--run' && argv[i + 1]) {
      args.run = argv[++i]
    } else if (arg === '--batch' && argv[i + 1]) {
      args.batch = argv[++i]
    }
  }

  return args
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseCliArgs(argv)

  if (!args.run && !args.batch) {
    console.error('Usage: MyFileSync --run job.json [--compare-only]')
    console.error('       MyFileSync --batch batch.json [--compare-only]')
    return 1
  }

  const options: HeadlessRunOptions = { compareOnly: args.compareOnly }

  if (args.run) {
    try {
      const job = await loadJobFromPath(args.run)
      const result = await runJobHeadless(job, options)
      return result.ok ? 0 : 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      return 1
    }
  }

  if (args.batch) {
    const { runBatchFile } = await import('../batch/run')
    try {
      const summary = await runBatchFile(args.batch, options)
      for (const r of summary.results) {
        if (r.ok) {
          log(options, `Batch OK: ${r.jobRef}`)
        } else {
          log(options, `Batch FAIL: ${r.jobRef} — ${r.error ?? 'unknown'}`)
        }
      }
      return summary.failed > 0 ? 1 : 0
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(message)
      return 1
    }
  }

  return 1
}
