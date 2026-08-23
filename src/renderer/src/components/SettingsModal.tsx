import { SettingsPanel } from './SettingsPanel'

type SettingsModalProps = {
  open: boolean
  updatesFolder: string
  updatesStatus: string
  hardwareAcceleration: boolean
  confirmMirrorDeletes: boolean
  busy: boolean
  onClose: () => void
  onBrowseUpdatesFolder: () => void
  onUpdatesFolderChange: (path: string) => void
  onCheckForUpdates: () => void
  onHardwareAccelerationChange: (enabled: boolean) => void
  onConfirmMirrorDeletesChange: (enabled: boolean) => void
  onExportSettings: () => void
  onImportSettings: () => void
}

export function SettingsModal({
  open,
  updatesFolder,
  updatesStatus,
  hardwareAcceleration,
  confirmMirrorDeletes,
  busy,
  onClose,
  onBrowseUpdatesFolder,
  onUpdatesFolderChange,
  onCheckForUpdates,
  onHardwareAccelerationChange,
  onConfirmMirrorDeletesChange,
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
            hardwareAcceleration={hardwareAcceleration}
            confirmMirrorDeletes={confirmMirrorDeletes}
            busy={busy}
            onBrowseUpdatesFolder={onBrowseUpdatesFolder}
            onUpdatesFolderChange={onUpdatesFolderChange}
            onCheckForUpdates={onCheckForUpdates}
            onHardwareAccelerationChange={onHardwareAccelerationChange}
            onConfirmMirrorDeletesChange={onConfirmMirrorDeletesChange}
            onExportSettings={onExportSettings}
            onImportSettings={onImportSettings}
          />
        </div>
      </div>
    </div>
  )
}
