import { create } from 'zustand'
import { createDefaultJob, type JobFile, type JobSummary } from '@shared/schemas/job'
import type { CompareFilter, CompareRow, CompareStats, FolderTreeNode, SyncFailure, SyncProgress } from '@shared/schemas/compare'
import { appendSample, chartSampleBudget, DEFAULT_SAMPLE_BUDGET, type ProgressSample } from '@shared/progress/series'
import type { SyncEvent } from '@shared/ipc/api'
import { formatDisplayVersion } from '@shared/version'
import { parsePairTreePath } from '@shared/compare/folderTree'
import { excludeFolderNameRule, excludeThisFolderRule } from '@shared/compare/filters'
import type { MainTab } from '../components/BackupMirrorWorkbench'
import type { TreeFolderAction } from '../components/CompareFolderTree'
import { resetAppWindowTitle, setAppWindowTitle } from '../windowTitle'

export type LogEntry = {
  id: string
  time: string
  message: string
  level: 'info' | 'error' | 'success'
}

function formatCompareStatus(stats: CompareStats): string {
  const parts = [`Compared ${stats.total} items`, `${stats.toSync} to sync`]
  if (stats.moves > 0) parts.push(`${stats.moves} moved`)
  return parts.join(' · ')
}

function formatSyncStatus(progress: SyncProgress): string {
  const verb =
    progress.phase === 'deleting' ? 'Deleting' : progress.phase === 'copying' ? 'Copying' : 'Syncing'
  const counts = `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
  const path = progress.currentPath?.trim()
  return path ? `${verb} ${counts} · ${path}` : `${verb} ${counts}`
}

export function isJobConfigLocked(compareBusy: boolean, syncBusy: boolean): boolean {
  return compareBusy || syncBusy
}

/** @deprecated use isJobConfigLocked */
export function isJobSwitchLocked(compareBusy: boolean, syncBusy: boolean): boolean {
  return isJobConfigLocked(compareBusy, syncBusy)
}

const JOB_CONFIG_LOCKED_HINT = 'Finish or cancel compare/sync before changing the job.'

async function persistActiveJobQuiet(
  getState: () => { activeJob: JobFile | null },
  setState: (partial: { statusText: string }) => void,
): Promise<boolean> {
  const job = getState().activeJob
  if (!job) return false
  const saved = await window.myFileSync.jobSave({ job })
  if (!saved.ok) {
    setState({ statusText: saved.error.message })
    return false
  }
  return true
}

let syncDoneResolve: ((summary: import('@shared/schemas/compare').SyncSummary) => void) | null = null

function waitForSyncDone(): Promise<import('@shared/schemas/compare').SyncSummary> {
  return new Promise((resolve) => {
    syncDoneResolve = resolve
  })
}

function mergeRetriedFailures(
  current: SyncFailure[],
  retriedRowIds: readonly string[],
  summary: import('@shared/schemas/compare').SyncSummary,
): SyncFailure[] {
  const failedByRow = new Map(summary.failures.map((f) => [f.rowId, f]))
  let next = [...current]
  for (const rowId of retriedRowIds) {
    const stillFailed = failedByRow.get(rowId)
    if (stillFailed) {
      const idx = next.findIndex((f) => f.rowId === rowId)
      if (idx >= 0) next[idx] = stillFailed
      else next.push(stillFailed)
    } else {
      next = next.filter((f) => f.rowId !== rowId)
    }
  }
  return next
}

const EMPTY_COMPARE_VIEW = {
  compareRows: [] as CompareRow[],
  compareRowOffset: 0,
  compareRowTotal: 0,
  compareFolderTree: null as FolderTreeNode | null,
  comparePathPrefix: '',
  selectedRow: null as CompareRow | null,
}

const GRID_WINDOW = 80

async function loadCompareRows(
  runId: string,
  filter: CompareFilter,
  pathPrefix: string,
  offset = 0,
  limit = GRID_WINDOW,
): Promise<{ rows: CompareRow[]; total: number; offset: number }> {
  const page = await window.myFileSync.compareGetRows({
    runId,
    offset,
    limit: Math.min(5000, Math.max(20, limit)),
    filter,
    pathPrefix,
  })
  if (!page.ok) return { rows: [], total: 0, offset }
  return { rows: page.value.rows, total: page.value.total, offset }
}

function comparePagePatch(page: { rows: CompareRow[]; total: number; offset: number }) {
  return {
    compareRows: page.rows,
    compareRowOffset: page.offset,
    compareRowTotal: page.total,
  }
}

async function loadCompareTree(runId: string, filter: CompareFilter): Promise<FolderTreeNode | null> {
  const tree = await window.myFileSync.compareGetTree({ runId, filter })
  return tree.ok ? tree.value.root : null
}

type WorkbenchState = {
  initialized: boolean
  appVersion: string
  jobs: JobSummary[]
  activeJobId: string | null
  activeJob: JobFile | null
  activePairIndex: number
  mainTab: MainTab
  compareRunId: string | null
  compareStats: CompareStats | null
  compareRows: CompareRow[]
  compareRowOffset: number
  compareRowTotal: number
  compareFolderTree: FolderTreeNode | null
  comparePathPrefix: string
  compareFilter: CompareFilter
  compareBusy: boolean
  compareProgress: {
    done: number
    total: number
    currentPath?: string
    phase?: 'enumerating' | 'comparing'
  } | null
  syncRunId: string | null
  syncProgress: SyncProgress | null
  syncBusy: boolean
  progressUiExpanded: boolean
  progressStartedAt: number | null
  progressSamples: ProgressSample[]
  /** Compact budget: ≥ one sample per physical plot pixel, plus a dense rate tail. */
  progressSampleBudget: number
  statusText: string
  logs: LogEntry[]
  showDeleteConfirm: boolean
  pendingSyncPrefix: string
  pendingSyncDeletes: number
  updatesFolder: string
  updatesStatus: string
  hardwareAcceleration: boolean
  confirmMirrorDeletes: boolean
  pendingUpdate: { latestVersion: string; installerPath: string; currentVersion: string } | null
  updateDismissed: boolean
  selectedRow: import('@shared/schemas/compare').CompareRow | null
  settingsOpen: boolean
  compareCancelled: boolean
  syncCancelling: boolean
  busy: boolean
  syncFailures: SyncFailure[]
  showSyncFailures: boolean
  syncSucceededCount: number
  syncQueued: boolean
  failureFixRowId: string | null
  failureFixStatus: string | null
  partialRetryRowIds: string[] | null

  init: () => Promise<void>
  refreshJobs: () => Promise<void>
  selectJob: (id: string) => Promise<void>
  newJob: () => Promise<void>
  saveActiveJob: () => Promise<void>
  deleteActiveJob: () => Promise<void>
  importIni: () => Promise<void>
  importJobFile: () => Promise<void>
  exportJobFfs: () => Promise<void>
  finishImport: (filePath: string, kind: 'ffs' | 'ini' | 'json') => Promise<void>
  loadJobFile: () => Promise<void>
  updateActiveJob: (patch: Partial<JobFile>) => void
  setMainTab: (tab: MainTab) => void
  setActivePairIndex: (index: number) => void
  addPair: () => void
  removePair: (index: number) => void
  movePair: (index: number, direction: -1 | 1) => void
  flipPair: (index: number) => void
  setPairPath: (index: number, side: 'left' | 'right', path: string) => void
  setPairEnabled: (index: number, enabled: boolean) => void
  setPairAds: (index: number, ads: boolean) => void
  setPairListHeight: (height: number, persist?: boolean) => void
  clearCompareList: () => void
  browsePairPath: (index: number, side: 'left' | 'right') => Promise<void>
  cancelOperation: () => Promise<void>
  runCompare: () => Promise<void>
  runSync: () => Promise<void>
  confirmSync: (dontShowAgain?: boolean) => Promise<void>
  cancelSyncConfirm: () => void
  startSyncIfQueued: (stats: CompareStats) => Promise<void>
  setCompareFilter: (filter: CompareFilter) => Promise<void>
  selectCompareFolder: (pathPrefix: string) => Promise<void>
  loadCompareWindow: (offset: number, limit: number) => Promise<void>
  handleFolderAction: (action: TreeFolderAction, path: string, deletes: number) => Promise<void>
  toggleRowIncluded: (rowId: string, included: boolean) => Promise<void>
  browseUpdatesFolder: () => Promise<void>
  setUpdatesFolder: (path: string) => void
  setHardwareAcceleration: (enabled: boolean) => void
  setConfirmMirrorDeletes: (enabled: boolean) => void
  setProgressUiExpanded: (expanded: boolean) => void
  setProgressChartPixels: (plotPhysicalPx: number) => void
  checkForUpdates: () => Promise<void>
  runUpdate: () => Promise<void>
  dismissUpdate: () => void
  exportSettings: () => Promise<void>
  importSettings: () => Promise<void>
  selectRow: (row: import('@shared/schemas/compare').CompareRow | null) => void
  openSettings: () => void
  closeSettings: () => void
  handleSyncEvent: (event: SyncEvent) => void
  catchUpProgressSample: () => void
  dismissSyncFailures: () => void
  retryFailedSync: () => Promise<void>
  retrySyncRows: (rowIds: string[]) => Promise<void>
  viewSyncErrorsInGrid: () => Promise<void>
  showFailureInFolder: (path: string) => Promise<void>
  openDiskPath: (path: string) => Promise<void>
  revealDiskPath: (path: string) => Promise<void>
  clearFailureReadOnly: (failure: SyncFailure) => Promise<void>
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  initialized: false,
  appVersion: '0.0.0',
  jobs: [],
  activeJobId: null,
  activeJob: null,
  activePairIndex: 0,
  mainTab: 'options',
  compareRunId: null,
  compareStats: null,
  compareRows: [],
  compareRowOffset: 0,
  compareRowTotal: 0,
  compareFolderTree: null,
  comparePathPrefix: '',
  compareFilter: 'all',
  compareBusy: false,
  compareProgress: null,
  syncRunId: null,
  syncProgress: null,
  syncBusy: false,
  statusText: 'Starting…',
  logs: [],
  showDeleteConfirm: false,
  pendingSyncPrefix: '',
  pendingSyncDeletes: 0,
  updatesFolder: '',
  updatesStatus: '',
  hardwareAcceleration: true,
  confirmMirrorDeletes: true,
  progressUiExpanded: true,
  progressStartedAt: null,
  progressSamples: [],
  progressSampleBudget: DEFAULT_SAMPLE_BUDGET,
  pendingUpdate: null,
  updateDismissed: false,
  selectedRow: null,
  settingsOpen: false,
  compareCancelled: false,
  syncCancelling: false,
  busy: false,
  syncFailures: [],
  showSyncFailures: false,
  syncSucceededCount: 0,
  syncQueued: false,
  failureFixRowId: null,
  failureFixStatus: null,
  partialRetryRowIds: null,

  init: async () => {
    const ready = await window.myFileSync.ready()
    if (!ready.ok) {
      set({ statusText: ready.error.message })
      return
    }

    const settings = await window.myFileSync.settingsGet()
    const updatesFolder = settings.ok ? settings.value.updatesFolder : ''
    const hardwareAcceleration = settings.ok ? settings.value.hardwareAcceleration : true
    const confirmMirrorDeletes = settings.ok ? settings.value.confirmMirrorDeletes : true
    const progressUiExpanded = settings.ok ? settings.value.progressUiExpanded : true

    set({
      initialized: true,
      appVersion: ready.value.version,
      updatesFolder,
      hardwareAcceleration,
      confirmMirrorDeletes,
      progressUiExpanded,
      statusText: `Ready · ${formatDisplayVersion(ready.value.version)}`,
    })

    await get().refreshJobs()
  },

  refreshJobs: async () => {
    const result = await window.myFileSync.jobList()
    if (!result.ok) return
    set({ jobs: result.value.jobs })
    if (get().activeJobId) return

    const settings = await window.myFileSync.settingsGet()
    const preferred = settings.ok ? settings.value.lastJobId : undefined
    const jobs = result.value.jobs
    const target =
      (preferred && jobs.some((job) => job.id === preferred) ? preferred : undefined) ?? jobs[0]?.id
    if (target) await get().selectJob(target)
  },

  selectJob: async (id) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    if (get().activeJobId === id) return
    const result = await window.myFileSync.jobGet({ id })
    if (!result.ok) return
    void window.myFileSync.settingsSet({ lastJobId: id })
    set({
      activeJobId: id,
      activeJob: result.value.job,
      activePairIndex: 0,
      compareRunId: null,
      compareStats: null,
      compareFilter: 'all',
      syncFailures: [],
      showSyncFailures: false,
      ...EMPTY_COMPARE_VIEW,
    })
  },

  newJob: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const job = createDefaultJob()
    const saved = await window.myFileSync.jobSave({ job })
    if (!saved.ok) {
      set({ statusText: saved.error.message })
      return
    }
    await get().refreshJobs()
    await get().selectJob(saved.value.id)
    set({ mainTab: 'options', statusText: 'New job — set source and target folders, then Save.' })
  },

  saveActiveJob: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const { activeJob } = get()
    if (!activeJob) return
    set({ busy: true })
    const saved = await window.myFileSync.jobSave({ job: activeJob })
    set({ busy: false })
    if (!saved.ok) {
      set({ statusText: saved.error.message })
      return
    }
    await get().refreshJobs()
    set({ statusText: 'Job saved.' })
  },

  deleteActiveJob: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const { activeJobId, activeJob } = get()
    if (!activeJobId || !activeJob) return
    const name = activeJob.name
    const result = await window.myFileSync.jobDelete({ id: activeJobId })
    if (!result.ok) {
      set({ statusText: result.error.message })
      return
    }
    set({
      activeJobId: null,
      activeJob: null,
      activePairIndex: 0,
      compareRunId: null,
      compareStats: null,
      compareRows: [],
      selectedRow: null,
      statusText: `Deleted job "${name}".`,
    })
    await get().refreshJobs()
  },

  importIni: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const picked = await window.myFileSync.pickFile({
      title: 'Import BackupMirror INI',
      filters: [{ name: 'INI', extensions: ['ini'] }],
    })
    if (!picked.ok || !picked.value.path) return
    await get().finishImport(picked.value.path, 'ini')
  },

  importJobFile: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const picked = await window.myFileSync.pickFile({
      title: 'Import job',
      filters: [
        { name: 'FreeFileSync', extensions: ['ffs_gui', 'ffs_batch'] },
        { name: 'BackupMirror INI', extensions: ['ini'] },
        { name: 'MyFileSync job', extensions: ['json'] },
      ],
    })
    if (!picked.ok || !picked.value.path) return
    const lower = picked.value.path.toLowerCase()
    const kind = lower.endsWith('.ini')
      ? 'ini'
      : lower.endsWith('.json')
        ? 'json'
        : 'ffs'
    await get().finishImport(picked.value.path, kind)
  },

  exportJobFfs: async () => {
    const job = get().activeJob
    if (!job) {
      set({ statusText: 'Create or open a job before exporting.' })
      return
    }
    const safeName = job.name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'job'
    const picked = await window.myFileSync.saveFile({
      title: 'Export FreeFileSync job',
      defaultPath: `${safeName}.ffs_gui`,
      filters: [
        { name: 'FreeFileSync GUI', extensions: ['ffs_gui'] },
        { name: 'FreeFileSync batch', extensions: ['ffs_batch'] },
      ],
    })
    if (!picked.ok || !picked.value.path) return
    const exported = await window.myFileSync.jobExportFfs({ path: picked.value.path, job })
    if (!exported.ok) {
      set({ statusText: exported.error.message })
      return
    }
    const extra = exported.value.warnings[0] ? ` ${exported.value.warnings[0]}` : ''
    set({
      logs: [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString(),
          message:
            exported.value.warnings.length > 0
              ? `Exported FreeFileSync (${exported.value.warnings.length} notes)`
              : 'Exported FreeFileSync',
          level: 'success',
        },
        ...get().logs,
      ],
      statusText: `Exported FreeFileSync job.${extra}`,
    })
  },

  finishImport: async (filePath: string, kind: 'ffs' | 'ini' | 'json') => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    let id: string
    let warnings: string[] = []
    if (kind === 'json') {
      const imported = await window.myFileSync.jobImportJson({ path: filePath })
      if (!imported.ok) {
        set({ statusText: imported.error.message })
        return
      }
      id = imported.value.id
    } else if (kind === 'ini') {
      const imported = await window.myFileSync.jobImportIni({ path: filePath })
      if (!imported.ok) {
        set({ statusText: imported.error.message })
        return
      }
      id = imported.value.id
      warnings = imported.value.warnings
    } else {
      const imported = await window.myFileSync.jobImportFfs({ path: filePath })
      if (!imported.ok) {
        set({ statusText: imported.error.message })
        return
      }
      id = imported.value.id
      warnings = imported.value.warnings
    }
    const label =
      kind === 'ffs' ? 'FreeFileSync' : kind === 'ini' ? 'INI' : 'Job'
    set({
      logs: [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString(),
          message:
            warnings.length > 0
              ? `Imported ${label} (${warnings.length} notes)`
              : `Imported ${label}`,
          level: 'success',
        },
        ...get().logs,
      ],
    })
    await get().refreshJobs()
    await get().selectJob(id)
    const extra = warnings[0] ? ` ${warnings[0]}` : ''
    set({
      mainTab: 'options',
      statusText:
        kind === 'json'
          ? 'Job loaded.'
          : `${label} imported — review pairs and filters.${extra}`,
    })
  },

  loadJobFile: async () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const picked = await window.myFileSync.pickFile({
      title: 'Load job',
      filters: [{ name: 'MyFileSync job', extensions: ['json'] }],
    })
    if (!picked.ok || !picked.value.path) return
    const imported = await window.myFileSync.jobImportJson({ path: picked.value.path })
    if (!imported.ok) {
      set({ statusText: imported.error.message })
      return
    }
    await get().refreshJobs()
    await get().selectJob(imported.value.id)
    set({ statusText: 'Job loaded.' })
  },

  updateActiveJob: (patch) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const job = get().activeJob
    if (!job) return
    set({ activeJob: { ...job, ...patch } })
  },

  setMainTab: (tab) => set({ mainTab: tab }),

  setActivePairIndex: (index) => set({ activePairIndex: index }),

  addPair: () => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const job = get().activeJob
    if (!job) return
    set({
      activeJob: {
        ...job,
        pairs: [
          ...job.pairs,
          { id: crypto.randomUUID(), left: '', right: '', enabled: true, ads: true },
        ],
      },
      activePairIndex: job.pairs.length,
    })
  },

  removePair: (index) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob, activePairIndex } = get()
    if (!activeJob || activeJob.pairs.length <= 1) return
    const pairs = activeJob.pairs.filter((_, i) => i !== index)
    const nextIndex =
      activePairIndex === index
        ? Math.min(index, pairs.length - 1)
        : activePairIndex > index
          ? activePairIndex - 1
          : activePairIndex
    set({
      activeJob: { ...activeJob, pairs },
      activePairIndex: Math.max(0, nextIndex),
    })
  },

  movePair: (index, direction) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob } = get()
    if (!activeJob) return
    const dest = index + direction
    if (dest < 0 || dest >= activeJob.pairs.length) return
    const pairs = [...activeJob.pairs]
    const tmp = pairs[dest]
    pairs[dest] = pairs[index]!
    pairs[index] = tmp!
    set({ activeJob: { ...activeJob, pairs }, activePairIndex: dest })
  },

  flipPair: (index) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob } = get()
    if (!activeJob) return
    const pair = activeJob.pairs[index]
    if (!pair) return
    set({
      activeJob: {
        ...activeJob,
        pairs: activeJob.pairs.map((p, i) => (i === index ? { ...p, left: p.right, right: p.left } : p)),
      },
      activePairIndex: index,
    })
  },

  setPairPath: (index, side, path) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob } = get()
    if (!activeJob || !activeJob.pairs[index]) return
    set({
      activeJob: {
        ...activeJob,
        pairs: activeJob.pairs.map((p, i) => (i === index ? { ...p, [side]: path } : p)),
      },
      activePairIndex: index,
    })
  },

  setPairEnabled: (index, enabled) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob } = get()
    if (!activeJob || !activeJob.pairs[index]) return
    set({
      activeJob: {
        ...activeJob,
        pairs: activeJob.pairs.map((p, i) => (i === index ? { ...p, enabled } : p)),
      },
      activePairIndex: index,
    })
    void persistActiveJobQuiet(get, set)
  },

  setPairAds: (index, ads) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) return
    const { activeJob } = get()
    if (!activeJob || !activeJob.pairs[index]) return
    set({
      activeJob: {
        ...activeJob,
        pairs: activeJob.pairs.map((p, i) => (i === index ? { ...p, ads } : p)),
      },
      activePairIndex: index,
    })
    void persistActiveJobQuiet(get, set)
  },

  setPairListHeight: (height, persist = false) => {
    const { activeJob } = get()
    if (!activeJob) return
    const pairListHeight = Math.round(Math.min(4000, Math.max(40, height)))
    if (activeJob.ui?.pairListHeight !== pairListHeight) {
      set({
        activeJob: {
          ...activeJob,
          ui: { ...activeJob.ui, pairListHeight },
        },
      })
    }
    if (!persist) return
    void persistActiveJobQuiet(get, set)
  },

  clearCompareList: () =>
    set({
      compareRunId: null,
      compareStats: null,
      ...EMPTY_COMPARE_VIEW,
      statusText: 'Compare list cleared.',
    }),

  browsePairPath: async (index, side) => {
    if (isJobConfigLocked(get().compareBusy, get().syncBusy)) {
      set({ statusText: JOB_CONFIG_LOCKED_HINT })
      return
    }
    const { activeJob } = get()
    const pair = activeJob?.pairs[index]
    if (!pair) return
    const picked = await window.myFileSync.pickFolder({
      title: `Choose ${side === 'left' ? 'source' : 'target'} folder`,
    })
    if (!picked.ok || !picked.value.path) return
    set({
      activeJob: {
        ...activeJob!,
        pairs: activeJob!.pairs.map((p, i) => (i === index ? { ...p, [side]: picked.value.path! } : p)),
      },
      activePairIndex: index,
    })
  },

  cancelOperation: async () => {
    const { compareRunId, syncRunId, compareBusy, syncBusy } = get()
    if (compareBusy) {
      set({ compareCancelled: true, syncQueued: false, statusText: 'Cancelling compare…' })
      await window.myFileSync.compareCancel({ runId: compareRunId ?? undefined })
    }
    if (syncBusy) {
      set({ syncCancelling: true, statusText: 'Cancelling…' })
      void window.myFileSync.syncCancel({ syncRunId: syncRunId ?? undefined })
    }
  },

  runCompare: async () => {
    const { activeJobId, activeJob } = get()
    if (!activeJobId || !activeJob) return
    if (!activeJob.pairs.some((p) => p.enabled)) {
      set({ statusText: 'Enable at least one folder pair.' })
      return
    }
    const saved = await persistActiveJobQuiet(get, set)
    if (!saved) return
    const job = get().activeJob ?? activeJob
    const runId = crypto.randomUUID()
    set({
      compareBusy: true,
      compareCancelled: false,
      compareRunId: runId,
      compareStats: null,
      syncFailures: [],
      showSyncFailures: false,
      syncQueued: false,
      compareFilter: 'all',
      ...EMPTY_COMPARE_VIEW,
      compareProgress: { done: 0, total: 0, phase: 'enumerating' },
      progressStartedAt: Date.now(),
      progressSamples: [{ at: 0, items: 0, bytes: 0 }],
      statusText: 'Enumerating…',
    })
    setAppWindowTitle('Enumerating')
    try {
      if (get().compareCancelled) {
        set({ statusText: 'Compare cancelled.' })
        return
      }
      const result = await window.myFileSync.compareRun({ jobId: activeJobId, runId, job })
      if (!result.ok) {
        set({ statusText: result.error.message, syncQueued: false })
        return
      }
      const cancelled = get().compareCancelled || result.value.cancelled
      const [page, compareFolderTree] = await Promise.all([
        loadCompareRows(result.value.runId, 'all', ''),
        loadCompareTree(result.value.runId, 'all'),
      ])
      const summary = formatCompareStatus(result.value.stats)
      set({
        compareRunId: result.value.runId,
        compareStats: result.value.stats,
        ...comparePagePatch(page),
        compareFolderTree,
        comparePathPrefix: '',
        syncQueued: false,
        statusText: cancelled ? `Compare cancelled · ${summary}` : summary,
      })
      if (!cancelled) await get().startSyncIfQueued(result.value.stats)
    } catch (error) {
      set({
        statusText: error instanceof Error ? error.message : 'Compare failed unexpectedly.',
        syncQueued: false,
      })
    } finally {
      resetAppWindowTitle()
      set({ compareBusy: false })
    }
  },

  runSync: async () => {
    if (get().syncBusy) return

    if (get().compareBusy) {
      const queued = !get().syncQueued
      set({
        syncQueued: queued,
        statusText: queued
          ? `${get().statusText.replace(/ · Sync queued$/, '')} · Sync queued`
          : get().statusText.replace(/ · Sync queued$/, ''),
      })
      return
    }

    const deletes = get().compareStats?.deletes ?? 0
    set({ pendingSyncPrefix: '', pendingSyncDeletes: deletes })
    if (deletes > 0 && get().confirmMirrorDeletes) {
      set({ showDeleteConfirm: true })
      return
    }
    await get().confirmSync()
  },

  startSyncIfQueued: async (stats) => {
    if (!get().syncQueued) return
    set({
      syncQueued: false,
      pendingSyncPrefix: '',
      pendingSyncDeletes: stats.deletes ?? 0,
      showDeleteConfirm: false,
    })
    await get().confirmSync()
  },

  confirmSync: async (dontShowAgain?: boolean) => {
    if (dontShowAgain) {
      set({ confirmMirrorDeletes: false })
      void window.myFileSync.settingsSet({ confirmMirrorDeletes: false })
    }
    const { activeJobId, compareRunId, pendingSyncPrefix } = get()
    if (!activeJobId || !compareRunId) return
    set({
      showDeleteConfirm: false,
      syncBusy: true,
      syncCancelling: false,
      showSyncFailures: false,
      progressStartedAt: Date.now(),
      progressSamples: [{ at: 0, items: 0, bytes: 0 }],
      statusText: 'Syncing…',
    })
    const result = await window.myFileSync.syncRun({
      jobId: activeJobId,
      runId: compareRunId,
      pathPrefix: pendingSyncPrefix || undefined,
    })
    if (!result.ok) {
      set({ syncBusy: false, statusText: result.error.message })
    } else {
      set({ syncRunId: result.value.syncRunId })
    }
  },

  cancelSyncConfirm: () =>
    set({ showDeleteConfirm: false, pendingSyncPrefix: '', pendingSyncDeletes: 0, syncQueued: false }),

  setCompareFilter: async (filter) => {
    set({ compareFilter: filter })
    const { compareRunId, comparePathPrefix } = get()
    if (!compareRunId) return
    const [page, compareFolderTree] = await Promise.all([
      loadCompareRows(compareRunId, filter, comparePathPrefix),
      loadCompareTree(compareRunId, filter),
    ])
    set({ ...comparePagePatch(page), compareFolderTree })
  },

  selectCompareFolder: async (pathPrefix) => {
    set({ comparePathPrefix: pathPrefix, selectedRow: null })
    const { compareRunId, compareFilter } = get()
    if (!compareRunId) return
    const page = await loadCompareRows(compareRunId, compareFilter, pathPrefix)
    set(comparePagePatch(page))
  },

  loadCompareWindow: async (offset, limit) => {
    const { compareRunId, compareFilter, comparePathPrefix } = get()
    if (!compareRunId) return
    const page = await loadCompareRows(compareRunId, compareFilter, comparePathPrefix, offset, limit)
    if (
      get().compareRunId !== compareRunId ||
      get().compareFilter !== compareFilter ||
      get().comparePathPrefix !== comparePathPrefix
    ) {
      return
    }
    set(comparePagePatch(page))
  },

  handleFolderAction: async (action, path, deletes) => {
    const { activeJob, compareRunId } = get()
    if (!compareRunId) return

    async function refreshAfterDrop(nextPrefix: string, stats?: CompareStats): Promise<void> {
      const { compareFilter } = get()
      const [page, compareFolderTree] = await Promise.all([
        loadCompareRows(compareRunId!, compareFilter, nextPrefix),
        loadCompareTree(compareRunId!, compareFilter),
      ])
      set({
        ...comparePagePatch(page),
        compareFolderTree,
        comparePathPrefix: nextPrefix,
        selectedRow: null,
        ...(stats ? { compareStats: stats } : {}),
        statusText: stats ? formatCompareStatus(stats) : get().statusText,
      })
    }

    if (action === 'sync') {
      set({ pendingSyncPrefix: path, pendingSyncDeletes: deletes })
      if (deletes > 0 && get().confirmMirrorDeletes) {
        set({ showDeleteConfirm: true })
        return
      }
      await get().confirmSync()
      return
    }

    if (action === 'excludePath' || action === 'excludeName') {
      if (!activeJob) return
      const relFolder = parsePairTreePath(path).relPath
      const rule =
        action === 'excludePath'
          ? excludeThisFolderRule(relFolder)
          : excludeFolderNameRule(relFolder || path)
      if (!rule) return
      if (!activeJob.filters.exclude.includes(rule)) {
        get().updateActiveJob({
          filters: { ...activeJob.filters, exclude: [...activeJob.filters.exclude, rule] },
        })
        await get().saveActiveJob()
      }
    }

    const dropped = await window.myFileSync.compareDrop(
      action === 'excludeName'
        ? { runId: compareRunId, folderName: path.split(/[\\/]/).pop() }
        : { runId: compareRunId, pathPrefix: path },
    )
    if (!dropped.ok) {
      set({ statusText: dropped.error.message })
      return
    }
    const current = get().comparePathPrefix
    const nextPrefix =
      action === 'excludeName' || !path || current === path || current.startsWith(`${path}/`)
        ? ''
        : current
    await refreshAfterDrop(nextPrefix, dropped.value.stats)
    const kind =
      action === 'excludeTemp'
        ? 'Removed from this compare'
        : action === 'excludeName'
          ? `Exclude filter added (${path.split(/[\\/]/).pop()})`
          : 'Exclude filter added'
    set({
      statusText: `${kind} · ${dropped.value.dropped.toLocaleString()} items`,
      logs: [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString(),
          message: `${kind}: ${dropped.value.dropped} item(s)`,
          level: 'info',
        },
        ...get().logs,
      ],
    })
  },

  toggleRowIncluded: async (rowId, included) => {
    const { compareRunId } = get()
    if (!compareRunId) return
    await window.myFileSync.compareSetRowIncluded({ runId: compareRunId, rowId, included })
    set({
      compareRows: get().compareRows.map((r) => (r.id === rowId ? { ...r, included } : r)),
    })
  },

  browseUpdatesFolder: async () => {
    const picked = await window.myFileSync.pickFolder({ title: 'Choose updates folder' })
    if (!picked.ok || !picked.value.path) return
    get().setUpdatesFolder(picked.value.path)
    set({
      updateDismissed: false,
      updatesStatus: 'Updates folder set. Click Check for updates when ready.',
    })
  },

  setUpdatesFolder: (path) => {
    set({ updatesFolder: path })
    void window.myFileSync.settingsSet({ updatesFolder: path })
  },

  setHardwareAcceleration: (enabled) => {
    set({ hardwareAcceleration: enabled })
    void window.myFileSync.settingsSet({ hardwareAcceleration: enabled })
  },

  setConfirmMirrorDeletes: (enabled) => {
    set({ confirmMirrorDeletes: enabled })
    void window.myFileSync.settingsSet({ confirmMirrorDeletes: enabled })
  },

  setProgressUiExpanded: (expanded) => {
    set({ progressUiExpanded: expanded })
    void window.myFileSync.settingsSet({ progressUiExpanded: expanded })
  },

  setProgressChartPixels: (plotPhysicalPx) => {
    const next = chartSampleBudget(plotPhysicalPx)
    if (next > get().progressSampleBudget) set({ progressSampleBudget: next })
  },

  checkForUpdates: async () => {
    const { updatesFolder } = get()
    if (!updatesFolder) {
      set({ updatesStatus: 'Set an updates folder first.' })
      return
    }
    set({ busy: true, updatesStatus: 'Checking…' })
    const result = await window.myFileSync.checkForUpdates()
    set({ busy: false })
    if (!result.ok) {
      set({ updatesStatus: result.error.message })
      return
    }
    if (result.value.status === 'update-available' && result.value.installerPath && result.value.latestVersion) {
      set({
        pendingUpdate: {
          latestVersion: result.value.latestVersion,
          installerPath: result.value.installerPath,
          currentVersion: result.value.currentVersion ?? get().appVersion,
        },
        updatesStatus: `${formatDisplayVersion(result.value.latestVersion)} available`,
        updateDismissed: false,
      })
    } else if (result.value.status === 'no-folder') {
      set({ pendingUpdate: null, updatesStatus: 'Set an updates folder first.' })
    } else if (result.value.status === 'folder-missing') {
      set({ pendingUpdate: null, updatesStatus: 'Updates folder not found.' })
    } else if (result.value.status === 'no-installers') {
      set({ pendingUpdate: null, updatesStatus: 'No installers found in updates folder.' })
    } else {
      set({ pendingUpdate: null, updatesStatus: 'Up to date' })
    }
  },

  runUpdate: async () => {
    const update = get().pendingUpdate
    if (!update) return
    await window.myFileSync.runUpdate({ installerPath: update.installerPath })
  },

  dismissUpdate: () => set({ updateDismissed: true }),

  exportSettings: async () => {
    const picked = await window.myFileSync.saveFile({
      title: 'Export settings',
      defaultPath: 'myfilesync-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!picked.ok || !picked.value.path) return
    const result = await window.myFileSync.settingsExport({ path: picked.value.path })
    if (result.ok) set({ statusText: 'Settings exported.' })
  },

  importSettings: async () => {
    const picked = await window.myFileSync.pickFile({
      title: 'Import settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!picked.ok || !picked.value.path) return
    const result = await window.myFileSync.settingsImport({ path: picked.value.path })
    if (result.ok) {
      set({
        updatesFolder: result.value.updatesFolder,
        hardwareAcceleration: result.value.hardwareAcceleration,
        confirmMirrorDeletes: result.value.confirmMirrorDeletes,
        progressUiExpanded: result.value.progressUiExpanded,
        statusText: 'Settings imported. Restart MyFileSync if the GPU setting changed.',
      })
    }
  },

  selectRow: (row) => set({ selectedRow: row }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  catchUpProgressSample: () => {
    const startedAt = get().progressStartedAt
    if (!startedAt) return
    if (get().syncBusy && get().syncProgress) {
      const progress = get().syncProgress
      set({
        progressSamples: appendSample(
          get().progressSamples,
          {
            at: Date.now() - startedAt,
            items: progress.done,
            bytes: progress.bytesDone ?? 0,
          },
          undefined,
          get().progressSampleBudget,
        ),
      })
      return
    }
    if (get().compareBusy && get().compareProgress) {
      const progress = get().compareProgress
      set({
        progressSamples: appendSample(
          get().progressSamples,
          {
            at: Date.now() - startedAt,
            items: progress.done,
            bytes: 0,
          },
          undefined,
          get().progressSampleBudget,
        ),
      })
    }
  },

  handleSyncEvent: (event) => {
    if (event.type === 'sync:progress') {
      if (get().syncCancelling) return
      const startedAt = get().progressStartedAt ?? Date.now()
      set({
        syncProgress: event.progress,
        progressStartedAt: startedAt,
        progressSamples: appendSample(
          get().progressSamples,
          {
            at: Date.now() - startedAt,
            items: event.progress.done,
            bytes: event.progress.bytesDone ?? 0,
          },
          undefined,
          get().progressSampleBudget,
        ),
        statusText: formatSyncStatus(event.progress),
      })
    }
    if (event.type === 'sync:done') {
      if (syncDoneResolve) {
        syncDoneResolve(event.summary)
        syncDoneResolve = null
      }

      const partial = get().partialRetryRowIds
      if (partial && partial.length > 0) {
        const pathsBefore = new Map(get().syncFailures.map((f) => [f.rowId, f.relPath]))
        const nextFailures = mergeRetriedFailures(get().syncFailures, partial, event.summary)
        const fixed = partial.filter((rowId) => !event.summary.failures.some((f) => f.rowId === rowId))
        const fixedLabel =
          fixed.length === 1 ? (pathsBefore.get(fixed[0]!) ?? fixed[0]) : `${event.summary.succeeded} items`
        const { compareRunId, compareFilter, comparePathPrefix } = get()
        set({
          syncBusy: false,
          busy: false,
          partialRetryRowIds: null,
          failureFixRowId: null,
          failureFixStatus: null,
          syncFailures: nextFailures,
          showSyncFailures: nextFailures.length > 0,
          syncSucceededCount: get().syncSucceededCount + event.summary.succeeded,
          compareStats: event.summary.stats ?? get().compareStats,
          statusText:
            event.summary.failed > 0
              ? `Retry failed for ${event.summary.failed} item(s)`
              : fixed.length === 1
                ? `Fixed and synced: ${fixedLabel}`
                : `Fixed and synced ${event.summary.succeeded} item(s)`,
          logs: [
            ...(fixed.length > 0
              ? [
                  {
                    id: crypto.randomUUID(),
                    time: new Date().toLocaleTimeString(),
                    message:
                      fixed.length === 1
                        ? `Synced after fix: ${fixedLabel}`
                        : `Synced ${event.summary.succeeded} item(s) after fix`,
                    level: 'success' as const,
                  },
                ]
              : []),
            ...(event.summary.failures.length > 0
              ? event.summary.failures.map((failure) => ({
                  id: crypto.randomUUID(),
                  time: new Date().toLocaleTimeString(),
                  message: `Retry failed — ${failure.relPath}: ${failure.message}`,
                  level: 'error' as const,
                }))
              : []),
            ...get().logs,
          ],
        })
        if (compareRunId) {
          void Promise.all([
            loadCompareRows(compareRunId, compareFilter, comparePathPrefix),
            loadCompareTree(compareRunId, compareFilter),
          ]).then(([page, compareFolderTree]) => {
            set({ ...comparePagePatch(page), compareFolderTree })
          })
        }
        return
      }

      const counts =
        event.summary.failed > 0
          ? `${event.summary.succeeded} ok, ${event.summary.failed} failed`
          : `${event.summary.succeeded} ok`
      const { compareRunId, comparePathPrefix, pendingSyncPrefix } = get()
      const nextFilter = event.summary.failures.length > 0 ? 'errors' : get().compareFilter
      const nextPrefix =
        !pendingSyncPrefix ||
        comparePathPrefix === pendingSyncPrefix ||
        (pendingSyncPrefix !== '' && comparePathPrefix.startsWith(`${pendingSyncPrefix}/`))
          ? ''
          : comparePathPrefix
      const failureLogs: LogEntry[] = event.summary.failures.map((failure) => ({
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString(),
        message: `${failure.relPath}: ${failure.message}${failure.hint ? ` — ${failure.hint}` : ''}`,
        level: 'error' as const,
      }))
      set({
        syncBusy: false,
        syncCancelling: false,
        pendingSyncPrefix: '',
        pendingSyncDeletes: 0,
        comparePathPrefix: nextPrefix,
        compareFilter: nextFilter,
        compareStats: event.summary.stats ?? get().compareStats,
        syncFailures: event.summary.failures,
        showSyncFailures: event.summary.failures.length > 0,
        syncSucceededCount: event.summary.succeeded,
        statusText: event.summary.cancelled
          ? `Sync cancelled · ${counts}`
          : event.summary.failed > 0
            ? `Sync finished · ${counts} — see details`
            : `Sync finished · ${counts}`,
        logs: [
          {
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString(),
            message: event.summary.cancelled
              ? event.summary.failed > 0
                ? `Sync cancelled: ${event.summary.succeeded} succeeded, ${event.summary.failed} failed`
                : `Sync cancelled: ${event.summary.succeeded} succeeded`
              : event.summary.failed > 0
                ? `Sync finished: ${event.summary.succeeded} succeeded, ${event.summary.failed} failed`
                : `Sync complete: ${event.summary.succeeded} succeeded`,
            level: event.summary.failed > 0 ? 'error' : event.summary.cancelled ? 'info' : 'success',
          },
          ...failureLogs,
          ...get().logs,
        ],
      })
      if (compareRunId) {
        void Promise.all([
          loadCompareRows(compareRunId, nextFilter, nextPrefix),
          loadCompareTree(compareRunId, nextFilter),
        ]).then(([page, compareFolderTree]) => {
          set({ ...comparePagePatch(page), compareFolderTree, selectedRow: null })
        })
      }
    }
    if (event.type === 'compare:progress') {
      const path = event.currentPath?.trim()
      const phase = event.phase ?? 'comparing'
      if (event.titleNote) setAppWindowTitle(event.titleNote)
      const queued = get().syncQueued ? ' · Sync queued' : ''
      const startedAt = get().progressStartedAt ?? Date.now()
      const switchedToCompare =
        phase === 'comparing' && get().compareProgress?.phase === 'enumerating'
      const isStatusOnly = Boolean(path && /…$/.test(path) && !path.includes('/') && !path.includes('\\'))
      const itemLabel =
        event.done <= 0
          ? ''
          : event.total > 0
            ? ` ${event.done.toLocaleString()} of ${event.total.toLocaleString()}`
            : ` ${event.done.toLocaleString()} items`
      const pathLabel = path && !isStatusOnly ? ` · ${path}` : ''
      const verb = phase === 'enumerating' ? 'Enumerating' : 'Comparing'
      const percent =
        phase === 'comparing' && event.total > 0
          ? ` ${Math.min(100, Math.round((event.done / event.total) * 100))}%`
          : ''
      set({
        compareProgress: { done: event.done, total: event.total, currentPath: path, phase },
        progressStartedAt: startedAt,
        progressSamples: switchedToCompare
          ? [{ at: Date.now() - startedAt, items: 0, bytes: 0 }] // new phase; chart X starts here, not 0
          : appendSample(
              get().progressSamples,
              {
                at: Date.now() - startedAt,
                items: event.done,
                bytes: 0,
              },
              undefined,
              get().progressSampleBudget,
            ),
        statusText: `${verb}…${percent}${itemLabel}${pathLabel}${queued}`,
      })
    }
  },

  dismissSyncFailures: () => set({ showSyncFailures: false }),

  retryFailedSync: async () => {
    const rowIds = get().syncFailures.map((f) => f.rowId)
    if (rowIds.length === 0) return
    await get().retrySyncRows(rowIds)
  },

  retrySyncRows: async (rowIds) => {
    const { activeJobId, compareRunId } = get()
    if (!activeJobId || !compareRunId || rowIds.length === 0) return

    set({
      partialRetryRowIds: rowIds,
      syncBusy: true,
      showSyncFailures: true,
      progressStartedAt: Date.now(),
      progressSamples: [{ at: 0, items: 0, bytes: 0 }],
      statusText: rowIds.length === 1 ? 'Retrying failed item…' : `Retrying ${rowIds.length} items…`,
    })

    const done = waitForSyncDone()
    const result = await window.myFileSync.syncRun({
      jobId: activeJobId,
      runId: compareRunId,
      rowIds,
    })
    if (!result.ok) {
      set({
        syncBusy: false,
        partialRetryRowIds: null,
        failureFixRowId: null,
        failureFixStatus: null,
        statusText: result.error.message,
      })
      syncDoneResolve = null
      return
    }
    set({ syncRunId: result.value.syncRunId })
    await done
  },

  viewSyncErrorsInGrid: async () => {
    set({ showSyncFailures: false, mainTab: 'compare' })
    await get().setCompareFilter('errors')
  },

  showFailureInFolder: async (path) => {
    await get().revealDiskPath(path)
  },

  openDiskPath: async (path) => {
    const result = await window.myFileSync.openPath({ path })
    if (!result.ok) set({ statusText: result.error.message })
  },

  revealDiskPath: async (path) => {
    const result = await window.myFileSync.showItemInFolder({ path })
    if (!result.ok) set({ statusText: result.error.message })
  },

  clearFailureReadOnly: async (failure) => {
    if (!failure.targetPath) return

    set({
      busy: true,
      failureFixRowId: failure.rowId,
      failureFixStatus: 'Clearing read-only…',
      showSyncFailures: true,
    })

    const result = await window.myFileSync.clearReadOnly({ path: failure.targetPath })
    if (!result.ok) {
      set({
        busy: false,
        failureFixRowId: null,
        failureFixStatus: null,
        statusText: result.error.message,
      })
      return
    }

    set({
      failureFixStatus: 'Retrying sync…',
      syncFailures: get().syncFailures.map((f) =>
        f.rowId === failure.rowId ? { ...f, hint: 'Read-only cleared — retrying sync…' } : f,
      ),
    })

    await get().retrySyncRows([failure.rowId])
    set({ busy: false })
  },
}))

export function shouldShowUpdateBanner(state: WorkbenchState): boolean {
  return !state.updateDismissed && state.pendingUpdate !== null
}
