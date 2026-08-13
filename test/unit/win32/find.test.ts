import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fileTimeToMs, readDirectoryWin32 } from '../../../src/main/win32/find'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('readDirectoryWin32', () => {
  it('returns size and mtime from FindFirstFile without needing a second stat', async () => {
    if (process.platform !== 'win32') return

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-find-'))
    temps.push(dir)
    const filePath = path.join(dir, 'big-name.txt')
    await fs.writeFile(filePath, 'hello-find')
    const now = new Date('2024-06-15T12:00:00.000Z')
    await fs.utimes(filePath, now, now)

    const entries = readDirectoryWin32(dir)
    const entry = entries.get('big-name.txt')
    expect(entry?.size).toBe(10)
    expect(entry?.isDir).toBe(false)
    expect(Math.abs(entry!.mtimeMs - now.getTime())).toBeLessThan(1000)
  })
})

describe('fileTimeToMs', () => {
  it('converts the Unix epoch FILETIME to 0', () => {
    // 116444736000000000 * 100ns = 1970-01-01
    const ticks = 116444736000000000n
    const low = Number(ticks & 0xffffffffn)
    const high = Number(ticks >> 32n)
    expect(fileTimeToMs(low, high)).toBe(0)
  })
})
