import { z } from 'zod'

export const settingsSchema = z.object({
  /** Folder scanned for MyFileSync-Setup-*.exe installers when checking for updates. */
  updatesFolder: z.string(),
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  updatesFolder: '',
}
