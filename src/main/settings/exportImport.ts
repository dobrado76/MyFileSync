import fs from 'node:fs/promises'
import path from 'node:path'
import { settingsSchema, type Settings } from '@shared/schemas/settings'
import { ioError, ok, validationError, type Result } from '@shared/result'
import { loadSettings, saveSettings } from './store'

/** Portable settings envelope — excludes window geometry (`window-state.json`). */
export const SETTINGS_EXPORT_FORMAT = 'myfilesync-settings' as const
export const SETTINGS_EXPORT_VERSION = 1 as const

export type SettingsExportFile = {
  format: typeof SETTINGS_EXPORT_FORMAT
  version: typeof SETTINGS_EXPORT_VERSION
  settings: Settings
}

function toExportPayload(settings: Settings): SettingsExportFile {
  return {
    format: SETTINGS_EXPORT_FORMAT,
    version: SETTINGS_EXPORT_VERSION,
    settings,
  }
}

function parseExportPayload(raw: unknown): Result<Settings> {
  if (typeof raw !== 'object' || raw === null) {
    return validationError('Settings file is not a valid JSON object.')
  }

  const record = raw as Record<string, unknown>

  if (record['format'] === SETTINGS_EXPORT_FORMAT) {
    const version = record['version']
    if (version !== SETTINGS_EXPORT_VERSION) {
      return validationError(`Unsupported settings export version: ${String(version)}`)
    }
    return parsePlainSettings(record['settings'])
  }

  return parsePlainSettings(raw)
}

function parsePlainSettings(raw: unknown): Result<Settings> {
  const parsed = settingsSchema.safeParse(raw)
  if (!parsed.success) {
    return validationError(parsed.error.message)
  }
  return ok(parsed.data)
}

/** Export current app settings to a user-selected path (no window geometry). */
export async function exportSettings(exportPath: string): Promise<Result<{ path: string }>> {
  try {
    const settings = await loadSettings()
    const payload = toExportPayload(settings)
    await fs.mkdir(path.dirname(exportPath), { recursive: true })
    await fs.writeFile(exportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return ok({ path: exportPath })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Could not export settings: ${message}`)
  }
}

/** Import settings from a user-selected path and persist to userData. */
export async function importSettings(importPath: string): Promise<Result<Settings>> {
  try {
    const raw = JSON.parse(await fs.readFile(importPath, 'utf8')) as unknown
    const parsed = parseExportPayload(raw)
    if (!parsed.ok) return parsed
    const saved = await saveSettings(parsed.value)
    return ok(saved)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Could not import settings: ${message}`)
  }
}
