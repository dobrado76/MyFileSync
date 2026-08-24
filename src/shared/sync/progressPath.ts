import type { PlannedAction, SyncActionType } from '../schemas/compare'

/** Fixed width for the verb column so paths stay aligned (longest: Deleting / Updating / Renaming). */
export const SYNC_PROGRESS_VERB_WIDTH_CH = 9

/** Present-tense label for the current sync item. */
export function syncProgressVerb(action: SyncActionType): string {
  switch (action) {
    case 'Create':
      return 'Copying'
    case 'Update':
    case 'UpdateStreamsOnly':
    case 'TouchTime':
      return 'Updating'
    case 'Delete':
      return 'Deleting'
    case 'Move':
      return 'Moving'
    case 'Rename':
      return 'Renaming'
    default:
      return 'Syncing'
  }
}

/** Absolute path to show in Sync progress (dest when known, else source). */
export function syncProgressPath(action: PlannedAction): string {
  return action.destPath ?? action.sourcePath ?? action.relPath
}
