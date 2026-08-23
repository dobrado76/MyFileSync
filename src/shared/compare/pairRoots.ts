/** Drive root like `U:\` for a local Windows path, otherwise null. */
export function volumeRootForLocalPath(absPath: string): string | null {
  const match = /^([A-Za-z]:)([\\/]|$)/.exec(absPath.trim())
  if (!match?.[1]) return null
  return `${match[1].toUpperCase()}\\`
}

export function missingRootMessage(
  side: 'Source' | 'Target',
  absPath: string,
  reason: 'drive' | 'folder' | 'not-folder' | 'denied',
): { message: string; hint: string } {
  const drive = volumeRootForLocalPath(absPath)
  if (reason === 'drive' && drive) {
    return {
      message: `${side} drive ${drive.slice(0, 2)} is not connected.`,
      hint: `Connect or map the drive, then Compare again. Folder: ${absPath}`,
    }
  }
  if (reason === 'not-folder') {
    return {
      message: `${side} path is not a folder.`,
      hint: absPath,
    }
  }
  if (reason === 'denied') {
    return {
      message: `${side} folder cannot be opened — permission was denied.`,
      hint: absPath,
    }
  }
  return {
    message: `${side} folder is not available.`,
    hint: drive
      ? `The folder does not exist, or ${drive.slice(0, 2)} is offline. Path: ${absPath}`
      : `The folder does not exist or is not reachable. Path: ${absPath}`,
  }
}
