import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import type { CompareRow } from '@shared/schemas/compare'
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

async function collect(job: ReturnType<typeof createDefaultJob>) {
  const rows: CompareRow[] = []
  const result = await getFiles({
    pair: job.pairs[0]!,
    job,
    onDiff: (row) => {
      rows.push(row)
    },
  })
  return { ...result, rows }
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

    const result = await collect(job)
    const rels = result.rows.map((r) => r.relPath).sort()

    expect(result.equalCount).toBe(1)
    expect(result.diffCount).toBe(3)
    expect(rels).toEqual(['changed.txt', 'only-left.txt', 'only-right.txt'])
    expect(result.rows.find((r) => r.relPath === 'only-left.txt')?.action).toBe('Create')
    expect(result.rows.find((r) => r.relPath === 'only-right.txt')?.action).toBe('Delete')
    expect(result.rows.find((r) => r.relPath === 'changed.txt')?.action).toBe('Update')
  })

  it('collapses source-only and target-only folder trees to one row', async () => {
    const { left, right } = await makePair()
    await fs.mkdir(path.join(left, 'src-only'))
    await fs.writeFile(path.join(left, 'src-only', 'child.txt'), 'x')
    await fs.mkdir(path.join(left, 'src-only', 'nested'))
    await fs.writeFile(path.join(left, 'src-only', 'nested', 'deep.txt'), 'z')
    await fs.mkdir(path.join(right, 'trg-only'))
    await fs.writeFile(path.join(right, 'trg-only', 'orphan.txt'), 'y')

    const job = createDefaultJob('test')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []

    const result = await collect(job)
    const rels = result.rows.map((r) => r.relPath).sort()

    expect(rels).toEqual(['src-only', 'trg-only'])
    expect(result.rows.find((r) => r.relPath === 'src-only')?.action).toBe('Create')
    expect(result.rows.find((r) => r.relPath === 'src-only')?.left?.isDir).toBe(true)
    expect(result.rows.find((r) => r.relPath === 'trg-only')?.action).toBe('Delete')
  })

  it('does not emit a folder Update when only directory mtime differs', async () => {
    const { left, right } = await makePair()
    await fs.mkdir(path.join(left, 'keep'))
    await fs.mkdir(path.join(right, 'keep'))
    await fs.writeFile(path.join(left, 'keep', 'a.txt'), 'x')
    await fs.writeFile(path.join(right, 'keep', 'a.txt'), 'x')
    const fileTime = new Date('2020-01-01T00:00:00Z')
    const oldDir = new Date('2020-01-01T00:00:00Z')
    const newDir = new Date('2024-01-01T00:00:00Z')
    await fs.utimes(path.join(left, 'keep', 'a.txt'), fileTime, fileTime)
    await fs.utimes(path.join(right, 'keep', 'a.txt'), fileTime, fileTime)
    await fs.utimes(path.join(left, 'keep'), oldDir, oldDir)
    await fs.utimes(path.join(right, 'keep'), newDir, newDir)

    const job = createDefaultJob('test')
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []

    const result = await collect(job)
    expect(result.rows.map((r) => r.relPath)).toEqual([])
    expect(result.equalCount).toBeGreaterThanOrEqual(1)
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

    const result = await collect(job)
    expect(result.rows.map((r) => r.relPath)).toEqual([])
    expect(result.equalCount).toBe(1)
  })
})
