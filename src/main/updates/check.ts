import fs from 'node:fs/promises'
import path from 'node:path'
import { isNewerVersion, parseInstallerFileName } from '@shared/version'

export type UpdateCheckResult =
  | { status: 'no-folder' }
  | { status: 'folder-missing'; folder: string }
  | { status: 'no-installers'; folder: string }
  | { status: 'up-to-date'; folder: string; latestVersion: string; latestInstallerPath: string }
  | {
      status: 'update-available'
      folder: string
      currentVersion: string
      latestVersion: string
      installerPath: string
    }

export async function checkForUpdates(
  updatesFolder: string,
  currentVersion: string,
): Promise<UpdateCheckResult> {
  const folder = updatesFolder.trim()
  if (!folder) {
    return { status: 'no-folder' }
  }

  let entries: string[]
  try {
    entries = await fs.readdir(folder)
  } catch {
    return { status: 'folder-missing', folder }
  }

  let latestVersion = currentVersion
  let latestInstallerPath = ''

  for (const entry of entries) {
    const version = parseInstallerFileName(entry)
    if (!version) continue

    if (!latestInstallerPath || isNewerVersion(version, latestVersion)) {
      latestVersion = version
      latestInstallerPath = path.join(folder, entry)
    }
  }

  if (!latestInstallerPath) {
    return { status: 'no-installers', folder }
  }

  if (isNewerVersion(latestVersion, currentVersion)) {
    return {
      status: 'update-available',
      folder,
      currentVersion,
      latestVersion,
      installerPath: latestInstallerPath,
    }
  }

  return {
    status: 'up-to-date',
    folder,
    latestVersion,
    latestInstallerPath,
  }
}
