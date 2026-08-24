import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, EVENT_CHANNELS } from '@shared/ipc/contract'
import type { MyFileSyncApi, SyncEvent } from '@shared/ipc/api'
import type { Result } from '@shared/result'
import type { JobFile } from '@shared/schemas/job'
import type { Settings } from '@shared/schemas/settings'

async function invoke<T>(channel: string, payload?: unknown): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<Result<T>>
}

const api: MyFileSyncApi = {
  ready: () => invoke(IPC_CHANNELS.APP_READY),
  pickFolder: (req) => invoke(IPC_CHANNELS.APP_PICK_FOLDER, req ?? {}),
  pickFile: (req) => invoke(IPC_CHANNELS.APP_PICK_FILE, req ?? {}),
  saveFile: (req) => invoke(IPC_CHANNELS.APP_SAVE_FILE, req ?? {}),
  checkForUpdates: () => invoke(IPC_CHANNELS.APP_CHECK_FOR_UPDATES),
  runUpdate: (req) => invoke(IPC_CHANNELS.APP_RUN_UPDATE, req),
  showItemInFolder: (req) => invoke(IPC_CHANNELS.APP_SHOW_ITEM_IN_FOLDER, req),
  openPath: (req) => invoke(IPC_CHANNELS.APP_OPEN_PATH, req),
  clearReadOnly: (req) => invoke(IPC_CHANNELS.PATH_CLEAR_READ_ONLY, req),
  pairRootsCheck: (req) => invoke(IPC_CHANNELS.PAIR_ROOTS_CHECK, req),
  pairRootsCreate: (req) => invoke(IPC_CHANNELS.PAIR_ROOTS_CREATE, req),
  settingsGet: () => invoke(IPC_CHANNELS.SETTINGS_GET),
  settingsSet: (partial: Partial<Settings>) => invoke(IPC_CHANNELS.SETTINGS_SET, partial),
  settingsExport: (req) => invoke(IPC_CHANNELS.SETTINGS_EXPORT, req),
  settingsImport: (req) => invoke(IPC_CHANNELS.SETTINGS_IMPORT, req),
  jobList: () => invoke(IPC_CHANNELS.JOB_LIST),
  jobGet: (req) => invoke(IPC_CHANNELS.JOB_GET, req),
  jobSave: async (req: { job: JobFile }) => {
    const result = await invoke<{ id: string }>(IPC_CHANNELS.JOB_SAVE, req)
    return result
  },
  jobDelete: (req) => invoke(IPC_CHANNELS.JOB_DELETE, req),
  jobImportJson: (req) => invoke(IPC_CHANNELS.JOB_IMPORT_JSON, req),
  jobImportIni: (req) => invoke(IPC_CHANNELS.JOB_IMPORT_INI, req),
  jobImportFfs: (req) => invoke(IPC_CHANNELS.JOB_IMPORT_FFS, req),
  jobExportFfs: (req) => invoke(IPC_CHANNELS.JOB_EXPORT_FFS, req),
  compareRun: (req) => invoke(IPC_CHANNELS.COMPARE_RUN, req),
  compareGetRows: (req) => invoke(IPC_CHANNELS.COMPARE_GET_ROWS, req),
  compareGetTree: (req) => invoke(IPC_CHANNELS.COMPARE_GET_TREE, req),
  compareCancel: (req) => invoke(IPC_CHANNELS.COMPARE_CANCEL, req ?? {}),
  compareSetRowIncluded: (req) => invoke(IPC_CHANNELS.COMPARE_SET_ROW_INCLUDED, req),
  compareDrop: (req) => invoke(IPC_CHANNELS.COMPARE_DROP, req),
  syncRun: (req) => invoke(IPC_CHANNELS.SYNC_RUN, req),
  syncCancel: (req) => invoke(IPC_CHANNELS.SYNC_CANCEL, req ?? {}),
  syncGetProgress: (req) => invoke(IPC_CHANNELS.SYNC_GET_PROGRESS, req),
  onSyncEvent: (listener: (event: SyncEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SyncEvent) => listener(data)
    ipcRenderer.on(EVENT_CHANNELS.SYNC_EVENT, handler)
    return () => ipcRenderer.removeListener(EVENT_CHANNELS.SYNC_EVENT, handler)
  },
  adsList: (req) => invoke(IPC_CHANNELS.ADS_LIST, req),
  adsReadStream: (req) => invoke(IPC_CHANNELS.ADS_READ_STREAM, req),
  adsCopy: (req) => invoke(IPC_CHANNELS.ADS_COPY, req),
  watchStart: (req) => invoke(IPC_CHANNELS.WATCH_START, req),
  watchStop: (req) => invoke(IPC_CHANNELS.WATCH_STOP, req),
}

contextBridge.exposeInMainWorld('myFileSync', api)
