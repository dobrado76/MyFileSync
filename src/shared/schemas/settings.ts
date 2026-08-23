import { z } from 'zod'

export const settingsSchema = z.object({
  /** Folder scanned for MyFileSync-Setup-*.exe installers when checking for updates. */
  updatesFolder: z.string(),
  /** Job id to restore on next launch. */
  lastJobId: z.string().optional(),
  /** Chromium GPU compositing. Applied at process start; change takes effect on next launch. */
  hardwareAcceleration: z.boolean().default(true),
  /** Show the mirror-delete confirm dialog when Sync would delete. */
  confirmMirrorDeletes: z.boolean().default(true),
  /** Full progress panel vs status-bar string. Remembers the last choice. */
  progressUiExpanded: z.boolean().default(true),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  updatesFolder: '',
  hardwareAcceleration: true,
  confirmMirrorDeletes: true,
  progressUiExpanded: true,
}
