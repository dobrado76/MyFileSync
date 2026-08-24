import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import {
  missingRootMessage,
  uncShareRoot,
  volumeRootForLocalPath,
} from '@shared/compare/pairRoots'
import {
  assertEnabledPairRootsReady,
  checkEnabledPairRoots,
  createPairRootFolders,
} from '../../../src/main/compare/pairRoots'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('pair root checks', () => {
  it('reads a Windows drive letter', () => {
    expect(volumeRootForLocalPath('U:\\Best Sounds')).toBe('U:\\')
    expect(volumeRootForLocalPath('u:/Best Sounds')).toBe('U:\\')
    expect(volumeRootForLocalPath('\\\\server\\share\\x')).toBeNull()
  })

  it('reads a UNC share root', () => {
    expect(uncShareRoot('\\\\server\\share\\Best Sounds')).toBe('\\\\server\\share')
    expect(uncShareRoot('\\\\?\\UNC\\server\\share\\folder')).toBe('\\\\server\\share')
  })

  it('names a disconnected drive', () => {
    const text = missingRootMessage('Target', 'U:\\Best Sounds', 'drive')
    expect(text.message).toBe('Target drive U: is not connected.')
    expect(text.hint).toContain('U:\\Best Sounds')
    expect(text.hint).not.toMatch(/does not exist/)
  })

  it('names a missing folder without mentioning offline drives', () => {
    const text = missingRootMessage('Target', 'U:\\Best Sounds', 'missing')
    expect(text.message).toBe('Target folder does not exist yet.')
    expect(text.hint).toBe('U:\\Best Sounds')
    expect(text.message).not.toMatch(/offline/)
  })

  it('names an unreachable network folder', () => {
    const text = missingRootMessage('Target', '\\\\server\\share\\Best Sounds', 'drive')
    expect(text.message).toBe('Target network folder is not connected or not reachable.')
    expect(text.hint).toContain('\\\\server\\share')
  })

  it('accepts existing folders and reports a missing target separately from drive offline', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-roots-'))
    temps.push(root)
    const left = path.join(root, 'left')
    const right = path.join(root, 'right')
    await fs.mkdir(left)
    await fs.mkdir(right)

    const job = createDefaultJob('roots')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    expect((await assertEnabledPairRootsReady(job)).ok).toBe(true)

    job.pairs[0]!.right = path.join(root, 'gone')
    const missing = await assertEnabledPairRootsReady(job)
    expect(missing.ok).toBe(false)
    if (!missing.ok) {
      expect(missing.error.message).toBe('Target folder does not exist yet.')
      expect(missing.error.hint).toBe(job.pairs[0]!.right)
    }

    const check = await checkEnabledPairRoots(job)
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.value.missing).toEqual([{ side: 'target', path: job.pairs[0]!.right }])
    }
  })

  it('creates missing folders when the parent path is reachable', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-roots-'))
    temps.push(root)
    const left = path.join(root, 'left')
    const missingTarget = path.join(root, 'new-target')
    await fs.mkdir(left)

    const job = createDefaultJob('roots')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = missingTarget

    const created = await createPairRootFolders([{ side: 'target', path: missingTarget }])
    expect(created.ok).toBe(true)
    const stat = await fs.stat(missingTarget)
    expect(stat.isDirectory()).toBe(true)
    expect((await assertEnabledPairRootsReady(job)).ok).toBe(true)
  })
})
