import { z } from 'zod'

export const settingsSchema = z.object({
  /** Folder scanned for MyFileSync-Setup-*.exe installers when checking for updates. */
  updatesFolder: z.string(),
  /** Job id to restore on next launch. */
  lastJobId: z.string().optional(),
  /** Chromium GPU compositing. Applied at process start; change takes effect on next launch. */
  hardwareAcceleration: z.boolean().default(true),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  updatesFolder: '',
  hardwareAcceleration: true,
}
