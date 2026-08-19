import { existsSync } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { ZodType } from 'zod'
import { ioError, ok, validationError, type Result } from '@shared/result'
import { mfeRevealUri } from '@shared/shell/mfe'
import { IPC_CHANNELS, EVENT_CHANNELS } from '@shared/ipc/contract'
import {
  adsCopyRequestSchema,
  adsListRequestSchema,
  adsReadStreamRequestSchema,
  compareCancelRequestSchema,
  compareGetRowsRequestSchema,
  compareGetTreeRequestSchema,
  compareDropRequestSchema,
  compareRunRequestSchema,
  compareSetRowIncludedRequestSchema,
  jobIdRequestSchema,
  jobImportPathRequestSchema,
  jobSaveRequestSchema,
  pickFileRequestSchema,
  saveFileRequestSchema,
  pickFolderRequestSchema,
  runUpdateRequestSchema,
  showItemInFolderRequestSchema,
  openPathRequestSchema,
  clearReadOnlyRequestSchema,
  settingsSetRequestSchema,
  settingsPathRequestSchema,
  syncCancelRequestSchema,
  syncGetProgressRequestSchema,
  syncRunRequestSchema,
  watchJobRequestSchema,
} from '@shared/schemas/ipc'
import { requireAbsolute } from '../security/paths'
import { listStreams } from '../ads/list'
import { readStreamText } from '../ads/readStream'
import { copyStreams } from '../ads/copyStreams'
import { loadSettings, saveSettings } from '../settings/store'
import { exportSettings, importSettings } from '../settings/exportImport'
import { checkForUpdates } from '../updates/check'
import { runInstaller } from '../updates/run'
import { deleteJob, importJobJson, listJobs, loadJob, saveJob } from '../jobs/store'
import { importIni } from '../jobs/importIni'
import { importFfs } from '../jobs/importFfs'
import {
  cancelCompareRun,
  dropCompareRows,
  getCompareFolderTree,
  getCompareRows,
  getCompareRun,
  runCompare,
  setRowIncluded,
} from '../compare/run'
import { cancelSyncRun, executeSync, getSyncRun } from '../sync/execute'
import { clearReadOnly } from '../win32/attrs'
import { startWatch, stopWatch, startWatchForEnabledJobs } from '../watch/realtime'

type Handler<TReq, TRes> = (req: TReq) => Promise<Result<TRes>> | Result<TRes>

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function emitEvent(event: unknown): void {
  getMainWindow()?.webContents.send(EVENT_CHANNELS.SYNC_EVENT, event)
}

function handle<TReq, TRes>(
  channel: string,
  schema: ZodType<TReq>,
  fn: Handler<TReq, TRes>,
): void {
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    const parsed = schema.safeParse(payload ?? {})
    if (!parsed.success) {
      return validationError(parsed.error.message)
    }

    try {
      return await fn(parsed.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return validationError(message)
    }
  })
}

function handleEmpty<TRes>(channel: string, fn: () => Promise<Result<TRes>> | Result<TRes>): void {
  ipcMain.handle(channel, async () => {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return validationError(message)
    }
  })
}

