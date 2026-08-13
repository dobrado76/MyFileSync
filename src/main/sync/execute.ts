import type { BrowserWindow } from 'electron'
import { ok } from '@shared/result'
import type { JobFile } from '@shared/schemas/job'
import type { PlannedAction, SyncProgress, SyncSummary } from '@shared/schemas/compare'
import { rowToPlannedAction } from '../compare/plan'
import type { CompareRowStore } from '../compare/rowStore'
import { copyEntry, copyStreamsOnly, createEntry, deleteEntry, type CopyOptions } from './copy'
import { resolvePairRoot, versionBeforeMutation } from './versioning'

export type SyncRunState = {
  syncRunId: string
  jobId: string
  cancelled: boolean
  progress: SyncProgress
}

export type SyncEventEmitter = (event: SyncEvent) => void

export type SyncEvent =
  | { type: 'sync:progress'; syncRunId: string; progress: SyncProgress }
  | { type: 'sync:itemDone'; syncRunId: string; rowId: string; ok: boolean; error?: string }
  | { type: 'sync:done'; syncRunId: string; summary: SyncSummary }

const activeRuns = new Map<string, SyncRunState>()

export function getSyncRun(syncRunId: string): SyncRunState | undefined {
  return activeRuns.get(syncRunId)
}

export function cancelSyncRun(syncRunId: string): void {
  const run = activeRuns.get(syncRunId)
  if (run) run.cancelled = true
}

export async function executeSync(
  syncRunId: string,
  job: JobFile,
  store: CompareRowStore,
  emit: SyncEventEmitter,
): Promise<SyncSummary> {
  const total = store.getStats().toSync
  const state: SyncRunState = {
    syncRunId,
    jobId: job.id,
    cancelled: false,
    progress: {
      phase: 'preparing',
      done: 0,
      total,
      errors: 0,
    },
  }
  activeRuns.set(syncRunId, state)

  let succeeded = 0
  let failed = 0

  const copyOptions = (): CopyOptions => ({
    excludeStreams: job.ads.excludeStreams,
    verifyAfterCopy: job.behavior.verifyAfterCopy,
    hashAlgorithm: job.compare.contentHash === 'sha256' ? 'sha256' : 'md5',
    vssEnabled: job.vss.enabled,
    filters: job.filters,
    onProgress: (current) => {
      state.progress.currentPath = current
      emit({ type: 'sync:progress', syncRunId, progress: { ...state.progress } })
    },
  })

  for await (const row of store.iterateIncluded()) {
    if (state.cancelled) break

    const action = rowToPlannedAction(row, job, job.pairs)
    if (!action) continue

    const pair = job.pairs.find((p) => p.id === action.pairId)
    const options = copyOptions()
    if (pair) {
      options.filterRoot =
        action.direction === 'rightToLeft' ? pair.right : pair.left
    }

    state.progress.currentPath = action.relPath
    state.progress.phase = action.action === 'Delete' ? 'deleting' : 'copying'
    emit({ type: 'sync:progress', syncRunId, progress: { ...state.progress } })

    const result = await runAction(action, job, options)
    state.progress.done++
    if (result.ok) {
      succeeded++
      emit({ type: 'sync:itemDone', syncRunId, rowId: action.rowId, ok: true })
    } else {
      failed++
      state.progress.errors++
      emit({
        type: 'sync:itemDone',
        syncRunId,
        rowId: action.rowId,
        ok: false,
        error: result.error.message,
      })
    }
    emit({ type: 'sync:progress', syncRunId, progress: { ...state.progress } })
  }

  state.progress.phase = state.cancelled ? 'cancelled' : 'done'
  const summary: SyncSummary = {
    done: state.progress.done,
    total: state.progress.total,
    succeeded,
    failed,
    cancelled: state.cancelled,
  }
  emit({ type: 'sync:done', syncRunId, summary })
  activeRuns.delete(syncRunId)
  return summary
}

async function runAction(action: PlannedAction, job: JobFile, copyOptions: CopyOptions) {
  switch (action.action) {
    case 'Create':
      return createEntry(action, copyOptions)
    case 'Update': {
      if (action.destPath) {
        const pairRoot = resolvePairRoot(action.pairId, action.destPath, job)
        if (pairRoot) {
          const versioned = await versionBeforeMutation(action.destPath, pairRoot, job)
          if (!versioned.ok) return versioned
        }
      }
      return copyEntry(action, copyOptions)
    }
    case 'UpdateStreamsOnly': {
      if (action.destPath) {
        const pairRoot = resolvePairRoot(action.pairId, action.destPath, job)
        if (pairRoot) {
          const versioned = await versionBeforeMutation(action.destPath, pairRoot, job)
          if (!versioned.ok) return versioned
        }
      }
      return copyStreamsOnly(action)
    }
    case 'Delete': {
      if (!action.destPath) return copyEntry(action, copyOptions)
      const pairRoot = resolvePairRoot(action.pairId, action.destPath, job)
      if (pairRoot) {
        const versioned = await versionBeforeMutation(action.destPath, pairRoot, job)
        if (!versioned.ok) return versioned
      }
      return deleteEntry(action.destPath, action.isDir, job.delete.useRecycleBin)
    }
    default:
      return ok(undefined)
  }
}

export function broadcastSyncEvent(window: BrowserWindow | null, event: SyncEvent): void {
  window?.webContents.send('sync:event', event)
}
