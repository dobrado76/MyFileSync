import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { manifestsEqual } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'
import { listStreams } from '../ads/list'

export type VerifyAlgorithm = 'md5' | 'sha256'

async function hashFile(filePath: string, algorithm: VerifyAlgorithm): Promise<string> {
  const data = await fs.readFile(filePath)
  return createHash(algorithm).update(data).digest('hex')
}

/**
 * Verify that destination `$DATA` hash and ADS manifest match the source after copy.
 */
export async function verifyCopy(
  source: string,
  dest: string,
  algorithm: VerifyAlgorithm,
): Promise<Result<void>> {
  try {
    const [sourceStat, destStat] = await Promise.all([fs.stat(source), fs.stat(dest)])

    if (sourceStat.size !== destStat.size) {
      return ioError('Verify failed — destination size does not match source.')
    }

    const [sourceHash, destHash] = await Promise.all([
      hashFile(source, algorithm),
      hashFile(dest, algorithm),
    ])

    if (sourceHash !== destHash) {
      return ioError('Verify failed — destination hash does not match source.')
    }

    if (process.platform === 'win32') {
      const sourceManifest = await listStreams(source)
      const destManifest = await listStreams(dest)
      if (!sourceManifest.ok) return sourceManifest
      if (!destManifest.ok) return destManifest
      if (!manifestsEqual(sourceManifest.value, destManifest.value)) {
        return ioError('Verify failed — alternate data stream manifests do not match.')
      }
    }

    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Verify failed: ${message}`)
  }
}
