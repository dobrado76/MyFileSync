import type { Result } from '../result'
import type { AdsManifest } from '../ads/paths'
import type { Settings } from '../schemas/settings'
import type { JobFile, JobSummary } from '../schemas/job'
import type {
  CompareFilter,
  CompareRow,
  CompareStats,
  FolderTreeNode,
  SyncFailure,
  SyncProgress,
  SyncSummary,
} from '../schemas/compare'

export type AppReadyResponse = {
  platform: NodeJS.Platform
  version: string
}

export type PickFolderRequest = { title?: string; defaultPath?: string }
export type PickFolderResponse = { path: string | null }
export type PickFileRequest = {
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
  defaultPath?: string
}
export type PickFileResponse = { path: string | null }
export type SaveFileRequest = PickFileRequest
export type SaveFileResponse = { path: string | null }

export type UpdateCheckResponse = {
  status:
    | 'no-folder'
    | 'folder-missing'
    | 'no-installers'
    | 'up-to-date'
    | 'update-available'
  folder?: string
  currentVersion?: string
  latestVersion?: string
  installerPath?: string
  latestInstallerPath?: string
}

export type RunUpdateRequest = { installerPath: string }
export type RunUpdateResponse = { launched: true }

export type ShowItemInFolderRequest = { path: string }
export type ShowItemInFolderResponse = { ok: true }
export type OpenPathRequest = { path: string }
export type OpenPathResponse = { ok: true }

export type ClearReadOnlyRequest = { path: string }
export type ClearReadOnlyResponse = { ok: true }

export type AdsListRequest = { path: string }
export type AdsListResponse = { path: string; manifest: AdsManifest }
export type AdsCopyRequest = {
  sourcePath: string
  destPath: string
  excludeStreams?: string[]
}
export type AdsCopyResponse = {
  sourcePath: string
  destPath: string
  copiedStreams: string[]
}

export type CompareRunResponse = {
  runId: string
  rowCount: number
  stats: CompareStats
  cancelled: boolean
}

export type CompareGetRowsResponse = { rows: CompareRow[]; total: number }
export type CompareGetTreeResponse = { root: FolderTreeNode }

export type CompareDropResponse = { dropped: number; stats: CompareStats }

export type SyncRunResponse = { syncRunId: string }

export type SyncEvent =
  | { type: 'compare:progress'; runId: string; done: number; total: number; currentPath?: string }
  | { type: 'compare:done'; runId: string; stats: CompareStats }
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

export type MyFileSyncApi = {
  ready: () => Promise<Result<AppReadyResponse>>
  pickFolder: (req?: PickFolderRequest) => Promise<Result<PickFolderResponse>>
  pickFile: (req?: PickFileRequest) => Promise<Result<PickFileResponse>>
  saveFile: (req?: SaveFileRequest) => Promise<Result<SaveFileResponse>>
  checkForUpdates: () => Promise<Result<UpdateCheckResponse>>
  runUpdate: (req: RunUpdateRequest) => Promise<Result<RunUpdateResponse>>
  showItemInFolder: (req: ShowItemInFolderRequest) => Promise<Result<ShowItemInFolderResponse>>
  openPath: (req: OpenPathRequest) => Promise<Result<OpenPathResponse>>
  clearReadOnly: (req: ClearReadOnlyRequest) => Promise<Result<ClearReadOnlyResponse>>
  settingsGet: () => Promise<Result<Settings>>
  settingsSet: (partial: Partial<Settings>) => Promise<Result<Settings>>
  settingsExport: (req: { path: string }) => Promise<Result<{ path: string }>>
  settingsImport: (req: { path: string }) => Promise<Result<Settings>>
  jobList: () => Promise<Result<{ jobs: JobSummary[] }>>
  jobGet: (req: { id: string }) => Promise<Result<{ job: JobFile }>>
  jobSave: (req: { job: JobFile }) => Promise<Result<{ id: string }>>
  jobDelete: (req: { id: string }) => Promise<Result<{ ok: true }>>
  jobImportJson: (req: { path: string }) => Promise<Result<{ id: string }>>
  jobImportIni: (req: { path: string }) => Promise<Result<{ id: string; warnings: string[] }>>
  jobImportFfs: (req: { path: string }) => Promise<Result<{ id: string; warnings: string[] }>>
  compareRun: (req: {
    jobId: string
    runId?: string
    job?: JobFile
  }) => Promise<Result<CompareRunResponse>>
  compareGetRows: (req: {
    runId: string
    offset: number
    limit: number
    filter?: CompareFilter
    pathPrefix?: string
  }) => Promise<Result<CompareGetRowsResponse>>
  compareGetTree: (req: {
    runId: string
    filter?: CompareFilter
  }) => Promise<Result<CompareGetTreeResponse>>
  compareCancel: (req?: { runId?: string }) => Promise<Result<{ ok: true }>>
  compareSetRowIncluded: (req: {
    runId: string
    rowId: string
    included: boolean
  }) => Promise<Result<{ ok: true; stats?: CompareStats }>>
  compareDrop: (req: {
    runId: string
    pathPrefix?: string
    folderName?: string
  }) => Promise<Result<CompareDropResponse>>
  syncRun: (req: {
    jobId: string
    runId: string
    pathPrefix?: string
    rowIds?: string[]
  }) => Promise<Result<SyncRunResponse>>
  syncCancel: (req?: { syncRunId?: string }) => Promise<Result<{ ok: true }>>
  syncGetProgress: (req: { syncRunId: string }) => Promise<Result<SyncProgress>>
  onSyncEvent: (listener: (event: SyncEvent) => void) => () => void
  adsList: (req: AdsListRequest) => Promise<Result<AdsListResponse>>
  adsReadStream: (req: {
    path: string
    streamName: string
  }) => Promise<Result<{ text: string; truncated: boolean; size: number }>>
  adsCopy: (req: AdsCopyRequest) => Promise<Result<AdsCopyResponse>>
  watchStart: (req: { jobId: string }) => Promise<Result<{ ok: true }>>
  watchStop: (req: { jobId: string }) => Promise<Result<{ ok: true }>>
}

declare global {
  interface Window {
    myFileSync: MyFileSyncApi
  }
}

export {}
