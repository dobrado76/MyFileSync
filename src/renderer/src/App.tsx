import { useEffect } from 'react'
import { shouldShowUpdateBanner, useWorkbenchStore } from './store/workbenchStore'
import { StatusBar } from './components/StatusBar'
import { UpdateBanner } from './components/UpdateBanner'
import { SettingsPanel } from './components/SettingsPanel'
import { JobsRail } from './components/JobsRail'
import { JobEditor } from './components/JobEditor'
import { CompareGrid } from './components/CompareGrid'
import { RowDetailPanel } from './components/RowDetailPanel'
import { RunLogPanel } from './components/RunLogPanel'
import { SyncConfirmModal } from './components/SyncConfirmModal'
import { formatDisplayVersion } from '@shared/version'

export default function App() {
  const state = useWorkbenchStore()
  const {
    jobs,
    activeJobId,
    activeJob,
    editorOpen,
    compareRows,
    compareFilter,
    compareBusy,
    compareStats,
    statusText,
    logs,
    showDeleteConfirm,
    updatesFolder,
    updatesStatus,
    pendingUpdate,
    busy,
    selectedRow,
    init,
    selectJob,
    newJob,
    importIni,
    openEditor,
    closeEditor,
    saveActiveJob,
    updateActiveJob,
    browsePairPath,
    runCompare,
    runSync,
    confirmSync,
    cancelSyncConfirm,
    setCompareFilter,
    toggleRowIncluded,
    browseUpdatesFolder,
    checkForUpdates,
    runUpdate,
    dismissUpdate,
    exportSettings,
    importSettings,
    selectRow,
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

      <header className="app-header">
        <div>
          <h1 className="app-title">MyFileSync</h1>
          <p className="app-subtitle">
            {formatDisplayVersion(appVersion)} · NTFS folder sync with ADS fidelity
          </p>
        </div>
        {activeJob ? (
          <div className="header-actions">
            <button type="button" className="button" onClick={openEditor}>
              Edit job
            </button>
            <button type="button" className="button" onClick={() => void saveActiveJob()}>
              Save
            </button>
          </div>
        ) : null}
      </header>

      <div className="workbench">
        <JobsRail
          jobs={jobs}
          activeJobId={activeJobId}
          onSelect={(id) => void selectJob(id)}
          onNew={() => void newJob()}
          onImportIni={() => void importIni()}
        />

        <div className="workbench-main">
          {compareStats ? (
            <p className="compare-summary">
              {compareStats.total} items · {compareStats.toSync} to sync · {compareStats.deletes}{' '}
              deletes
            </p>
          ) : null}

          <CompareGrid
            rows={compareRows}
            filter={compareFilter}
            busy={compareBusy}
            selectedRowId={selectedRow?.id ?? null}
            onFilterChange={(f) => void setCompareFilter(f)}
            onCompare={() => void runCompare()}
            onSync={() => void runSync()}
            onToggleIncluded={(id, included) => void toggleRowIncluded(id, included)}
            onSelectRow={selectRow}
          />

          <RowDetailPanel row={selectedRow} onClose={() => selectRow(null)} />

          <SettingsPanel
            updatesFolder={updatesFolder}
            updatesStatus={updatesStatus}
            busy={busy}
            onBrowseUpdatesFolder={() => void browseUpdatesFolder()}
            onCheckForUpdates={() => void checkForUpdates()}
            onExportSettings={() => void exportSettings()}
            onImportSettings={() => void importSettings()}
          />

          <RunLogPanel logs={logs} />
        </div>
      </div>

      {activeJob ? (
        <JobEditor
          job={activeJob}
          open={editorOpen}
          onClose={closeEditor}
          onSave={() => void saveActiveJob()}
          onChange={updateActiveJob}
          onBrowse={(pairId, side) => void browsePairPath(pairId, side)}
        />
      ) : null}

      <SyncConfirmModal
        open={showDeleteConfirm}
        deleteCount={compareStats?.deletes ?? 0}
        onConfirm={() => void confirmSync()}
        onCancel={cancelSyncConfirm}
      />

      <StatusBar text={statusText} />
    </div>
  )
}
