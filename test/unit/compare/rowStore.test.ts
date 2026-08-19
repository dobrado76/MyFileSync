import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import type { CompareRow } from '@shared/schemas/compare'
import { CompareRowStore } from '../../../src/main/compare/rowStore'

const temps: string[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

function row(relPath: string, action: CompareRow['action'] = 'Create'): CompareRow {
  const job = createDefaultJob('t')
  return {
    id: '',
    pairId: job.pairs[0]!.id,
    relPath,
    category: action === 'Delete' ? 'rightOnly' : 'leftOnly',
    action,
    direction: action === 'Delete' ? 'none' : 'leftToRight',
    included: true,
    adsDelta: { equal: true, added: 0, removed: 0, changed: 0 },
    left: action === 'Delete' ? undefined : { size: 1, mtimeMs: 1, isDir: false, adsManifest: [] },
    right: action === 'Delete' ? { size: 1, mtimeMs: 1, isDir: false, adsManifest: [] } : undefined,
  }
}

describe('CompareRowStore', () => {
  it('pages from disk without keeping the full list in memory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-rows-'))
    temps.push(dir)
    const store = new CompareRowStore(path.join(dir, 'run.jsonl'))
    for (let i = 0; i < 20; i++) {
      await store.append(row(`f${i}.txt`))
    }
    store.addEquals(100)
    await store.close()

    const page = await store.getPage(5, 3, 'all')
    expect(page.total).toBe(20)
    expect(page.rows.map((r) => r.relPath)).toEqual(['f5.txt', 'f6.txt', 'f7.txt'])
    expect(store.getStats().equal).toBe(100)
    expect(store.getStats().creates).toBe(20)
    expect(store.getStats().total).toBe(120)

    let n = 0
    for await (const included of store.iterateIncluded()) {
      n++
      expect(included.included).toBe(true)
    }
    expect(n).toBe(20)

    await store.dispose()
  })

  it('drops a folder prefix from the change list', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-rows-'))
    temps.push(dir)
    const store = new CompareRowStore(path.join(dir, 'run.jsonl'))
    await store.append(row('keep/a.txt'))
    await store.append(row('drop/a.txt'))
    await store.append(row('drop/b.txt'))
    await store.close()
    const n = await store.dropMatching((r) => r.relPath.startsWith('drop/'))
    expect(n).toBe(2)
    const page = await store.getPage(0, 50, 'all')
    expect(page.rows.map((r) => r.relPath)).toEqual(['keep/a.txt'])
    await store.dispose()
  })

  it('pages a folder prefix from the slim index and builds a tree without loading every JSON row', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-rows-'))
    temps.push(dir)
    const store = new CompareRowStore(path.join(dir, 'run.jsonl'))
    await store.append(row('keep/a.txt'))
    await store.append(row('drop/a.txt'))
    await store.append(row('drop/nested/b.txt'))
    await store.close()
    const page = await store.getPage(0, 1, 'all', 'drop')
    expect(page.total).toBe(2)
    expect(page.rows.map((r) => r.relPath)).toEqual(['drop/a.txt'])
    const tree = await store.getFolderTree('all')
    expect(tree.children.map((c) => c.name).sort()).toEqual(['drop', 'keep'])
    expect(tree.count).toBe(3)
    await store.dispose()
  })
})
