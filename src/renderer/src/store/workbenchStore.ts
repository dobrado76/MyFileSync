import { create } from 'zustand'
import { createDefaultJob, type JobFile, type JobSummary } from '@shared/schemas/job'
import type { CompareFilter, CompareRow, CompareStats, FolderTreeNode, SyncProgress } from '@shared/schemas/compare'
import type { SyncEvent } from '@shared/ipc/api'
import { formatDisplayVersion } from '@shared/version'
import { excludeFolderNameRule, excludeThisFolderRule } from '@shared/compare/filters'
import type { MainTab } from '../components/BackupMirrorWorkbench'
import type { TreeFolderAction } from '../components/CompareFolderTree'

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

const EMPTY_COMPARE_VIEW = {
  compareRows: [] as CompareRow[],
  compareFolderTree: null as FolderTreeNode | null,
  comparePathPrefix: '',
  selectedRow: null as CompareRow | null,
}

async function loadCompareRows(
  runId: string,
  filter: CompareFilter,
  pathPrefix: string,
): Promise<CompareRow[]> {
  const rows = await window.myFileSync.compareGetRows({
    runId,
    offset: 0,
    limit: 5000,
    filter,
    pathPrefix,
  })
  return rows.ok ? rows.value.rows : []
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
  compareFolderTree: FolderTreeNode | null
  comparePathPrefix: string
  compareFilter: CompareFilter
  compareBusy: boolean
  syncRunId: string | null
  syncProgress: SyncProgress | null
  syncBusy: boolean
  statusText: string
  logs: LogEntry[]
  showDeleteConfirm: boolean
  pendingSyncPrefix: string
  pendingSyncDeletes: number
  updatesFolder: string
  updatesStatus: string
  pendingUpdate: { latestVersion: string; installerPath: string; currentVersion: string } | null
  updateDismissed: boolean
  selectedRow: import('@shared/schemas/compare').CompareRow | null
  settingsOpen: boolean
  compareCancelled: boolean
  syncCancelling: boolean
  busy: boolean

  init: () => Promise<void>
  refreshJobs: () => Promise<void>
  selectJob: (id: string) => Promise<void>
  newJob: () => Promise<void>
  saveActiveJob: () => Promise<void>
  deleteActiveJob: () => Promise<void>
  importIni: () => Promise<void>
  importJobFile: () => Promise<void>
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
  clearCompareList: () => void
  browsePairPath: (index: number, side: 'left' | 'right') => Promise<void>
  cancelOperation: () => Promise<void>
  runCompare: () => Promise<void>
  runSync: () => Promise<void>
  confirmSync: () => Promise<void>
  cancelSyncConfirm: () => void
  setCompareFilter: (filter: CompareFilter) => Promise<void>
  selectCompareFolder: (pathPrefix: string) => Promise<void>
  handleFolderAction: (action: TreeFolderAction, path: string, deletes: number) => Promise<void>
  toggleRowIncluded: (rowId: string, included: boolean) => Promise<void>
  browseUpdatesFolder: () => Promise<void>
  setUpdatesFolder: (path: string) => void
  checkForUpdates: () => Promise<void>
  runUpdate: () => Promise<void>
  dismissUpdate: () => void
  exportSettings: () => Promise<void>
  importSettings: () => Promise<void>
  selectRow: (row: import('@shared/schemas/compare').CompareRow | null) => void
  openSettings: () => void
  closeSettings: () => void
  handleSyncEvent: (event: SyncEvent) => void
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
  compareFolderTree: null,
  comparePathPrefix: '',
  compareFilter: 'all',
  compareBusy: false,
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
  pendingUpdate: null,
  updateDismissed: false,
  selectedRow: null,
  settingsOpen: false,
  compareCancelled: false,
  syncCancelling: false,
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
      activePairIndex: 0,
      compareRunId: null,
      compareStats: null,
      ...EMPTY_COMPARE_VIEW,
    })
  },

  newJob: async () => {
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
    const picked = await window.myFileSync.pickFile({
      title: 'Import BackupMirror INI',
      filters: [{ name: 'INI', extensions: ['ini'] }],
    })
    if (!picked.ok || !picked.value.path) return
    await get().finishImport(picked.value.path, 'ini')
  },

  importJobFile: async () => {
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

  finishImport: async (filePath: string, kind: 'ffs' | 'ini' | 'json') => {
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
    const job = get().activeJob
    if (!job) return
    set({ activeJob: { ...job, ...patch } })
  },

  setMainTab: (tab) => set({ mainTab: tab }),

  setActivePairIndex: (index) => set({ activePairIndex: index }),

  addPair: () => {
    const job = get().activeJob
    if (!job) return
    set({
      activeJob: {
        ...job,
        pairs: [
          ...job.pairs,
          { id: crypto.randomUUID(), left: '', right: '', enabled: true },
        ],
      },
      activePairIndex: job.pairs.length,
    })
  },

  removePair: (index) => {
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

  clearCompareList: () =>
    set({
      compareRunId: null,
      compareStats: null,
      ...EMPTY_COMPARE_VIEW,
      statusText: 'Compare list cleared.',
    }),

  browsePairPath: async (index, side) => {
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
      set({ compareCancelled: true, statusText: 'Cancelling compare…' })
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
    const runId = crypto.randomUUID()
    set({
      compareBusy: true,
      compareCancelled: false,
      compareRunId: runId,
      compareStats: null,
      ...EMPTY_COMPARE_VIEW,
      statusText: 'Comparing…',
    })
    try {
      await get().saveActiveJob()
      if (get().compareCancelled) {
        set({ statusText: 'Compare cancelled.' })
        return
      }
      const result = await window.myFileSync.compareRun({ jobId: activeJobId, runId })
      if (get().compareCancelled || (result.ok && result.value.cancelled)) {
        set({ statusText: 'Compare cancelled.', compareStats: null, ...EMPTY_COMPARE_VIEW })
        return
      }
      if (!result.ok) {
        set({ statusText: result.error.message })
        return
      }
      const filter = get().compareFilter
      const [compareRows, compareFolderTree] = await Promise.all([
        loadCompareRows(result.value.runId, filter, ''),
        loadCompareTree(result.value.runId, filter),
      ])
      set({
        compareRunId: result.value.runId,
        compareStats: result.value.stats,
        compareRows,
        compareFolderTree,
        comparePathPrefix: '',
        statusText: formatCompareStatus(result.value.stats),
      })
    } catch (error) {
      set({
        statusText: error instanceof Error ? error.message : 'Compare failed unexpectedly.',
      })
    } finally {
      set({ compareBusy: false })
    }
  },

  runSync: async () => {
    const deletes = get().compareStats?.deletes ?? 0
    set({ pendingSyncPrefix: '', pendingSyncDeletes: deletes })
    if (deletes > 0) {
      set({ showDeleteConfirm: true })
      return
    }
    await get().confirmSync()
  },

  confirmSync: async () => {
    const { activeJobId, compareRunId, pendingSyncPrefix } = get()
    if (!activeJobId || !compareRunId) return
    set({ showDeleteConfirm: false, syncBusy: true, syncCancelling: false, statusText: 'Syncing…' })
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

  cancelSyncConfirm: () => set({ showDeleteConfirm: false, pendingSyncPrefix: '', pendingSyncDeletes: 0 }),

  setCompareFilter: async (filter) => {
    set({ compareFilter: filter })
    const { compareRunId, comparePathPrefix } = get()
    if (!compareRunId) return
    const [compareRows, compareFolderTree] = await Promise.all([
      loadCompareRows(compareRunId, filter, comparePathPrefix),
      loadCompareTree(compareRunId, filter),
    ])
    set({ compareRows, compareFolderTree })
  },

  selectCompareFolder: async (pathPrefix) => {
    set({ comparePathPrefix: pathPrefix, selectedRow: null })
    const { compareRunId, compareFilter } = get()
    if (!compareRunId) return
    const compareRows = await loadCompareRows(compareRunId, compareFilter, pathPrefix)
    set({ compareRows })
  },

  handleFolderAction: async (action, path, deletes) => {
    const { activeJob, compareRunId } = get()
    if (!compareRunId) return

    async function refreshAfterDrop(nextPrefix: string, stats?: CompareStats): Promise<void> {
      const { compareFilter } = get()
      const [compareRows, compareFolderTree] = await Promise.all([
        loadCompareRows(compareRunId!, compareFilter, nextPrefix),
        loadCompareTree(compareRunId!, compareFilter),
      ])
      set({
        compareRows,
        compareFolderTree,
        comparePathPrefix: nextPrefix,
        selectedRow: null,
        ...(stats ? { compareStats: stats } : {}),
        statusText: stats ? formatCompareStatus(stats) : get().statusText,
      })
    }

    if (action === 'sync') {
      set({ pendingSyncPrefix: path, pendingSyncDeletes: deletes })
      if (deletes > 0) {
        set({ showDeleteConfirm: true })
        return
      }
      await get().confirmSync()
      return
    }

    if (action === 'excludePath' || action === 'excludeName') {
      if (!activeJob) return
      const rule =
        action === 'excludePath' ? excludeThisFolderRule(path) : excludeFolderNameRule(path)
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
      set({ updatesFolder: result.value.updatesFolder, statusText: 'Settings imported.' })
    }
  },

  selectRow: (row) => set({ selectedRow: row }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  handleSyncEvent: (event) => {
    if (event.type === 'sync:progress') {
      if (get().syncCancelling) return
      set({
        syncProgress: event.progress,
        statusText: formatSyncStatus(event.progress),
      })
    }
    if (event.type === 'sync:done') {
      const counts =
        event.summary.failed > 0
          ? `${event.summary.succeeded} ok, ${event.summary.failed} failed`
          : `${event.summary.succeeded} ok`
      const { compareRunId, compareFilter, comparePathPrefix, pendingSyncPrefix } = get()
      const nextPrefix =
        !pendingSyncPrefix ||
        comparePathPrefix === pendingSyncPrefix ||
        (pendingSyncPrefix !== '' && comparePathPrefix.startsWith(`${pendingSyncPrefix}/`))
          ? ''
          : comparePathPrefix
      set({
        syncBusy: false,
        syncCancelling: false,
        pendingSyncPrefix: '',
        pendingSyncDeletes: 0,
        comparePathPrefix: nextPrefix,
        compareStats: event.summary.stats ?? get().compareStats,
        statusText: event.summary.cancelled ? `Sync cancelled · ${counts}` : `Sync finished · ${counts}`,
        logs: [
          {
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString(),
            message: event.summary.cancelled
              ? event.summary.failed > 0
                ? `Sync cancelled: ${event.summary.succeeded} succeeded, ${event.summary.failed} failed`
                : `Sync cancelled: ${event.summary.succeeded} succeeded`
              : `Sync complete: ${event.summary.succeeded} succeeded, ${event.summary.failed} failed`,
            level: event.summary.failed > 0 ? 'error' : event.summary.cancelled ? 'info' : 'success',
          },
          ...get().logs,
        ],
      })
      if (compareRunId) {
        void Promise.all([
          loadCompareRows(compareRunId, compareFilter, nextPrefix),
          loadCompareTree(compareRunId, compareFilter),
        ]).then(([compareRows, compareFolderTree]) => {
          set({ compareRows, compareFolderTree, selectedRow: null })
        })
      }
    }
    if (event.type === 'compare:progress') {
      const path = event.currentPath?.trim()
      const isPhase = Boolean(path && /…$/.test(path) && !path.includes('/') && !path.includes('\\'))
      if (isPhase) {
        set({ statusText: path })
        return
      }
      if (event.done <= 0) {
        set({ statusText: path ? `Comparing… ${path}` : 'Comparing…' })
        return
      }
      const count = event.done.toLocaleString()
      set({
        statusText: path ? `Comparing… ${count} items · ${path}` : `Comparing… ${count} items`,
      })
    }
  },
}))

export function shouldShowUpdateBanner(state: WorkbenchState): boolean {
  return !state.updateDismissed && state.pendingUpdate !== null
}
