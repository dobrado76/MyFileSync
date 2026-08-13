import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import { getFiles } from '../../../src/main/compare/getFiles'

const temps: string[] = []

async function makePair(): Promise<{ left: string; right: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-getfiles-'))
  temps.push(root)
  const left = path.join(root, 'left')
  const right = path.join(root, 'right')
  await fs.mkdir(left)
  await fs.mkdir(right)
  return { left, right }
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('getFiles', () => {
  it('counts equals without storing them and emits diffs only', async () => {
    const { left, right } = await makePair()
    await fs.writeFile(path.join(left, 'same.txt'), 'hello')
    await fs.writeFile(path.join(right, 'same.txt'), 'hello')
    const now = new Date()
    await fs.utimes(path.join(left, 'same.txt'), now, now)
    await fs.utimes(path.join(right, 'same.txt'), now, now)

    await fs.writeFile(path.join(left, 'only-left.txt'), 'L')
    await fs.writeFile(path.join(right, 'only-right.txt'), 'R')
    await fs.writeFile(path.join(left, 'changed.txt'), 'old')
    await fs.writeFile(path.join(right, 'changed.txt'), 'new-content')

    const job = createDefaultJob('test')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []

    const result = await getFiles({ pair: job.pairs[0]!, job })
    const rels = result.rows.map((r) => r.relPath).sort()

    expect(result.equalCount).toBe(1)
    expect(rels).toEqual(['changed.txt', 'only-left.txt', 'only-right.txt'])
    expect(result.rows.find((r) => r.relPath === 'only-left.txt')?.action).toBe('Create')
    expect(result.rows.find((r) => r.relPath === 'only-right.txt')?.action).toBe('Delete')
    expect(result.rows.find((r) => r.relPath === 'changed.txt')?.action).toBe('Update')
  })

  it('recurses into source-only folders but not target-only trees', async () => {
    const { left, right } = await makePair()
    await fs.mkdir(path.join(left, 'src-only'))
    await fs.writeFile(path.join(left, 'src-only', 'child.txt'), 'x')
    await fs.mkdir(path.join(right, 'trg-only'))
    await fs.writeFile(path.join(right, 'trg-only', 'orphan.txt'), 'y')

    const job = createDefaultJob('test')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []

    const result = await getFiles({ pair: job.pairs[0]!, job })
    const rels = result.rows.map((r) => r.relPath).sort()

    expect(rels).toContain('src-only')
    expect(rels).toContain('src-only/child.txt')
    expect(rels).toContain('trg-only')
    expect(rels).not.toContain('trg-only/orphan.txt')
  })

  it('skips target-only names in Update jobs', async () => {
    const { left, right } = await makePair()
    await fs.writeFile(path.join(left, 'keep.txt'), 'a')
    await fs.writeFile(path.join(right, 'keep.txt'), 'a')
    const now = new Date()
    await fs.utimes(path.join(left, 'keep.txt'), now, now)
    await fs.utimes(path.join(right, 'keep.txt'), now, now)
    await fs.writeFile(path.join(right, 'extra.txt'), 'b')

    const job = createDefaultJob('test')
    job.variant = 'update'
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []

    const result = await getFiles({ pair: job.pairs[0]!, job })
    expect(result.rows.map((r) => r.relPath)).toEqual([])
    expect(result.equalCount).toBe(1)
  })
})
