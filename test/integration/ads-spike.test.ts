import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listStreams } from '../../src/main/ads/list'
import { copyStreams } from '../../src/main/ads/copyStreams'

const fixtureRoot = path.resolve('test/fixtures/ntfs/generated')
const sourcePath = path.join(fixtureRoot, 'sample-with-ads.txt')
const destPath = path.join(fixtureRoot, 'sample-copy-target.txt')

describe.skipIf(process.platform !== 'win32')('ADS integration (NTFS)', () => {
  it('lists alternate streams on fixture file', async () => {
    const result = await listStreams(sourcePath)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const names = result.value.map((e) => e.name)
    expect(names).toContain('Zone.Identifier')
    expect(names).toContain('parameters')
  })

  it('copies alternate streams and verifies manifest', async () => {
    await fs.writeFile(destPath, 'dest primary body\r\n', 'utf8')

    const copyResult = await copyStreams(sourcePath, destPath)
    expect(copyResult.ok).toBe(true)
    if (!copyResult.ok) return

    expect(copyResult.value.copiedStreams.length).toBeGreaterThanOrEqual(2)

    const sourceList = await listStreams(sourcePath)
    const destList = await listStreams(destPath)
    expect(sourceList.ok && destList.ok).toBe(true)
    if (!sourceList.ok || !destList.ok) return

    expect(destList.value).toEqual(sourceList.value)
  })
})
