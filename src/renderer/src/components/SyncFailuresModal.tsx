import type { SyncFailure } from '@shared/schemas/compare'

type SyncFailuresModalProps = {
  open: boolean
  failures: SyncFailure[]
  succeeded: number
  busy: boolean
  fixingRowId: string | null
  fixStatus: string | null
  onDismiss: () => void
  onRetry: () => void
  onViewInGrid: () => void
  onShowInFolder: (path: string) => void
  onClearReadOnly: (failure: SyncFailure) => void
}

function canClearReadOnly(failure: SyncFailure): boolean {
  return failure.code === 'not-allowed' && Boolean(failure.targetPath)
}

export function SyncFailuresModal({
  open,
  failures,
  succeeded,
  busy,
  fixingRowId,
  fixStatus,
  onDismiss,
  onRetry,
  onViewInGrid,
  onShowInFolder,
  onClearReadOnly,
}: SyncFailuresModalProps) {
  if (!open || failures.length === 0) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-lg sync-failures-modal" role="alertdialog" aria-modal="true">
        <header className="modal-header">
          <h2>
            {failures.length} item{failures.length === 1 ? '' : 's'} could not sync
          </h2>
        </header>
        <div className="modal-body">
          {fixStatus ? <p className="sync-failures-fix-banner">{fixStatus}</p> : null}
          <p className="sync-failures-summary">
            {succeeded > 0 ? (
              <>
                <strong>{succeeded.toLocaleString()}</strong> items synced successfully. The items below
                were left unchanged — fix the issue and retry.
              </>
            ) : (
              <>Nothing was synced. Fix the issues below and retry.</>
            )}
          </p>
          <ul className="sync-failures-list">
            {failures.map((failure) => {
              const isFixing = fixingRowId === failure.rowId
              return (
                <li
                  key={failure.rowId}
                  className={`sync-failure-item${isFixing ? ' sync-failure-item-fixing' : ''}`}
                >
                  <div className="sync-failure-head">
                    <span className="sync-failure-path" title={failure.relPath}>
                      {failure.relPath}
                    </span>
                    <span className="sync-failure-action">{failure.action}</span>
                  </div>
                  <p className="sync-failure-message">{failure.message}</p>
                  {failure.hint ? <p className="sync-failure-hint">{failure.hint}</p> : null}
                  {failure.targetPath ? (
                    <p className="sync-failure-target" title={failure.targetPath}>
                      Target: {failure.targetPath}
                    </p>
                  ) : null}
                  {isFixing && fixStatus ? (
                    <p className="sync-failure-progress" aria-live="polite">
                      {fixStatus}
                    </p>
                  ) : null}
                  <div className="sync-failure-actions">
                    {failure.targetPath ? (
                      <button
                        type="button"
                        className="button button-sm"
                        disabled={busy}
                        onClick={() => onShowInFolder(failure.targetPath!)}
                      >
                        Reveal
                      </button>
                    ) : null}
                    {canClearReadOnly(failure) ? (
                      <button
                        type="button"
                        className="button button-sm"
                        disabled={busy}
                        onClick={() => onClearReadOnly(failure)}
                      >
                        {isFixing ? fixStatus ?? 'Working…' : 'Clear read-only'}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onViewInGrid} disabled={busy}>
            Show in grid
          </button>
          <button type="button" className="button" onClick={onDismiss} disabled={busy}>
            Close
          </button>
          <button type="button" className="button button-primary" disabled={busy} onClick={onRetry}>
            {busy && !fixingRowId ? 'Retrying…' : 'Retry failed'}
          </button>
        </footer>
      </div>
    </div>
  )
}
