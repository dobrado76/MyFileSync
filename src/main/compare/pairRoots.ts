import fs from 'node:fs/promises'
import {
  missingRootMessage,
  pairRootSideLabel,
  uncShareRoot,
  volumeRootForLocalPath,
  type MissingPairRoot,
  type PairRootMissingReason,
  type PairRootSide,
} from '@shared/compare/pairRoots'
import { err, ioError, ok, type Result } from '@shared/result'
import { enabledJobPairs, type JobFile, type JobPair } from '@shared/schemas/job'
import { requireAbsolute } from '../security/paths'

async function pathIsReachable(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

function unreachableErrorCode(code: string | undefined): boolean {
  return (
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'ENODEV'
  )
}

type LocalFolderStatus =
  | { status: 'ok' }
  | { status: 'missing' }
  | { status: 'blocked'; reason: PairRootMissingReason }

async function inspectLocalFolder(absPath: string): Promise<LocalFolderStatus> {
  const trimmed = absPath.trim()
  const drive = volumeRootForLocalPath(trimmed)
  if (drive && !(await pathIsReachable(drive))) {
    return { status: 'blocked', reason: 'drive' }
  }

  const share = uncShareRoot(trimmed)
  if (share && !(await pathIsReachable(share))) {
    return { status: 'blocked', reason: 'drive' }
  }

  try {
    const stat = await fs.stat(trimmed)
    if (!stat.isDirectory()) {
      return { status: 'blocked', reason: 'not-folder' }
    }
    return { status: 'ok' }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') {
      return { status: 'blocked', reason: 'denied' }
    }
    if (code === 'ENOENT') {
      return { status: 'missing' }
    }
    if (unreachableErrorCode(code)) {
      return { status: 'blocked', reason: 'drive' }
    }
    return { status: 'blocked', reason: 'drive' }
  }
}

function sideNeedsLocalCheck(pair: JobPair, side: 'left' | 'right'): boolean {
  return side === 'left' ? pair.leftType !== 'sftp' : pair.rightType !== 'sftp'
}

function folderError(
  side: PairRootSide,
  absPath: string,
  reason: PairRootMissingReason,
): Result<never> {
  const text = missingRootMessage(pairRootSideLabel(side), absPath, reason)
  const code =
    reason === 'denied' ? 'not-allowed' : reason === 'not-folder' ? 'validation' : 'not-found'
  return err({ code, ...text })
}

/** List missing local roots that can be created; fail on offline drives or permission errors. */
export async function checkEnabledPairRoots(
  job: JobFile,
): Promise<Result<{ missing: MissingPairRoot[] }>> {
  const missing: MissingPairRoot[] = []

  for (const pair of enabledJobPairs(job)) {
    if (sideNeedsLocalCheck(pair, 'left')) {
      const status = await inspectLocalFolder(pair.left)
      if (status.status === 'blocked') {
        return folderError('source', pair.left, status.reason)
      }
      if (status.status === 'missing') {
        missing.push({ side: 'source', path: pair.left })
      }
    }
    if (sideNeedsLocalCheck(pair, 'right')) {
      const status = await inspectLocalFolder(pair.right)
      if (status.status === 'blocked') {
        return folderError('target', pair.right, status.reason)
      }
      if (status.status === 'missing') {
        missing.push({ side: 'target', path: pair.right })
      }
    }
  }

  return ok({ missing })
}

export async function createPairRootFolders(folders: MissingPairRoot[]): Promise<Result<void>> {
  for (const folder of folders) {
    let folderPath: string
    try {
      folderPath = requireAbsolute(folder.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return err({ code: 'validation', message })
    }

    const status = await inspectLocalFolder(folderPath)
    if (status.status === 'blocked') {
      return folderError(folder.side, folderPath, status.reason)
    }
    if (status.status === 'ok') continue

    try {
      await fs.mkdir(folderPath, { recursive: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') {
        return folderError(folder.side, folderPath, 'denied')
      }
      const message = error instanceof Error ? error.message : String(error)
      return ioError(`Could not create folder "${folderPath}".`, message)
    }
  }

  return ok(undefined)
}

/** Fail before Compare/Sync if any enabled local pair root is missing or offline. */
export async function assertEnabledPairRootsReady(job: JobFile): Promise<Result<void>> {
  const check = await checkEnabledPairRoots(job)
  if (!check.ok) return check

  if (check.value.missing.length > 0) {
    const first = check.value.missing[0]!
    return folderError(first.side, first.path, 'missing')
  }

  return ok(undefined)
}
