import koffi from 'koffi'
import { ioError, ok, type Result } from '@shared/result'

const kernel32 = koffi.load('kernel32.dll')

const CreateHardLinkW = kernel32.func('CreateHardLinkW', 'bool', [
  'str16',
  'str16',
  'void *',
])

/**
 * Create a hard link at `linkPath` pointing to `existingPath`.
 */
export function createHardLink(existingPath: string, linkPath: string): Result<void> {
  if (process.platform !== 'win32') {
    return ioError('Hard links are only supported on Windows NTFS.')
  }

  const success = CreateHardLinkW(linkPath, existingPath, null)
  if (!success) {
    return ioError(`CreateHardLinkW failed for ${existingPath} → ${linkPath}`)
  }

  return ok(undefined)
}
