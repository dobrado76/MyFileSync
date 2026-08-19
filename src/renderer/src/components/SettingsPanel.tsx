import { useState, type ReactNode } from 'react'
import { settingsMatch } from '@shared/settings/search'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { SettingsSearchField } from './SettingsSearchField'

type SettingsPanelProps = {
  updatesFolder: string
  updatesStatus: string
  hardwareAcceleration: boolean
  busy: boolean
  onBrowseUpdatesFolder: () => void
  onUpdatesFolderChange: (path: string) => void
  onCheckForUpdates: () => void
  onHardwareAccelerationChange: (enabled: boolean) => void
  onExportSettings: () => void
  onImportSettings: () => void
}

type SettingRow = {
  id: string
  keywords: string
  node: ReactNode
}

export function SettingsPanel({
  updatesFolder,
  updatesStatus,
  hardwareAcceleration,
  busy,
  onBrowseUpdatesFolder,
  onUpdatesFolderChange,
  onCheckForUpdates,
  onHardwareAccelerationChange,
  onExportSettings,
  onImportSettings,
}: SettingsPanelProps) {
  const [rawQuery, setRawQuery] = useState('')
  const query = useDebouncedValue(rawQuery, 160)

  const rows: SettingRow[] = [
    {
      id: 'updates',
      keywords: 'updates folder installer setup check for updates version release',
      node: (
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
      ),
    },
    {
      id: 'gpu',
      keywords: 'gpu hardware acceleration chromium disable flicker blank driver video',
      node: (
        <div className="settings-field">
          <span className="settings-label">Hardware acceleration</span>
          <p className="settings-hint">
            Uses the GPU for the window. Turn this off if the window flickers, stays blank, or the
            display driver is unstable. Restart MyFileSync after changing.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={hardwareAcceleration}
              disabled={busy}
              onChange={(e) => onHardwareAccelerationChange(e.target.checked)}
            />
            Use hardware acceleration (GPU)
          </label>
        </div>
      ),
    },
    {
      id: 'backup',
      keywords: 'backup restore export import app settings',
      node: (
        <div className="settings-field">
          <span className="settings-label">Backup / restore</span>
          <p className="settings-hint">
            Export or import app settings (updates folder, GPU, last job).
          </p>
          <div className="settings-row">
            <button type="button" className="button" disabled={busy} onClick={onExportSettings}>
              Export settings…
            </button>
            <button type="button" className="button" disabled={busy} onClick={onImportSettings}>
              Import settings…
            </button>
          </div>
        </div>
      ),
    },
  ]

  const visible = rows.filter((row) => settingsMatch(query, row.keywords, row.id))

  return (
    <>
      <SettingsSearchField value={rawQuery} onChange={setRawQuery} />
      {visible.length === 0 ? (
        <p className="settings-hint">No settings match “{query.trim()}”.</p>
      ) : (
        visible.map((row) => <div key={row.id}>{row.node}</div>)
      )}
    </>
  )
}
