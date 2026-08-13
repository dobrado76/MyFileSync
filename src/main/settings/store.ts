import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from '@shared/schemas/settings'

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    return settingsSchema.parse(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings()
  const merged = settingsSchema.parse({ ...current, ...partial })
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true })
  await fs.writeFile(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged
}
