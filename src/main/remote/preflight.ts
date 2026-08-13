import fs from 'node:fs/promises'
import { buildStreamPath } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'

/** Test stream written to UNC roots to verify SMB ADS support (D12). */
export const PROBE_STREAM_NAME = 'MyFileSyncProbe'

const PROBE_PAYLOAD = 'MyFileSync ADS probe'

export type UncPreflightResult = {
  path: string
  adsSupported: boolean
  message: string
}

/**
 * True for `\\server\share\...` and `\\?\UNC\server\share\...` paths.
 */
export function isUncPath(input: string): boolean {
  const trimmed = input.trim()
  if (trimmed.startsWith('\\\\?\\UNC\\')) return true
  if (trimmed.startsWith('\\\\?\\')) return false
  return trimmed.startsWith('\\\\')
}

function permissionHint(code: string | undefined): string | undefined {
  if (code === 'EPERM' || code === 'EACCES') {
    return 'The share or folder may be read-only, or your account may not have permission to write alternate data streams.'
  }
  return undefined
}

function probeErrorMessage(path: string, error: NodeJS.ErrnoException): string {
  const base = `Could not verify alternate data stream support on the network folder "${path}".`
  if (error.code === 'EPERM' || error.code === 'EACCES') {
    return `${base} The destination appears read-only or does not allow stream writes. Alternate data streams will not sync reliably on this path.`
  }
  if (error.code === 'ENOENT') {
    return `${base} The folder does not exist or is not reachable.`
  }
  if (error.code === 'ENOTDIR') {
    return `${base} The path is not a folder.`
  }
  return `${base} ${error.message}`
}

/**
 * Write and delete `:MyFileSyncProbe:$DATA` on a UNC root to test SMB ADS support.
 * Local paths are skipped with adsSupported=true.
 */
export async function probeUncAdsSupport(rootPath: string): Promise<Result<UncPreflightResult>> {
  const path = rootPath.trim()

  if (!isUncPath(path)) {
    return ok({
      path,
      adsSupported: true,
      message: 'Local path — alternate data stream preflight not required.',
    })
  }

  let probePath: string
  try {
    probePath = buildStreamPath(path, PROBE_STREAM_NAME)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Cannot run network preflight on "${path}": ${message}`)
  }

  try {
    await fs.access(path)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    return ioError(probeErrorMessage(path, err), permissionHint(err.code))
  }

  try {
    await fs.writeFile(probePath, PROBE_PAYLOAD, 'utf8')
    await fs.unlink(probePath)
    return ok({
      path,
      adsSupported: true,
      message:
        'Network folder supports alternate data stream writes. Stream metadata should sync on this path.',
    })
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    const adsSupported = !(err.code === 'EPERM' || err.code === 'EACCES')
    return ok({
      path,
      adsSupported,
      message: probeErrorMessage(path, err),
    })
  }
}

/**
 * Run preflight for both sides of a pair when either path is UNC.
 * Throws with a plain-language message when ADS is not supported.
 */
export async function preflightPairUncPaths(left: string, right: string): Promise<void> {
  for (const [label, rootPath] of [
    ['Left', left] as const,
    ['Right', right] as const,
  ]) {
    if (!isUncPath(rootPath)) continue

    const result = await probeUncAdsSupport(rootPath)
    if (!result.ok) {
      throw new Error(`${label} folder preflight failed: ${result.error.message}`)
    }
    if (!result.value.adsSupported) {
      throw new Error(`${label} folder: ${result.value.message}`)
    }
  }
}
