import fs from 'node:fs/promises'
import path from 'node:path'
import { buildStreamPath, sortManifest, type AdsManifest } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'
import { listStreams } from './list'

export type CopyStreamsOptions = {
  excludeStreams?: string[]
}

export type CopyStreamsResult = {
  copiedStreams: string[]
  manifest: AdsManifest
}

/**
 * Copy alternate data streams from source host to dest host.
 * Primary $DATA is not copied — use CopyFileEx for full file replication (Phase 1).
 */
export async function copyStreams(
  sourcePath: string,
  destPath: string,
  options: CopyStreamsOptions = {},
): Promise<Result<CopyStreamsResult>> {
  if (process.platform !== 'win32') {
    return ioError('Alternate data stream copy requires Windows.', 'Run on NTFS.')
  }

  const listResult = listStreams(sourcePath)
  if (!listResult.ok) {
    return listResult
  }

  const exclude = new Set(options.excludeStreams ?? [])
  const toCopy = listResult.value.filter((entry) => !exclude.has(entry.name))

  const copiedStreams: string[] = []

  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true })

    for (const entry of toCopy) {
      const srcStream = buildStreamPath(sourcePath, entry.name)
      const destStream = buildStreamPath(destPath, entry.name)

      const data = await fs.readFile(srcStream)
      await fs.writeFile(destStream, data)
      copiedStreams.push(entry.name)
    }

    const verifyResult = listStreams(destPath)
    if (!verifyResult.ok) {
      return verifyResult
    }

    const expected = sortManifest(toCopy)
    const actual = sortManifest(verifyResult.value)

    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return ioError('Stream copy verification failed — manifests do not match.', undefined)
    }

    return ok({ copiedStreams, manifest: actual })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Failed to copy alternate streams: ${message}`)
  }
}
