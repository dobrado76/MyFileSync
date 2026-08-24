import { useEffect, useState } from 'react'
import { shouldShowUpdateBanner, isJobConfigLocked, useWorkbenchStore } from './store/workbenchStore'
import { StatusBar } from './components/StatusBar'
import { RunProgressPanel } from './components/RunProgressPanel'
import { UpdateBanner } from './components/UpdateBanner'
import { SettingsModal } from './components/SettingsModal'
import { BackupMirrorWorkbench } from './components/BackupMirrorWorkbench'
import { SyncConfirmModal } from './components/SyncConfirmModal'
import { CreateFolderModal } from './components/CreateFolderModal'
import { SyncFailuresModal } from './components/SyncFailuresModal'
import { formatDisplayVersion } from '@shared/version'

export default function App() {
  const state = useWorkbenchStore()
  const {
    jobs,
    activeJob,
    activePairIndex,
    mainTab,
    compareRows,
    compareRowOffset,
    compareRowTotal,
    compareFolderTree,
    compareRunId,
    comparePathPrefix,
    compareFilter,
    compareBusy,
    compareProgress,
    compareStats,
    syncProgress,
    syncBusy,
    progressUiExpanded,
    progressPanelWidth,
    progressStartedAt,
    progressSamples,
    syncQueued,
    statusText,
    logs,
    showDeleteConfirm,
    pendingSyncDeletes,
    showCreateFolderConfirm,
    pendingMissingRoots,
    createFolderBusy,
    updatesFolder,
    updatesStatus,
    hardwareAcceleration,
    confirmMirrorDeletes,
    pendingUpdate,
    busy,
    selectedRow,
    settingsOpen,
    compareCancelled,
    syncCancelling,
    init,
    selectJob,
    newJob,
    saveActiveJob,
    deleteActiveJob,
    importJobFile,
    exportJobFfs,
    updateActiveJob,
    setMainTab,
    setActivePairIndex,
    addPair,
    removePair,
    movePair,
    flipPair,
    setPairPath,
    setPairEnabled,
    setPairAds,
    setPairListHeight,
    clearCompareList,
    browsePairPath,
    runCompare,
    runSync,
    confirmSync,
    cancelSyncConfirm,
    confirmCreateFolders,
    cancelCreateFolderConfirm,
    cancelOperation,
    setCompareFilter,
    selectCompareFolder,
    loadCompareWindow,
    handleFolderAction,
    openDiskPath,
    revealDiskPath,
    toggleRowIncluded,
    browseUpdatesFolder,
    setUpdatesFolder,
    setHardwareAcceleration,
    setConfirmMirrorDeletes,
    setProgressUiExpanded,
    setProgressPanelWidth,
    setProgressChartPixels,
    checkForUpdates,
    runUpdate,
    dismissUpdate,
    exportSettings,
    importSettings,
    selectRow,
    openSettings,
    closeSettings,
    handleSyncEvent,
    catchUpProgressSample,
    appVersion,
    syncFailures,
    showSyncFailures,
    syncSucceededCount,
    failureFixRowId,
    failureFixStatus,
    dismissSyncFailures,
    retryFailedSync,
    viewSyncErrorsInGrid,
    showFailureInFolder,
    clearFailureReadOnly,
  } = state

  useEffect(() => {
    void init()
    const unsub = window.myFileSync.onSyncEvent(handleSyncEvent)
    return unsub
  }, [init, handleSyncEvent])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.shiftKey) return
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      void saveActiveJob()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveActiveJob])

  const showBanner = shouldShowUpdateBanner(state)
  const configLocked = isJobConfigLocked(compareBusy, syncBusy)
  const runBusy = compareBusy || syncBusy
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!runBusy) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [runBusy])

  useEffect(() => {
    if (!runBusy) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now())
        catchUpProgressSample()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [runBusy, catchUpProgressSample])

  return (
    <div className="app">
      {showBanner && pendingUpdate ? (
        <UpdateBanner
          currentVersion={pendingUpdate.currentVersion}
          latestVersion={pendingUpdate.latestVersion}
          busy={busy}
          onInstall={() => void runUpdate()}
          onDismiss={dismissUpdate}
        />
      ) : null}

      <header className="app-header app-header-compact">
        <div className="app-header-start">
          <h1 className="app-title">MyFileSync</h1>
          <span className="app-subtitle">{formatDisplayVersion(appVersion)}</span>
        </div>
        <div className="app-header-center">
          <label className="bm-field" htmlFor="job-select">
            <span className="bm-label">Job</span>
            <select
              id="job-select"
              className="bm-control bm-job-dropdown"
              value={activeJob?.id ?? ''}
              disabled={configLocked}
              onChange={(e) => void selectJob(e.target.value)}
              title={
                configLocked
                  ? 'Finish or cancel compare/sync before switching jobs'
                  : 'Switch between saved jobs'
              }
            >
              {jobs.length === 0 ? <option value="">No jobs</option> : null}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-sm"
            disabled={configLocked}
            onClick={() => void newJob()}
            title={
              configLocked
                ? 'Finish or cancel compare/sync before creating a new job'
                : 'Create a new empty job'
            }
          >
            + New
          </button>
        </div>
        <div className="header-actions">
          <button type="button" className="button" onClick={openSettings}>
            Settings
          </button>
        </div>
      </header>

      <BackupMirrorWorkbench
        activeJob={activeJob}
        activePairIndex={activePairIndex}
        mainTab={mainTab}
        compareRows={compareRows}
        compareRowOffset={compareRowOffset}
        compareRowTotal={compareRowTotal}
        compareFolderTree={compareFolderTree}
        compareRunId={compareRunId}
        comparePathPrefix={comparePathPrefix}
        compareFilter={compareFilter}
        compareBusy={compareBusy}
        compareStats={compareStats}
        syncBusy={syncBusy}
        syncQueued={syncQueued}
        selectedRow={selectedRow}
        logs={logs}
        busy={busy}
        onMainTabChange={setMainTab}
        onImportJob={() => void importJobFile()}
        onExportJob={() => void exportJobFfs()}
        onChangeJob={updateActiveJob}
        onBrowsePath={(index, side) => void browsePairPath(index, side)}
        onSetPairPath={setPairPath}
        onSetPairEnabled={setPairEnabled}
        onSetPairAds={setPairAds}
        onSetPairListHeight={setPairListHeight}
        onVariantChange={(variant) => updateActiveJob({ variant })}
        onAddPair={addPair}
        onRemovePair={removePair}
        onMovePair={movePair}
        onFlipPair={flipPair}
        onClearList={clearCompareList}
        onSaveJob={() => void saveActiveJob()}
        onDeleteJob={() => {
          if (!activeJob) return
          if (
            window.confirm(
              `Delete job "${activeJob.name}"?\n\nThis removes it from your job list. It cannot be undone.`,
            )
          ) {
            void deleteActiveJob()
          }
        }}
        onCompare={() => void runCompare()}
        onSync={() => void runSync()}
        onCancel={() => void cancelOperation()}
        onFilterChange={(f) => void setCompareFilter(f)}
        onSelectFolder={(path) => void selectCompareFolder(path)}
        onRowsWindowChange={(offset, limit) => void loadCompareWindow(offset, limit)}
        onFolderAction={(action, path, deletes) => void handleFolderAction(action, path, deletes)}
        onOpenPath={(path) => void openDiskPath(path)}
        onRevealPath={(path) => void revealDiskPath(path)}
        onToggleIncluded={(id, included) => void toggleRowIncluded(id, included)}
        onSelectRow={selectRow}
        onPairIndexChange={setActivePairIndex}
        syncFailedRowIds={syncFailures.map((failure) => failure.rowId)}
        hasSyncErrors={syncFailures.length > 0}
        progressPanelWidth={progressPanelWidth}
        onProgressPanelWidth={setProgressPanelWidth}
        progressSidebar={
          runBusy && progressUiExpanded ? (
            <RunProgressPanel
              kind={syncBusy ? 'sync' : 'compare'}
              phaseLabel={
                syncBusy
                  ? syncProgress?.phase === 'finishing'
                    ? 'Finishing'
                    : syncProgress?.phase === 'deleting'
                      ? 'Deleting'
                      : syncProgress?.phase === 'preparing'
                        ? 'Preparing'
                        : 'Synchronizing'
                  : compareProgress?.phase === 'enumerating'
                    ? 'Enumerating'
                    : 'Comparing'
              }
              currentPath={syncBusy ? syncProgress?.currentPath : compareProgress?.currentPath}
              currentAction={syncBusy ? syncProgress?.currentAction : undefined}
              syncPhase={syncBusy ? syncProgress?.phase : undefined}
              itemsDone={syncBusy ? (syncProgress?.done ?? 0) : (compareProgress?.done ?? 0)}
              itemsTotal={syncBusy ? (syncProgress?.total ?? 0) : (compareProgress?.total ?? 0)}
              bytesDone={syncProgress?.bytesDone ?? 0}
              bytesTotal={syncProgress?.bytesTotal ?? 0}
              samples={progressSamples}
              startedAt={progressStartedAt ?? now}
              now={now}
              cancelling={syncBusy ? syncCancelling : compareCancelled}
              onMinimize={() => setProgressUiExpanded(false)}
              onCancel={() => void cancelOperation()}
              onPlotPhysicalWidth={setProgressChartPixels}
            />
          ) : undefined
        }
      />

      <SettingsModal
        open={settingsOpen}
        updatesFolder={updatesFolder}
        updatesStatus={updatesStatus}
        hardwareAcceleration={hardwareAcceleration}
        confirmMirrorDeletes={confirmMirrorDeletes}
        busy={busy}
        onClose={closeSettings}
        onBrowseUpdatesFolder={() => void browseUpdatesFolder()}
        onUpdatesFolderChange={setUpdatesFolder}
        onCheckForUpdates={() => void checkForUpdates()}
        onHardwareAccelerationChange={setHardwareAcceleration}
        onConfirmMirrorDeletesChange={setConfirmMirrorDeletes}
        onExportSettings={() => void exportSettings()}
        onImportSettings={() => void importSettings()}
      />

      <SyncConfirmModal
        open={showDeleteConfirm}
        deleteCount={pendingSyncDeletes}
        onConfirm={(dontShowAgain) => void confirmSync(dontShowAgain)}
        onCancel={cancelSyncConfirm}
      />

      <CreateFolderModal
        open={showCreateFolderConfirm}
        folders={pendingMissingRoots}
        busy={createFolderBusy}
        onConfirm={() => void confirmCreateFolders()}
        onCancel={cancelCreateFolderConfirm}
      />

      <SyncFailuresModal
        open={showSyncFailures}
        failures={syncFailures}
        succeeded={syncSucceededCount}
        busy={busy || syncBusy}
        fixingRowId={failureFixRowId}
        fixStatus={failureFixStatus}
        onDismiss={dismissSyncFailures}
        onRetry={() => void retryFailedSync()}
        onViewInGrid={() => void viewSyncErrorsInGrid()}
        onShowInFolder={(path) => void showFailureInFolder(path)}
        onClearReadOnly={(failure) => void clearFailureReadOnly(failure)}
      />

      <StatusBar
        text={statusText}
        showElapsed={runBusy}
        showExpand={runBusy && !progressUiExpanded}
        onExpand={() => setProgressUiExpanded(true)}
      />
    </div>
  )
}
