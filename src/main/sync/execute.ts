import type { BrowserWindow } from 'electron'
import { ok } from '@shared/result'
import { adsIgnoredStreamNames } from '@shared/compare/classify'
import { pairComparesAds, type JobFile } from '@shared/schemas/job'
import type { PlannedAction, SyncFailure, SyncProgress, SyncSummary } from '@shared/schemas/compare'
import { rowToPlannedAction } from '../compare/plan'
import type { CompareRowStore } from '../compare/rowStore'
import { copyEntry, copyStreamsOnly, createEntry, deleteEntry, moveEntry, type CopyOptions } from './copy'
import { requestCopyAbort, clearCopyAbort, isCopyAborted } from '../win32/copy'
import { yieldToEventLoop } from '../win32/nativeLock'
import { resolvePairRoot, versionBeforeMutation } from './versioning'
import { rowMatchesTreePath } from '@shared/compare/folderTree'
import { sortSyncActions } from '@shared/sync/order'
import { runWithConcurrency } from '@shared/sync/pool'
import { syncProgressPath } from '@shared/sync/progressPath'
import { persistUsnAfterSync } from '../compare/usnState'
import { assertEnabledPairRootsReady } from '../compare/pairRoots'

export type SyncRunState = {
  syncRunId: string
  jobId: string
  cancelled: boolean
  progress: SyncProgress
}

export type SyncEventEmitter = (event: SyncEvent) => void

export type SyncEvent =
  | { type: 'sync:progress'; syncRunId: string; progress: SyncProgress }
  | {
      type: 'sync:itemDone'
      syncRunId: string
      rowId: string
      ok: boolean
      error?: string
      hint?: string
      code?: SyncFailure['code']
    }
  | { type: 'sync:done'; syncRunId: string; summary: SyncSummary }

const activeRuns = new Map<string, SyncRunState>()
const PROGRESS_INTERVAL_MS = 100
let cancelAllPending = false

export function getSyncRun(syncRunId: string): SyncRunState | undefined {
  return activeRuns.get(syncRunId)
}

export function cancelSyncRun(syncRunId?: string): void {
  requestCopyAbort()
  if (syncRunId) {
    const run = activeRuns.get(syncRunId)
    if (run) run.cancelled = true
    else cancelAllPending = true
    return
  }
  cancelAllPending = true
  for (const run of activeRuns.values()) {
    run.cancelled = true
  }
}

function createSyncProgress(syncRunId: string, state: SyncRunState, emit: SyncEventEmitter) {
  let lastEmitAt = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    lastEmitAt = Date.now()
    emit({ type: 'sync:progress', syncRunId, progress: { ...state.progress } })
  }

  return {
    note(relPath: string, phase: SyncProgress['phase']): void {
      state.progress.currentPath = relPath
      state.progress.phase = phase
      const now = Date.now()
      if (now - lastEmitAt >= PROGRESS_INTERVAL_MS) {
        flush()
        return
      }
      if (!timer) {
        timer = setTimeout(flush, PROGRESS_INTERVAL_MS - (now - lastEmitAt))
      }
    },
    flush,
  }
}

