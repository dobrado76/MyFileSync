import { SettingsPanel } from './SettingsPanel'

type SettingsModalProps = {
  open: boolean
  updatesFolder: string
  updatesStatus: string
  busy: boolean
  onClose: () => void
  onBrowseUpdatesFolder: () => void
  onCheckForUpdates: () => void
  onExportSettings: () => void
  onImportSettings: () => void
}

export function SettingsModal({
  open,
  updatesFolder,
  updatesStatus,
  busy,
  onClose,
  onBrowseUpdatesFolder,
  onCheckForUpdates,
  onExportSettings,
  onImportSettings,
}: SettingsModalProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body settings-modal-body">
          <SettingsPanel
            updatesFolder={updatesFolder}
            updatesStatus={updatesStatus}
            busy={busy}
            onBrowseUpdatesFolder={onBrowseUpdatesFolder}
            onCheckForUpdates={onCheckForUpdates}
            onExportSettings={onExportSettings}
            onImportSettings={onImportSettings}
          />
        </div>
      </div>
    </div>
  )
}
