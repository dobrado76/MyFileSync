import type { MissingPairRoot } from '@shared/compare/pairRoots'
import { pairRootSideLabel } from '@shared/compare/pairRoots'

type CreateFolderModalProps = {
  folders: MissingPairRoot[]
  open: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function CreateFolderModal({
  folders,
  open,
  busy = false,
  onConfirm,
  onCancel,
}: CreateFolderModalProps) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal modal-sm" role="alertdialog" aria-modal="true">
        <header className="modal-header">
          <h2>Create missing folders?</h2>
        </header>
        <div className="modal-body">
          <p>The following folders do not exist yet. Create them and continue?</p>
          <ul className="create-folder-list">
            {folders.map((folder) => (
              <li key={`${folder.side}:${folder.path}`}>
                <span className="create-folder-side">{pairRootSideLabel(folder.side)}</span>
                <span className="create-folder-path" title={folder.path}>
                  {folder.path}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onConfirm}
            disabled={busy}
          >
            Create and continue
          </button>
        </footer>
      </div>
    </div>
  )
}
