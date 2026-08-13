import { create } from 'zustand'
import { createDefaultJob, type JobFile, type JobSummary } from '@shared/schemas/job'
import type { CompareFilter, CompareRow, CompareStats, SyncProgress } from '@shared/schemas/compare'
import type { SyncEvent } from '@shared/ipc/api'
import { formatDisplayVersion } from '@shared/version'

type LogEntry = {
  id: string
  time: string
  message: string
  level: 'info' | 'error' | 'success'
}

type WorkbenchState = {
  initialized: boolean
  appVersion: string
  jobs: JobSummary[]
  activeJobId: string | null
  activeJob: JobFile | null
  editorOpen: boolean
  compareRunId: string | null
  compareStats: CompareStats | null
  compareRows: CompareRow[]
  compareFilter: CompareFilter
  compareBusy: boolean
  syncRunId: string | null
  syncProgress: SyncProgress | null
  syncBusy: boolean
  statusText: string
  logs: LogEntry[]
  showDeleteConfirm: boolean
  updatesFolder: string
  updatesStatus: string
  pendingUpdate: { latestVersion: string; installerPath: string; currentVersion: string } | null
  updateDismissed: boolean
  selectedRow: import('@shared/schemas/compare').CompareRow | null
  busy: boolean

  init: () => Promise<void>
  refreshJobs: () => Promise<void>
  selectJob: (id: string) => Promise<void>
  newJob: () => Promise<void>
  saveActiveJob: () => Promise<void>
  deleteActiveJob: () => Promise<void>
  importIni: () => Promise<void>
  openEditor: () => void
  closeEditor: () => void
  updateActiveJob: (patch: Partial<JobFile>) => void
  updatePairPath: (pairId: string, side: 'left' | 'right', path: string) => void
  browsePairPath: (pairId: string, side: 'left' | 'right') => Promise<void>
  runCompare: () => Promise<void>
  runSync: () => Promise<void>
  confirmSync: () => Promise<void>
  cancelSyncConfirm: () => void
  setCompareFilter: (filter: CompareFilter) => Promise<void>
  toggleRowIncluded: (rowId: string, included: boolean) => Promise<void>
  browseUpdatesFolder: () => Promise<void>
  checkForUpdates: () => Promise<void>
  runUpdate: () => Promise<void>
  dismissUpdate: () => void
  exportSettings: () => Promise<void>
  importSettings: () => Promise<void>
  selectRow: (row: import('@shared/schemas/compare').CompareRow | null) => void
  handleSyncEvent: (event: SyncEvent) => void
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  initialized: false,
  appVersion: '0.0.0',
  jobs: [],
  activeJobId: null,
  activeJob: null,
  editorOpen: false,
  compareRunId: null,
  compareStats: null,
  compareRows: [],
  compareFilter: 'all',
  compareBusy: false,
  syncRunId: null,
  syncProgress: null,
  syncBusy: false,
  statusText: 'Starting…',
  logs: [],
  showDeleteConfirm: false,
  updatesFolder: '',
  updatesStatus: '',
  pendingUpdate: null,
  updateDismissed: false,
  selectedRow: null,
  busy: false,

  init: async () => {
    const ready = await window.myFileSync.ready()
    if (!ready.ok) {
      set({ statusText: ready.error.message })
      return
    }

    const settings = await window.myFileSync.settingsGet()
    const updatesFolder = settings.ok ? settings.value.updatesFolder : ''

    set({
      initialized: true,
      appVersion: ready.value.version,
      updatesFolder,
      statusText: `Ready · ${formatDisplayVersion(ready.value.version)}`,
    })

    await get().refreshJobs()
    if (updatesFolder) await get().checkForUpdates()
  },

  refreshJobs: async () => {
    const result = await window.myFileSync.jobList()
    if (!result.ok) return
    set({ jobs: result.value.jobs })
    if (!get().activeJobId && result.value.jobs[0]) {
      await get().selectJob(result.value.jobs[0].id)
    }
  },

  selectJob: async (id) => {
    const result = await window.myFileSync.jobGet({ id })
    if (!result.ok) return
    set({
      activeJobId: id,
      activeJob: result.value.job,
      compareRunId: null,
      compareStats: null,
      compareRows: [],
    })
  },

  newJob: async () => {
    const job = createDefaultJob()
    const saved = await window.myFileSync.jobSave({ job })
    if (!saved.ok) return
    await get().refreshJobs()
    await get().selectJob(saved.value.id)
    set({ editorOpen: true })
  },

  saveActiveJob: async () => {
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
    const { activeJobId } = get()
    if (!activeJobId) return
    await window.myFileSync.jobDelete({ id: activeJobId })
    set({ activeJobId: null, activeJob: null, editorOpen: false })
    await get().refreshJobs()
  },

  importIni: async () => {
    const picked = await window.myFileSync.pickFile({
      title: 'Import BackupMirror INI',
      filters: [{ name: 'INI', extensions: ['ini'] }],
    })
    if (!picked.ok || !picked.value.path) return
    const imported = await window.myFileSync.jobImportIni({ path: picked.value.path })
    if (!imported.ok) {
      set({ statusText: imported.error.message })
      return
    }
    set({
      logs: [
        {
          id: crypto.randomUUID(),
          time: new Date().toLocaleTimeString(),
          message: `Imported INI (${imported.value.warnings.length} warnings)`,
          level: 'success',
        },
        ...get().logs,
      ],
    })
    await get().refreshJobs()
    await get().selectJob(imported.value.id)
    set({ editorOpen: true })
  },

  openEditor: () => set({ editorOpen: true }),
  closeEditor: () => set({ editorOpen: false }),

  updateActiveJob: (patch) => {
    const job = get().activeJob
    if (!job) return
    set({ activeJob: { ...job, ...patch } })
  },

  updatePairPath: (pairId, side, path) => {
    const job = get().activeJob
    if (!job) return
    set({
      activeJob: {
        ...job,
        pairs: job.pairs.map((p) => (p.id === pairId ? { ...p, [side]: path } : p)),
      },
    })
  },

  browsePairPath: async (pairId, side) => {
    const picked = await window.myFileSync.pickFolder({ title: `Choose ${side} folder` })
    if (!picked.ok || !picked.value.path) return
    get().updatePairPath(pairId, side, picked.value.path)
  },

  runCompare: async () => {
    const { activeJobId, activeJob } = get()
    if (!activeJobId) return
    set({ compareBusy: true, statusText: 'Comparing…' })
    const result = await window.myFileSync.compareRun({ jobId: activeJobId })
    if (!result.ok) {
      set({ compareBusy: false, statusText: result.error.message })
      return
    }
    const rows = await window.myFileSync.compareGetRows({
      runId: result.value.runId,
      offset: 0,
      limit: 5000,
      filter: get().compareFilter,
    })
    set({
      compareBusy: false,
      compareRunId: result.value.runId,
      compareStats: result.value.stats,
      compareRows: rows.ok ? rows.value.rows : [],
      statusText: `Compared ${result.value.rowCount} items · ${result.value.stats.toSync} to sync`,
    })
    if (activeJob?.behavior.autoSyncAfterCompare && result.value.stats.toSync > 0) {
      await get().runSync()
    }
  },

  runSync: async () => {
    const deletes = get().compareStats?.deletes ?? 0
    if (deletes > 0) {
      set({ showDeleteConfirm: true })
      return
    }
    await get().confirmSync()
  },

  confirmSync: async () => {
    const { activeJobId, compareRunId } = get()
    if (!activeJobId || !compareRunId) return
    set({ showDeleteConfirm: false, syncBusy: true, statusText: 'Syncing…' })
    const result = await window.myFileSync.syncRun({ jobId: activeJobId, runId: compareRunId })
    if (!result.ok) {
      set({ syncBusy: false, statusText: result.error.message })
    } else {
      set({ syncRunId: result.value.syncRunId })
    }
  },

  cancelSyncConfirm: () => set({ showDeleteConfirm: false }),

  setCompareFilter: async (filter) => {
    set({ compareFilter: filter })
    const { compareRunId } = get()
    if (!compareRunId) return
    const rows = await window.myFileSync.compareGetRows({
      runId: compareRunId,
      offset: 0,
      limit: 5000,
      filter,
    })
    if (rows.ok) set({ compareRows: rows.value.rows })
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
    await window.myFileSync.settingsSet({ updatesFolder: picked.value.path })
    set({ updatesFolder: picked.value.path, updateDismissed: false })
    await get().checkForUpdates()
  },

  checkForUpdates: async () => {
    const result = await window.myFileSync.checkForUpdates()
    if (!result.ok) return
    if (result.value.status === 'update-available' && result.value.installerPath && result.value.latestVersion) {
      set({
        pendingUpdate: {
          latestVersion: result.value.latestVersion,
          installerPath: result.value.installerPath,
          currentVersion: result.value.currentVersion ?? get().appVersion,
        },
        updatesStatus: `${formatDisplayVersion(result.value.latestVersion)} available`,
      })
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
      set({ updatesFolder: result.value.updatesFolder, statusText: 'Settings imported.' })
    }
  },

  selectRow: (row) => set({ selectedRow: row }),

  handleSyncEvent: (event) => {
    if (event.type === 'sync:progress') {
      set({ syncProgress: event.progress, statusText: `Syncing ${event.progress.done}/${event.progress.total}` })
    }
    if (event.type === 'sync:done') {
      set({
        syncBusy: false,
        statusText: `Sync finished · ${event.summary.succeeded} ok, ${event.summary.failed} failed`,
        logs: [
          {
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString(),
            message: `Sync complete: ${event.summary.succeeded} succeeded, ${event.summary.failed} failed`,
            level: event.summary.failed > 0 ? 'error' : 'success',
          },
          ...get().logs,
        ],
      })
    }
    if (event.type === 'compare:progress') {
      set({ statusText: `Comparing… ${event.currentPath ?? ''}` })
    }
  },
}))

export function shouldShowUpdateBanner(state: WorkbenchState): boolean {
  return !state.updateDismissed && state.pendingUpdate !== null
}
