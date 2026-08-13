import fs from 'node:fs/promises'
import { buildStreamPath } from '@shared/ads/paths'
import { ioError, ok, type Result } from '@shared/result'

const PREVIEW_MAX_BYTES = 64 * 1024

export async function readStreamText(
  hostPath: string,
  streamName: string,
): Promise<Result<{ text: string; truncated: boolean; size: number }>> {
  try {
    const streamPath = buildStreamPath(hostPath, streamName)
    const handle = await fs.open(streamPath, 'r')
    try {
      const stat = await handle.stat()
      const toRead = Math.min(stat.size, PREVIEW_MAX_BYTES)
      const buffer = Buffer.alloc(toRead)
      await handle.read(buffer, 0, toRead, 0)
      let text = buffer.toString('utf8')
      const nul = text.indexOf('\0')
      if (nul >= 0) text = text.slice(0, nul)
      return ok({ text, truncated: stat.size > PREVIEW_MAX_BYTES, size: stat.size })
    } finally {
      await handle.close()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Cannot read stream: ${message}`)
  }
}
