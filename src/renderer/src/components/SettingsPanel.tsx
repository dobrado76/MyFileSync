type SettingsPanelProps = {
  updatesFolder: string
  updatesStatus: string
  busy: boolean
  onBrowseUpdatesFolder: () => void
  onUpdatesFolderChange: (path: string) => void
  onCheckForUpdates: () => void
  onExportSettings: () => void
  onImportSettings: () => void
}

export function SettingsPanel({
  updatesFolder,
  updatesStatus,
  busy,
  onBrowseUpdatesFolder,
  onUpdatesFolderChange,
  onCheckForUpdates,
  onExportSettings,
  onImportSettings,
}: SettingsPanelProps) {
  return (
    <>
      <div className="settings-field">
        <label className="settings-label" htmlFor="updates-folder">
          Updates folder
        </label>
        <p className="settings-hint">
          Optional folder where you keep <code>MyFileSync-Setup-*.exe</code> installers. Updates are
          checked only when you click <strong>Check for updates</strong> below.
        </p>
        <div className="settings-row">
          <input
            id="updates-folder"
            className="settings-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={updatesFolder}
            placeholder="Updates folder"
            onChange={(e) => onUpdatesFolderChange(e.target.value)}
          />
          <button type="button" className="button" disabled={busy} onClick={onBrowseUpdatesFolder}>
            Browse…
          </button>
          <button type="button" className="button" disabled={busy} onClick={onCheckForUpdates}>
            Check for updates
          </button>
        </div>
        {updatesStatus ? <p className="settings-status">{updatesStatus}</p> : null}
      </div>

      <div className="settings-field">
        <span className="settings-label">Backup / restore</span>
        <p className="settings-hint">Export or import app settings (updates folder path).</p>
        <div className="settings-row">
          <button type="button" className="button" disabled={busy} onClick={onExportSettings}>
            Export settings…
          </button>
          <button type="button" className="button" disabled={busy} onClick={onImportSettings}>
            Import settings…
          </button>
        </div>
      </div>
    </>
  )
}
