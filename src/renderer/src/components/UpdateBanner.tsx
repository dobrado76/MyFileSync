import { formatDisplayVersion } from '@shared/version'

type UpdateBannerProps = {
  currentVersion: string
  latestVersion: string
  busy: boolean
  onInstall: () => void
  onDismiss: () => void
}

export function UpdateBanner({
  currentVersion,
  latestVersion,
  busy,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  return (
    <aside className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-text">
        <strong>Update available:</strong> {formatDisplayVersion(latestVersion)} is ready (you have{' '}
        {formatDisplayVersion(currentVersion)}).
      </div>
      <div className="update-banner-actions">
        <button type="button" className="button button-primary" disabled={busy} onClick={onInstall}>
          {busy ? 'Launching…' : 'Install update'}
        </button>
        <button type="button" className="button button-ghost" disabled={busy} onClick={onDismiss}>
          Not now
        </button>
      </div>
    </aside>
  )
}
