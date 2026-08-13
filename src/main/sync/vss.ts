import { busyError, err, type Result } from '@shared/result'

export type VssCopyOptions = {
  vssEnabled: boolean
}

function isSharingError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('ebusy') ||
    lower.includes('sharing violation') ||
    lower.includes('locked') ||
    lower.includes('error 32') ||
    lower.includes('error 33')
  )
}

/**
 * After a normal copy fails, map sharing/lock errors to a VSS hint or stub result.
 */
export function handleLockedFileCopy(
  source: string,
  failureMessage: string,
  options: VssCopyOptions,
): Result<void> {
  if (!isSharingError(failureMessage)) {
    return err({ code: 'io', message: failureMessage })
  }

  if (!options.vssEnabled) {
    return busyError(
      'File is in use by another program.',
      'Enable Volume Shadow Copy (VSS) in job settings to copy locked files.',
    )
  }

  return busyError(
    'File is locked and VSS snapshot copy is not fully implemented yet.',
    `Locked file: ${source}. VSS snapshot path will copy from shadow volume in a future update.`,
  )
}
