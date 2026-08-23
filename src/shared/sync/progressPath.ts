import type { PlannedAction } from '../schemas/compare'

/** Absolute path to show in Sync progress (dest when known, else source). */
export function syncProgressPath(action: PlannedAction): string {
  return action.destPath ?? action.sourcePath ?? action.relPath
}
