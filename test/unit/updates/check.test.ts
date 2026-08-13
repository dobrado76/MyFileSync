import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkForUpdates } from '../../../src/main/updates/check'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function makeUpdatesDir(files: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-updates-'))
  tempDirs.push(dir)
  for (const file of files) {
    await fs.writeFile(path.join(dir, file), 'installer')
  }
  return dir
}

describe('checkForUpdates', () => {
  it('returns no-folder when unset', async () => {
    expect(await checkForUpdates('', '0.1.0')).toEqual({ status: 'no-folder' })
  })

  it('finds a newer installer', async () => {
    const folder = await makeUpdatesDir(['MyFileSync-Setup-0.1.0.exe', 'MyFileSync-Setup-0.2.0.exe'])
    const result = await checkForUpdates(folder, '0.1.0')
    expect(result.status).toBe('update-available')
    if (result.status === 'update-available') {
      expect(result.latestVersion).toBe('0.2.0')
      expect(result.installerPath.endsWith('MyFileSync-Setup-0.2.0.exe')).toBe(true)
    }
  })

  it('returns up-to-date when no newer installer exists', async () => {
    const folder = await makeUpdatesDir(['MyFileSync-Setup-0.1.0.exe'])
    const result = await checkForUpdates(folder, '0.1.0')
    expect(result.status).toBe('up-to-date')
  })
})
