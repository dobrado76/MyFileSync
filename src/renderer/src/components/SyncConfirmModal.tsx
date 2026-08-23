import { useEffect, useState } from 'react'

type SyncConfirmModalProps = {
  deleteCount: number
  open: boolean
  onConfirm: (dontShowAgain: boolean) => void
  onCancel: () => void
}

export function SyncConfirmModal({ deleteCount, open, onConfirm, onCancel }: SyncConfirmModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    if (open) setDontShowAgain(false)
  }, [open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-sm" role="alertdialog" aria-modal="true">
        <header className="modal-header">
          <h2>Confirm mirror deletes</h2>
        </header>
        <div className="modal-body">
          <p>
            This sync will remove <strong>{deleteCount}</strong> files or folders on the
            destination. Deleted items go to the Recycle Bin when enabled in job settings.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            Don&apos;t show again
          </label>
        </div>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onConfirm(dontShowAgain)}
          >
            Sync anyway
          </button>
        </footer>
      </div>
    </div>
  )
}
