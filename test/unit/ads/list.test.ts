import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildStreamPath } from '@shared/ads/paths'
import { listStreams } from '../../../src/main/ads/list'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== 'win32')('listStreams', () => {
  it('lists a tiny named stream without needing to read $DATA', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-list-'))
    temps.push(dir)
    const host = path.join(dir, 'host.bin')
    await fs.writeFile(host, Buffer.alloc(1024, 7))
    await fs.writeFile(buildStreamPath(host, 'MD5'), 'v1|abc|1024|1\0\r\n', 'utf8')

    const listed = await listStreams(host)
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const md5 = listed.value.find((e) => e.name === 'MD5')
    expect(md5).toBeDefined()
    expect(md5!.size).toBeGreaterThan(0)
    expect(listed.value.some((e) => e.name === '::$DATA' || e.name === '$DATA')).toBe(false)
  })
})
