import koffi from 'koffi'
import { toLongPath } from '@shared/ads/paths'
import { err, ioError, ok, type Result } from '@shared/result'

const kernel32 = koffi.load('kernel32.dll')

const CopyFileExW = kernel32.func('CopyFileExW', 'bool', [
  'str16',
  'str16',
  'void *',
  'void *',
  'void *',
  'uint32',
])

/** BOOL for CopyFileEx pbCancel. Written from Cancel IPC; read during copy. */
const abortFlag = Buffer.alloc(4)

type KoffiAsyncFn = {
  async: (
    source: string,
    dest: string,
    progress: null,
    data: null,
    cancel: Buffer,
    flags: number,
    callback: (error: Error | null, success: boolean) => void,
  ) => void
}

export function requestCopyAbort(): void {
  abortFlag.writeInt32LE(1, 0)
}

export function clearCopyAbort(): void {
  abortFlag.writeInt32LE(0, 0)
}

export function isCopyAborted(): boolean {
  return abortFlag.readInt32LE(0) !== 0
}

/**
 * Kernel copy on a libuv thread so Cancel IPC can run. pbCancel aborts an
 * in-flight copy without blocking the main process.
 */
export function copyFileEx(source: string, dest: string): Promise<Result<void>> {
  if (process.platform !== 'win32') {
    return Promise.resolve(ioError('CopyFileEx is only available on Windows.'))
  }

  return new Promise((resolve) => {
    ;(CopyFileExW as unknown as KoffiAsyncFn).async(
      toLongPath(source),
      toLongPath(dest),
      null,
      null,
      abortFlag,
      0,
      (error, success) => {
        if (abortFlag.readInt32LE(0) !== 0) {
          resolve(err({ code: 'cancelled', message: 'Copy cancelled.' }))
          return
        }
        if (error || !success) {
          resolve(ioError(`CopyFileEx failed for ${source}`))
          return
        }
        resolve(ok(undefined))
      },
    )
  })
}
