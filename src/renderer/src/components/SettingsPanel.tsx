type SettingsPanelProps = {
  updatesFolder: string
  updatesStatus: string
  busy: boolean
  onBrowseUpdatesFolder: () => void
  onCheckForUpdates: () => void
  onExportSettings: () => void
  onImportSettings: () => void
}

export function SettingsPanel({
  updatesFolder,
  updatesStatus,
  busy,
  onBrowseUpdatesFolder,
  onCheckForUpdates,
  onExportSettings,
  onImportSettings,
}: SettingsPanelProps) {
  return (
    <section className="settings-panel">
      <h2 className="settings-title">Settings</h2>

      <div className="settings-field">
        <label className="settings-label" htmlFor="updates-folder">
          Updates folder
        </label>
        <p className="settings-hint">
          Folder scanned for <code>MyFileSync-Setup-*.exe</code> installers.
        </p>
        <div className="settings-row">
          <input
            id="updates-folder"
            className="settings-input"
            type="text"
            readOnly
            value={updatesFolder || 'Not set'}
          />
          <button type="button" className="button" disabled={busy} onClick={onBrowseUpdatesFolder}>
            Browse…
          </button>
          <button
            type="button"
            className="button"
            disabled={busy || !updatesFolder}
            onClick={onCheckForUpdates}
          >
            Check for updates
          </button>
        </div>
        {updatesStatus ? <p className="settings-status">{updatesStatus}</p> : null}
      </div>

      <div className="settings-field">
        <span className="settings-label">App settings</span>
        <div className="settings-row">
          <button type="button" className="button" disabled={busy} onClick={onExportSettings}>
            Export settings…
          </button>
          <button type="button" className="button" disabled={busy} onClick={onImportSettings}>
            Import settings…
          </button>
        </div>
      </div>
    </section>
  )
}
