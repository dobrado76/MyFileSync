import { Menu, type BrowserWindow } from 'electron'

/** Standard Cut/Copy/Paste/Select All on text fields. Skip when the renderer owns the menu (folder tree). */
export function attachEditContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const editable = params.isEditable
    const hasSelection = Boolean(params.selectionText)
    if (!editable && !hasSelection) return

    const flags = params.editFlags
    const template = editable
      ? [
          { role: 'undo' as const, enabled: flags.canUndo },
          { role: 'redo' as const, enabled: flags.canRedo },
          { type: 'separator' as const },
          { role: 'cut' as const, enabled: flags.canCut },
          { role: 'copy' as const, enabled: flags.canCopy },
          { role: 'paste' as const, enabled: flags.canPaste },
          { role: 'delete' as const, enabled: flags.canDelete },
          { type: 'separator' as const },
          { role: 'selectAll' as const, enabled: flags.canSelectAll },
        ]
      : [{ role: 'copy' as const, enabled: flags.canCopy }]

    Menu.buildFromTemplate(template).popup({ window })
  })
}
