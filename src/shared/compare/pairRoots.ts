export type PairRootSide = 'source' | 'target'

export type PairRootMissingReason = 'drive' | 'missing' | 'not-folder' | 'denied'

export type MissingPairRoot = {
  side: PairRootSide
  path: string
}

/** Drive root like `U:\` for a local Windows path, otherwise null. */
export function volumeRootForLocalPath(absPath: string): string | null {
  const match = /^([A-Za-z]:)([\\/]|$)/.exec(absPath.trim())
  if (!match?.[1]) return null
  return `${match[1].toUpperCase()}\\`
}

/** UNC share root `\\server\share` for a network path, otherwise null. */
export function uncShareRoot(absPath: string): string | null {
  let trimmed = absPath.trim()
  if (trimmed.startsWith('\\\\?\\UNC\\')) trimmed = `\\\\${trimmed.slice(8)}`
  if (trimmed.startsWith('\\\\?\\')) return null
  if (!trimmed.startsWith('\\\\')) return null
  const parts = trimmed.split('\\').filter(Boolean)
  if (parts.length < 2) return null
  return `\\\\${parts[0]}\\${parts[1]}`
}

export function pairRootSideLabel(side: PairRootSide): 'Source' | 'Target' {
  return side === 'source' ? 'Source' : 'Target'
}

export function missingRootMessage(
  side: 'Source' | 'Target',
  absPath: string,
  reason: PairRootMissingReason,
): { message: string; hint: string } {
  const drive = volumeRootForLocalPath(absPath)
  if (reason === 'drive') {
    if (drive) {
      return {
        message: `${side} drive ${drive.slice(0, 2)} is not connected.`,
        hint: `Connect or map the drive, then try again. Path: ${absPath}`,
      }
    }
    const share = uncShareRoot(absPath)
    if (share) {
      return {
        message: `${side} network folder is not connected or not reachable.`,
        hint: `Connect to ${share}, then try again. Path: ${absPath}`,
      }
    }
    return {
      message: `${side} folder is not reachable.`,
      hint: absPath,
    }
  }
  if (reason === 'missing') {
    return {
      message: `${side} folder does not exist yet.`,
      hint: absPath,
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
    hint: absPath,
  }
}