export function registerIpc(appVersion: string): void {
  void startWatchForEnabledJobs()
  ipcMain.handle(IPC_CHANNELS.APP_READY, async () =>
    ok({ platform: process.platform, version: appVersion }),
  )

  ipcMain.handle(IPC_CHANNELS.APP_PICK_FOLDER, async (_event, payload: unknown) => {
    const parsed = pickFolderRequestSchema.safeParse(payload ?? {})
    if (!parsed.success) return validationError(parsed.error.message)
    try {
      const req = parsed.data
      const window = getMainWindow()
      const options = {
        title: req.title ?? 'Choose folder',
        defaultPath: req.defaultPath,
        properties: ['openDirectory'] as Array<'openDirectory'>,
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return ok({ path: null as string | null })
      return ok({ path: requireAbsolute(result.filePaths[0]) })
    } catch (error) {
      return validationError(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_PICK_FILE, async (_event, payload: unknown) => {
    const parsed = pickFileRequestSchema.safeParse(payload ?? {})
    if (!parsed.success) return validationError(parsed.error.message)
    try {
      const req = parsed.data
      const window = getMainWindow()
      const options = {
        title: req.title ?? 'Choose file',
        filters: req.filters,
        defaultPath: req.defaultPath,
        properties: ['openFile'] as Array<'openFile'>,
      }
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options)
      if (result.canceled || !result.filePaths[0]) return ok({ path: null as string | null })
      return ok({ path: requireAbsolute(result.filePaths[0]) })
    } catch (error) {
      return validationError(error instanceof Error ? error.message : String(error))
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_SAVE_FILE, async (_event, payload: unknown) => {
    const parsed = saveFileRequestSchema.safeParse(payload ?? {})
    if (!parsed.success) return validationError(parsed.error.message)
    try {
      const req = parsed.data
      const window = getMainWindow()
      const options = {
        title: req.title ?? 'Save file',
        filters: req.filters,
        defaultPath: req.defaultPath,
      }
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return ok({ path: null as string | null })
      return ok({ path: requireAbsolute(result.filePath) })
    } catch (error) {
      return validationError(error instanceof Error ? error.message : String(error))
    }
  })

  handleEmpty(IPC_CHANNELS.SETTINGS_GET, async () => ok(await loadSettings()))
  handle(IPC_CHANNELS.SETTINGS_SET, settingsSetRequestSchema, async (partial) =>
    ok(await saveSettings(partial)),
  )
  handle(IPC_CHANNELS.SETTINGS_EXPORT, settingsPathRequestSchema, async (req) =>
    exportSettings(requireAbsolute(req.path)),
  )
  handle(IPC_CHANNELS.SETTINGS_IMPORT, settingsPathRequestSchema, async (req) =>
    importSettings(requireAbsolute(req.path)),
  )
  handleEmpty(IPC_CHANNELS.APP_CHECK_FOR_UPDATES, async () => {
    const settings = await loadSettings()
    return ok(await checkForUpdates(settings.updatesFolder, appVersion))
  })
  handle(IPC_CHANNELS.APP_RUN_UPDATE, runUpdateRequestSchema, async (req) =>
    runInstaller(requireAbsolute(req.installerPath)),
  )
  handle(IPC_CHANNELS.APP_SHOW_ITEM_IN_FOLDER, showItemInFolderRequestSchema, async (req) => {
    const filePath = requireAbsolute(req.path)
    if (!existsSync(filePath)) {
      return validationError('That file or folder is not on disk.')
    }
    try {
      await shell.openExternal(mfeRevealUri(filePath))
    } catch (error) {
      return ioError(
        'Could not reveal that path in the file explorer.',
        error instanceof Error ? error.message : String(error),
      )
    }
    return ok({ ok: true as const })
  })
  handle(IPC_CHANNELS.APP_OPEN_PATH, openPathRequestSchema, async (req) => {
    const filePath = requireAbsolute(req.path)
    if (!existsSync(filePath)) {
      return validationError('That file or folder is not on disk.')
    }
    const error = await shell.openPath(filePath)
    if (error) {
      return ioError('Windows could not open that file or folder.', error)
    }
    return ok({ ok: true as const })
  })
  handle(IPC_CHANNELS.PATH_CLEAR_READ_ONLY, clearReadOnlyRequestSchema, async (req) => {
    const filePath = requireAbsolute(req.path)
    return clearReadOnly(filePath)
  })

  handleEmpty(IPC_CHANNELS.JOB_LIST, async () => ok({ jobs: await listJobs() }))
  handle(IPC_CHANNELS.JOB_GET, jobIdRequestSchema, async (req) => {
    const result = await loadJob(req.id)
    if (!result.ok) return result
    return ok({ job: result.value })
  })
  handle(IPC_CHANNELS.JOB_SAVE, jobSaveRequestSchema, async (req) => {
    const saved = await saveJob(req.job)
    if (!saved.ok) return saved
    await stopWatch(saved.value.id)
    if (saved.value.watch.enabled) await startWatch(saved.value.id)
    return ok({ id: saved.value.id })
  })
  handle(IPC_CHANNELS.JOB_DELETE, jobIdRequestSchema, async (req) => {
    await stopWatch(req.id)
    return deleteJob(req.id)
  })
  handle(IPC_CHANNELS.JOB_IMPORT_JSON, jobImportPathRequestSchema, async (req) => {
    const result = await importJobJson(requireAbsolute(req.path))
    if (!result.ok) return result
    return ok({ id: result.value.id })
  })
  handle(IPC_CHANNELS.JOB_IMPORT_INI, jobImportPathRequestSchema, async (req) => {
    const imported = await importIni(requireAbsolute(req.path))
    if (!imported.ok) return imported
    const saved = await saveJob(imported.value.job)
    if (!saved.ok) return saved
    return ok({ id: saved.value.id, warnings: imported.value.warnings })
  })
  handle(IPC_CHANNELS.JOB_IMPORT_FFS, jobImportPathRequestSchema, async (req) => {
    const imported = await importFfs(requireAbsolute(req.path))
    if (!imported.ok) return imported
    const saved = await saveJob(imported.value.job)
    if (!saved.ok) return saved
    return ok({ id: saved.value.id, warnings: imported.value.warnings })
  })

  handle(IPC_CHANNELS.COMPARE_RUN, compareRunRequestSchema, async (req) => {
    const runId = req.runId ?? crypto.randomUUID()
    try {
      const run = await runCompare(runId, req.jobId, (event) => emitEvent(event), req.job)
      return ok({
        runId,
        rowCount: run.stats.total,
        stats: run.stats,
        cancelled: run.cancelled,
      })
    } catch (error) {
      return validationError(error instanceof Error ? error.message : String(error))
    }
  })
  handle(IPC_CHANNELS.COMPARE_GET_ROWS, compareGetRowsRequestSchema, async (req) =>
    ok(await getCompareRows(req.runId, req.offset, req.limit, req.filter ?? 'all', req.pathPrefix ?? '')),
  )
  handle(IPC_CHANNELS.COMPARE_GET_TREE, compareGetTreeRequestSchema, async (req) =>
    ok({ root: await getCompareFolderTree(req.runId, req.filter ?? 'all') }),
  )
  handle(IPC_CHANNELS.COMPARE_CANCEL, compareCancelRequestSchema, (req) => {
    cancelCompareRun(req.runId)
    return ok({ ok: true as const })
  })
  handle(IPC_CHANNELS.COMPARE_SET_ROW_INCLUDED, compareSetRowIncludedRequestSchema, (req) => {
    const updated = setRowIncluded(req.runId, req.rowId, req.included)
    if (!updated) return validationError('Compare run or row not found.')
    const run = getCompareRun(req.runId)
    return ok({ ok: true as const, stats: run?.stats })
  })
  handle(IPC_CHANNELS.COMPARE_DROP, compareDropRequestSchema, async (req) => {
    const dropped = await dropCompareRows(req.runId, {
      pathPrefix: req.pathPrefix,
      folderName: req.folderName,
    })
    if (!dropped) return validationError('Compare run not found. Run Compare first.')
    return ok(dropped)
  })

  handle(IPC_CHANNELS.SYNC_RUN, syncRunRequestSchema, async (req) => {
    const jobResult = await loadJob(req.jobId)
    if (!jobResult.ok) return jobResult
    const compareRun = getCompareRun(req.runId)
    if (!compareRun) return validationError('Compare run not found. Run Compare first.')

    const syncRunId = crypto.randomUUID()
    void executeSync(
      syncRunId,
      jobResult.value,
      compareRun.store,
      (event) => emitEvent(event),
      req.pathPrefix ?? '',
      req.rowIds,
    ).then(() => {
      compareRun.stats = compareRun.store.getStats()
    })
    return ok({ syncRunId })
  })
  handle(IPC_CHANNELS.SYNC_CANCEL, syncCancelRequestSchema, (req) => {
    cancelSyncRun(req.syncRunId)
    return ok({ ok: true as const })
  })
  handle(IPC_CHANNELS.SYNC_GET_PROGRESS, syncGetProgressRequestSchema, (req) => {
    const run = getSyncRun(req.syncRunId)
    if (!run) return validationError('Sync run not found.')
    return ok(run.progress)
  })

  handle(IPC_CHANNELS.ADS_LIST, adsListRequestSchema, async (req) => {
    const filePath = requireAbsolute(req.path)
    const result = await listStreams(filePath)
    if (!result.ok) return result
    return ok({ path: filePath, manifest: result.value })
  })
  handle(IPC_CHANNELS.ADS_READ_STREAM, adsReadStreamRequestSchema, async (req) => {
    const filePath = requireAbsolute(req.path)
    return readStreamText(filePath, req.streamName)
  })
  handle(IPC_CHANNELS.ADS_COPY, adsCopyRequestSchema, async (req) => {
    const sourcePath = requireAbsolute(req.sourcePath)
    const destPath = requireAbsolute(req.destPath)
    const result = await copyStreams(sourcePath, destPath, {
      excludeStreams: req.excludeStreams,
    })
    if (!result.ok) return result
    return ok({ sourcePath, destPath, copiedStreams: result.value.copiedStreams })
  })

  handle(IPC_CHANNELS.WATCH_START, watchJobRequestSchema, async (req) => {
    await startWatch(req.jobId)
    return ok({ ok: true as const })
  })
  handle(IPC_CHANNELS.WATCH_STOP, watchJobRequestSchema, async (req) => {
    await stopWatch(req.jobId)
    return ok({ ok: true as const })
  })
}
