import type { Result } from '../result'
import type { AdsManifest } from '../ads/paths'
import type { Settings } from '../schemas/settings'
import type { JobFile, JobSummary } from '../schemas/job'
import type {
  CompareFilter,
  CompareRow,
  CompareStats,
  SyncProgress,
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

export type SyncRunResponse = { syncRunId: string }

export type SyncEvent =
  | { type: 'compare:progress'; runId: string; done: number; total: number; currentPath?: string }
  | { type: 'compare:done'; runId: string; stats: CompareStats }
  | { type: 'sync:progress'; syncRunId: string; progress: SyncProgress }
  | { type: 'sync:itemDone'; syncRunId: string; rowId: string; ok: boolean; error?: string }
  | { type: 'sync:done'; syncRunId: string; summary: { succeeded: number; failed: number; cancelled: boolean } }

export type MyFileSyncApi = {
  ready: () => Promise<Result<AppReadyResponse>>
  pickFolder: (req?: PickFolderRequest) => Promise<Result<PickFolderResponse>>
  pickFile: (req?: PickFileRequest) => Promise<Result<PickFileResponse>>
  saveFile: (req?: SaveFileRequest) => Promise<Result<SaveFileResponse>>
  checkForUpdates: () => Promise<Result<UpdateCheckResponse>>
  runUpdate: (req: RunUpdateRequest) => Promise<Result<RunUpdateResponse>>
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
  compareRun: (req: { jobId: string; runId?: string }) => Promise<Result<CompareRunResponse>>
  compareGetRows: (req: {
    runId: string
    offset: number
    limit: number
    filter?: CompareFilter
  }) => Promise<Result<CompareGetRowsResponse>>
  compareCancel: (req?: { runId?: string }) => Promise<Result<{ ok: true }>>
  compareSetRowIncluded: (req: {
    runId: string
    rowId: string
    included: boolean
  }) => Promise<Result<{ ok: true; stats?: CompareStats }>>
  syncRun: (req: { jobId: string; runId: string }) => Promise<Result<SyncRunResponse>>
  syncCancel: (req: { syncRunId: string }) => Promise<Result<{ ok: true }>>
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