export async function executeSync(
  syncRunId: string,
  job: JobFile,
  store: CompareRowStore,
  emit: SyncEventEmitter,
  pathPrefix = '',
  rowIds?: readonly string[],
): Promise<SyncSummary> {
  const rowIdFilter = rowIds && rowIds.length > 0 ? new Set(rowIds) : null
  const ignored = adsIgnoredStreamNames(job)
  const state: SyncRunState = {
    syncRunId,
    jobId: job.id,
    cancelled: cancelAllPending,
    progress: {
      phase: 'preparing',
      done: 0,
      total: 0,
      bytesDone: 0,
      bytesTotal: 0,
      errors: 0,
    },
  }
  cancelAllPending = false
  activeRuns.set(syncRunId, state)
  if (!state.cancelled) clearCopyAbort()
  if (!rowIdFilter) store.clearSyncErrors()

  const roots = await assertEnabledPairRootsReady(job)
  if (!roots.ok) {
    const failure: SyncFailure = {
      rowId: '',
      relPath: '',
      action: 'Create',
      code: roots.error.code === 'not-allowed' ? 'not-allowed' : 'not-found',
      message: roots.error.message,
      hint: roots.error.hint,
    }
    const summary: SyncSummary = {
      done: 0,
      total: 0,
      succeeded: 0,
      failed: 1,
      cancelled: false,
      failures: [failure],
    }
    emit({ type: 'sync:done', syncRunId, summary })
    activeRuns.delete(syncRunId)
    return summary
  }

  let succeeded = 0
  let failed = 0
  const failures: SyncFailure[] = []
  const progress = createSyncProgress(syncRunId, state, emit)

  const ensuredDirs = new Set<string>()
  const copyOptions = (): CopyOptions => ({
    excludeStreams: ignored === 'all' ? [] : [...ignored],
    deleteExtraStreams: job.variant === 'mirror',
    verifyAfterCopy: job.behavior.verifyAfterCopy,
    hashAlgorithm: job.compare.contentHash === 'sha256' ? 'sha256' : 'md5',
    vssEnabled: job.vss.enabled,
    filters: job.filters,
    ensuredDirs,
    onProgress: (current) => progress.note(current, 'copying'),
    isCancelled: () => state.cancelled || isCopyAborted(),
  })

  const actions: PlannedAction[] = []
  const multiPair = job.pairs.filter((p) => p.enabled).length > 1

  let planned = 0
  const succeededIds = new Set<string>()
  for await (const row of store.iterateIncluded()) {
    if (state.cancelled || isCopyAborted()) {
      state.cancelled = true
      break
    }
    if (pathPrefix && !rowMatchesTreePath(row, pathPrefix, multiPair)) {
      continue
    }
    if (rowIdFilter && !rowIdFilter.has(row.id)) continue
    const action = rowToPlannedAction(row, job, job.pairs)
    if (!action) continue
    actions.push(action)
    planned++
    if (planned % 20 === 0) await yieldToEventLoop()
  }

  sortSyncActions(actions)
  state.progress.total = actions.length
  state.progress.bytesTotal = actions.reduce((sum, action) => sum + action.workBytes, 0)
  state.progress.bytesDone = 0

  let lastYieldAt = Date.now()
  async function runOne(action: PlannedAction, phase: SyncProgress['phase']): Promise<void> {
    const now = Date.now()
    if (now - lastYieldAt >= 75) {
      lastYieldAt = now
      await yieldToEventLoop()
    }
    if (state.cancelled || isCopyAborted()) {
      state.cancelled = true
      return
    }

    const pair = job.pairs.find((p) => p.id === action.pairId)
    const options = copyOptions()
    if (pair) {
      options.filterRoot = action.direction === 'rightToLeft' ? pair.right : pair.left
      options.copyAds = pairComparesAds(pair)
    }
    if (action.action === 'Create' && !action.isDir) {
      options.destLikelyMissing = true
    }

    progress.note(syncProgressPath(action), phase)

    const result = await runAction(action, job, options)
    if (!result.ok && result.error.code === 'cancelled') {
      state.cancelled = true
      return
    }
    state.progress.done++
    state.progress.bytesDone = (state.progress.bytesDone ?? 0) + action.workBytes
    if (result.ok) {
      succeeded++
      succeededIds.add(action.rowId)
      store.clearSyncError(action.rowId)
    } else {
      failed++
      state.progress.errors++
      store.markSyncError(action.rowId)
      const failure: SyncFailure = {
        rowId: action.rowId,
        relPath: action.relPath,
        action: action.action,
        targetPath: action.destPath ?? action.sourcePath,
        code: result.error.code,
        message: result.error.message,
        hint: result.error.hint,
      }
      failures.push(failure)
      emit({
        type: 'sync:itemDone',
        syncRunId,
        rowId: action.rowId,
        ok: false,
        error: result.error.message,
        hint: result.error.hint,
        code: result.error.code,
      })
    }
    if (state.cancelled || isCopyAborted()) state.cancelled = true
  }

  const isCancelled = () => state.cancelled || isCopyAborted()
  const moves = actions.filter((action) => action.action === 'Move' || action.action === 'Rename')
  const copies = actions.filter(
    (action) => action.action !== 'Move' && action.action !== 'Rename' && action.action !== 'Delete',
  )
  const deletes = actions.filter((action) => action.action === 'Delete')
  const copyConcurrency = Math.max(1, job.parallelism.copyPerDevice)

  await runWithConcurrency(moves, 1, isCancelled, (action) => runOne(action, 'copying'))
  await runWithConcurrency(copies, copyConcurrency, isCancelled, (action) => runOne(action, 'copying'))
  await runWithConcurrency(deletes, 1, isCancelled, (action) => runOne(action, 'deleting'))

  progress.flush()

  if (succeededIds.size > 0) {
    await store.applyReplacements(succeededIds, new Map())
  }
  if (!state.cancelled) {
    await persistUsnAfterSync(job, store).catch(() => undefined)
  }

  state.progress.phase = state.cancelled ? 'cancelled' : 'done'
  const summary: SyncSummary = {
    done: state.progress.done,
    total: state.progress.total,
    succeeded,
    failed,
    cancelled: state.cancelled,
    failures,
    stats: store.getStats(),
  }
  emit({ type: 'sync:done', syncRunId, summary })
  activeRuns.delete(syncRunId)
  return summary
}

async function runAction(action: PlannedAction, job: JobFile, copyOptions: CopyOptions) {
  switch (action.action) {
    case 'Move':
    case 'Rename':
      return moveEntry(action)
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
      const pair = job.pairs.find((p) => p.id === action.pairId)
      if (pair && !pairComparesAds(pair)) return ok(undefined)
      if (!job.ads.syncAllStreams) return ok(undefined)
      if (action.destPath) {
        const pairRoot = resolvePairRoot(action.pairId, action.destPath, job)
        if (pairRoot) {
          const versioned = await versionBeforeMutation(action.destPath, pairRoot, job)
          if (!versioned.ok) return versioned
        }
      }
      return copyStreamsOnly(action, copyOptions)
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
