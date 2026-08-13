import { useEffect } from 'react'
import { shouldShowUpdateBanner, useWorkbenchStore } from './store/workbenchStore'
import { StatusBar } from './components/StatusBar'
import { UpdateBanner } from './components/UpdateBanner'
import { SettingsModal } from './components/SettingsModal'
import { BackupMirrorWorkbench } from './components/BackupMirrorWorkbench'
import { SyncConfirmModal } from './components/SyncConfirmModal'
import { formatDisplayVersion } from '@shared/version'

export default function App() {
  const state = useWorkbenchStore()
  const {
    jobs,
    activeJob,
    activePairIndex,
    mainTab,
    compareRows,
    compareFolderTree,
    comparePathPrefix,
    compareFilter,
    compareBusy,
    compareStats,
    syncBusy,
    statusText,
    logs,
    showDeleteConfirm,
    pendingSyncDeletes,
    updatesFolder,
    updatesStatus,
    pendingUpdate,
    busy,
    selectedRow,
    settingsOpen,
    init,
    selectJob,
    newJob,
    saveActiveJob,
    deleteActiveJob,
    importJobFile,
    updateActiveJob,
    setMainTab,
    setActivePairIndex,
    addPair,
    removePair,
    movePair,
    flipPair,
    setPairPath,
    clearCompareList,
    browsePairPath,
    runCompare,
    runSync,
    confirmSync,
    cancelSyncConfirm,
    cancelOperation,
    setCompareFilter,
    selectCompareFolder,
    handleFolderAction,
    toggleRowIncluded,
    browseUpdatesFolder,
    setUpdatesFolder,
    checkForUpdates,
    runUpdate,
    dismissUpdate,
    exportSettings,
    importSettings,
    selectRow,
    openSettings,
    closeSettings,
    handleSyncEvent,
    appVersion,
  } = state

  useEffect(() => {
    void init()
    const unsub = window.myFileSync.onSyncEvent(handleSyncEvent)
    return unsub
  }, [init, handleSyncEvent])

  const showBanner = shouldShowUpdateBanner(state)

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
        <h1 className="app-title">MyFileSync</h1>
        <span className="app-subtitle">{formatDisplayVersion(appVersion)}</span>
        <div className="header-actions">
          <button type="button" className="button" onClick={openSettings}>
            Settings
          </button>
        </div>
      </header>

      <BackupMirrorWorkbench
        jobs={jobs}
        activeJob={activeJob}
        activePairIndex={activePairIndex}
        mainTab={mainTab}
        compareRows={compareRows}
        compareFolderTree={compareFolderTree}
        comparePathPrefix={comparePathPrefix}
        compareFilter={compareFilter}
        compareBusy={compareBusy}
        compareStats={compareStats}
        syncBusy={syncBusy}
        selectedRow={selectedRow}
        logs={logs}
        busy={busy}
        onMainTabChange={setMainTab}
        onSelectJob={(id) => void selectJob(id)}
        onNewJob={() => void newJob()}
        onImportJob={() => void importJobFile()}
        onChangeJob={updateActiveJob}
        onBrowsePath={(index, side) => void browsePairPath(index, side)}
        onSetPairPath={setPairPath}
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
        onFolderAction={(action, path, deletes) => void handleFolderAction(action, path, deletes)}
        onToggleIncluded={(id, included) => void toggleRowIncluded(id, included)}
        onSelectRow={selectRow}
        onPairIndexChange={setActivePairIndex}
      />

      <SettingsModal
        open={settingsOpen}
        updatesFolder={updatesFolder}
        updatesStatus={updatesStatus}
        busy={busy}
        onClose={closeSettings}
        onBrowseUpdatesFolder={() => void browseUpdatesFolder()}
        onUpdatesFolderChange={setUpdatesFolder}
        onCheckForUpdates={() => void checkForUpdates()}
        onExportSettings={() => void exportSettings()}
        onImportSettings={() => void importSettings()}
      />

      <SyncConfirmModal
        open={showDeleteConfirm}
        deleteCount={pendingSyncDeletes}
        onConfirm={() => void confirmSync()}
        onCancel={cancelSyncConfirm}
      />

      <StatusBar text={statusText} showElapsed={compareBusy || syncBusy} />
    </div>
  )
}
