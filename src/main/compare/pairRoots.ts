import fs from 'node:fs/promises'
import { missingRootMessage, volumeRootForLocalPath } from '@shared/compare/pairRoots'
import { err, ok, type Result } from '@shared/result'
import { enabledJobPairs, type JobFile, type JobPair } from '@shared/schemas/job'

async function driveIsReachable(driveRoot: string): Promise<boolean> {
  try {
    await fs.access(driveRoot)
    return true
  } catch {
    return false
  }
}

async function assertLocalFolder(absPath: string, side: 'Source' | 'Target'): Promise<Result<void>> {
  const trimmed = absPath.trim()
  const drive = volumeRootForLocalPath(trimmed)
  if (drive && !(await driveIsReachable(drive))) {
    const text = missingRootMessage(side, trimmed, 'drive')
    return err({ code: 'not-found', ...text })
  }

  try {
    const stat = await fs.stat(trimmed)
    if (!stat.isDirectory()) {
      const text = missingRootMessage(side, trimmed, 'not-folder')
      return err({ code: 'validation', ...text })
    }
    return ok(undefined)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    const reason = code === 'EPERM' || code === 'EACCES' ? 'denied' : 'folder'
    const text = missingRootMessage(side, trimmed, reason)
    return err({ code: reason === 'denied' ? 'not-allowed' : 'not-found', ...text })
  }
}

function sideNeedsLocalCheck(pair: JobPair, side: 'left' | 'right'): boolean {
  return side === 'left' ? pair.leftType !== 'sftp' : pair.rightType !== 'sftp'
}

/** Fail before Compare/Sync if any enabled local pair root is missing or offline. */
export async function assertEnabledPairRootsReady(job: JobFile): Promise<Result<void>> {
  for (const pair of enabledJobPairs(job)) {
    if (sideNeedsLocalCheck(pair, 'left')) {
      const left = await assertLocalFolder(pair.left, 'Source')
      if (!left.ok) return left
    }
    if (sideNeedsLocalCheck(pair, 'right')) {
      const right = await assertLocalFolder(pair.right, 'Target')
      if (!right.ok) return right
    }
  }
  return ok(undefined)
}
