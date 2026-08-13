import fs from 'node:fs/promises'
import path from 'node:path'
import { ok, ioError, type Result } from '@shared/result'
import type { JobFile } from '@shared/schemas/job'

function versionsDir(pairRoot: string, job: JobFile): string {
  const folder = job.versioning.folder || '.myfilesync-versions'
  return path.join(pairRoot, folder)
}

async function pruneVersions(dir: string, keepCount: number): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return
  }

  const files = (
    await Promise.all(
      entries.map(async (name) => {
        const full = path.join(dir, name)
        const stat = await fs.stat(full)
        return { full, mtimeMs: stat.mtimeMs }
      }),
    )
  ).sort((a, b) => b.mtimeMs - a.mtimeMs)

  for (const file of files.slice(keepCount)) {
    await fs.rm(file.full, { force: true })
  }
}

/**
 * Before Update/Delete, copy the destination file into the pair's versioning folder.
 */
export async function versionBeforeMutation(
  destPath: string,
  pairRoot: string,
  job: JobFile,
): Promise<Result<void>> {
  if (!job.versioning.enabled) {
    return ok(undefined)
  }

  try {
    await fs.access(destPath)
  } catch {
    return ok(undefined)
  }

  try {
    const stat = await fs.stat(destPath)
    if (stat.isDirectory()) {
      return ok(undefined)
    }

    const dir = versionsDir(pairRoot, job)
    await fs.mkdir(dir, { recursive: true })

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const base = path.basename(destPath)
    const archiveName = `${stamp}-${base}`
    const archivePath = path.join(dir, archiveName)

    await fs.copyFile(destPath, archivePath)
    await pruneVersions(dir, job.versioning.keepCount)

    return ok(undefined)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return ioError(`Versioning failed: ${message}`)
  }
}

export function resolvePairRoot(
  pairId: string,
  destPath: string,
  job: JobFile,
): string | undefined {
  const pair = job.pairs.find((p) => p.id === pairId)
  if (!pair) return undefined

  const normalizedDest = path.resolve(destPath)
  const leftRoot = path.resolve(pair.left)
  const rightRoot = path.resolve(pair.right)

  if (normalizedDest.startsWith(leftRoot)) return leftRoot
  if (normalizedDest.startsWith(rightRoot)) return rightRoot
  return rightRoot
}
