import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import { missingRootMessage, volumeRootForLocalPath } from '@shared/compare/pairRoots'
import { assertEnabledPairRootsReady } from '../../../src/main/compare/pairRoots'

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

  it('names a disconnected drive', () => {
    const text = missingRootMessage('Target', 'U:\\Best Sounds', 'drive')
    expect(text.message).toBe('Target drive U: is not connected.')
    expect(text.hint).toContain('U:\\Best Sounds')
  })

  it('accepts existing folders and rejects a missing target', async () => {
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
    if (!missing.ok) expect(missing.error.message).toMatch(/Target folder is not available/)
  })
})
