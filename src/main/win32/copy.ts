import koffi from 'koffi'
import { ioError, ok, type Result } from '@shared/result'

const COPY_FILE_RESTARTABLE = 0x00000002

const kernel32 = koffi.load('kernel32.dll')

const CopyFileExW = kernel32.func('CopyFileExW', 'bool', [
  'str16',
  'str16',
  'void *',
  'void *',
  'bool *',
  'uint32',
])

export function copyFileEx(source: string, dest: string): Result<void> {
  if (process.platform !== 'win32') {
    return ioError('CopyFileEx is only available on Windows.')
  }

  const cancelled = [false]
  const success = CopyFileExW(source, dest, null, null, cancelled, COPY_FILE_RESTARTABLE)
  if (!success) {
    return ioError(`CopyFileEx failed for ${source}`)
  }
  return ok(undefined)
}
