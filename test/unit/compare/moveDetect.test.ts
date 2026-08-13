import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultJob } from '@shared/schemas/job'
import { getFiles } from '../../../src/main/compare/getFiles'
import { applyMoveDetection, pairMoves, type MoveIndexEntry } from '../../../src/main/compare/moveDetect'
import { CompareRowStore } from '../../../src/main/compare/rowStore'

function file(
  partial: Pick<MoveIndexEntry, 'id' | 'relPath' | 'action'> & Partial<MoveIndexEntry>,
): MoveIndexEntry {
  const relPath = partial.relPath
  const name = relPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? relPath
  const parent = relPath.includes('/') ? relPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/') : ''
  return {
    pairId: 'p',
    isDir: false,
    size: 100,
    mtimeMs: 1000,
    name,
    parent,
    ...partial,
  }
}

describe('pairMoves', () => {
  it('pairs a same-name file in another folder as Move', () => {
    const pairs = pairMoves(
      [file({ id: 'c', relPath: 'new/a.txt', action: 'Create' })],
      [file({ id: 'd', relPath: 'old/a.txt', action: 'Delete' })],
    )
    expect(pairs).toEqual([
      {
        deleteId: 'd',
        createId: 'c',
        newRelPath: 'new/a.txt',
        oldRelPath: 'old/a.txt',
        kind: 'Move',
      },
    ])
  })

  it('pairs a same-folder different name as Rename', () => {
    const pairs = pairMoves(
      [file({ id: 'c', relPath: 'dir/b.txt', action: 'Create' })],
      [file({ id: 'd', relPath: 'dir/a.txt', action: 'Delete' })],
    )
    expect(pairs[0]?.kind).toBe('Rename')
  })

  it('pairs a folder with the same name as Move', () => {
    const pairs = pairMoves(
      [
        file({
          id: 'c',
          relPath: 'dest/models',
          action: 'Create',
          isDir: true,
          size: 0,
          name: 'models',
        }),
      ],
      [
        file({
          id: 'd',
          relPath: 'src/models',
          action: 'Delete',
          isDir: true,
          size: 0,
          name: 'models',
        }),
      ],
    )
    expect(pairs[0]?.kind).toBe('Move')
    expect(pairs[0]?.newRelPath).toBe('dest/models')
  })

  it('does not pair files with different size or mtime', () => {
    const pairs = pairMoves(
      [file({ id: 'c', relPath: 'new/a.txt', action: 'Create', size: 200 })],
      [file({ id: 'd', relPath: 'old/a.txt', action: 'Delete', size: 100 })],
    )
    expect(pairs).toEqual([])
  })
})

const temps: string[] = []

async function matchMtime(fromPath: string, toPath: string): Promise<void> {
  const st = await fs.stat(fromPath)
  await fs.utimes(toPath, st.atime, st.mtime)
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('applyMoveDetection', () => {
  it('turns a same-size same-time delete+create into Move', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-move-'))
    temps.push(root)
    const left = path.join(root, 'left')
    const right = path.join(root, 'right')
    await fs.mkdir(path.join(left, 'old'), { recursive: true })
    await fs.mkdir(path.join(left, 'neu'), { recursive: true })
    await fs.mkdir(path.join(right, 'old'), { recursive: true })
    await fs.mkdir(path.join(right, 'neu'), { recursive: true })

    const body = 'moved-file-body'
    await fs.writeFile(path.join(left, 'neu', 'a.txt'), body)
    await fs.writeFile(path.join(right, 'old', 'a.txt'), body)
    await matchMtime(path.join(left, 'neu', 'a.txt'), path.join(right, 'old', 'a.txt'))

    const job = createDefaultJob('move')
    job.pairs[0]!.id = 'p'
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []
    job.behavior.detectMovedRenamed = true

    const store = new CompareRowStore(path.join(root, 'run.jsonl'))
    await getFiles({
      pair: job.pairs[0]!,
      job,
      onDiff: (row) => store.append(row),
    })
    await store.close()
    const n = await applyMoveDetection(store, job)
    expect(n).toBe(1)

    const page = await store.getPage(0, 50, 'moved')
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.action).toBe('Move')
    expect(page.rows[0]?.relPath.replace(/\\/g, '/')).toBe('neu/a.txt')
    expect(page.rows[0]?.fromRelPath?.replace(/\\/g, '/')).toBe('old/a.txt')

    const deleted = await store.getPage(0, 50, 'deleted')
    expect(deleted.rows).toHaveLength(0)
    await store.dispose()
  })

  it('turns a same-name collapsed folder Create+Delete into Move', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-move-dir-'))
    temps.push(root)
    const left = path.join(root, 'left')
    const right = path.join(root, 'right')
    await fs.mkdir(path.join(left, 'dest', 'models'), { recursive: true })
    await fs.mkdir(path.join(left, 'src'), { recursive: true })
    await fs.mkdir(path.join(right, 'dest'), { recursive: true })
    await fs.mkdir(path.join(right, 'src', 'models'), { recursive: true })
    await fs.writeFile(path.join(left, 'dest', 'models', 'readme.txt'), 'models-body')
    await fs.writeFile(path.join(right, 'src', 'models', 'readme.txt'), 'models-body')
    await matchMtime(
      path.join(left, 'dest', 'models', 'readme.txt'),
      path.join(right, 'src', 'models', 'readme.txt'),
    )

    const job = createDefaultJob('move-dir')
    job.pairs[0]!.id = 'p'
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []
    job.behavior.detectMovedRenamed = true

    const store = new CompareRowStore(path.join(root, 'run.jsonl'))
    await getFiles({
      pair: job.pairs[0]!,
      job,
      onDiff: (row) => store.append(row),
    })
    await store.close()
    const n = await applyMoveDetection(store, job)
    expect(n).toBe(1)

    const page = await store.getPage(0, 50, 'moved')
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]?.action).toBe('Move')
    expect(page.rows[0]?.relPath.replace(/\\/g, '/')).toBe('dest/models')
    expect(page.rows[0]?.fromRelPath?.replace(/\\/g, '/')).toBe('src/models')
    await store.dispose()
  })

  it('pairs a file deleted from the old path with a copy inside a new collapsed folder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mfs-move-into-'))
    temps.push(root)
    const left = path.join(root, 'left')
    const right = path.join(root, 'right')
    await fs.mkdir(path.join(left, 'dest'), { recursive: true })
    await fs.mkdir(right, { recursive: true })
    const body = 'into-new-folder'
    await fs.writeFile(path.join(left, 'dest', 'a.txt'), body)
    await fs.writeFile(path.join(right, 'a.txt'), body)
    await matchMtime(path.join(left, 'dest', 'a.txt'), path.join(right, 'a.txt'))

    const job = createDefaultJob('move-into')
    job.pairs[0]!.id = 'p'
    job.pairs[0]!.left = left
    job.pairs[0]!.right = right
    job.filters.exclude = []
    job.behavior.detectMovedRenamed = true

    const store = new CompareRowStore(path.join(root, 'run.jsonl'))
    await getFiles({
      pair: job.pairs[0]!,
      job,
      onDiff: (row) => store.append(row),
    })
    await store.close()
    const n = await applyMoveDetection(store, job)
    expect(n).toBe(1)

    const moved = await store.getPage(0, 50, 'moved')
    expect(moved.rows).toHaveLength(1)
    expect(moved.rows[0]?.action).toBe('Move')
    expect(moved.rows[0]?.relPath.replace(/\\/g, '/')).toBe('dest/a.txt')
    expect(moved.rows[0]?.fromRelPath?.replace(/\\/g, '/')).toBe('a.txt')

    const all = await store.getPage(0, 50, 'all')
    expect(all.rows.some((row) => row.action === 'Create' && row.relPath.replace(/\\/g, '/') === 'dest')).toBe(
      true,
    )
    expect(all.rows.some((row) => row.action === 'Delete')).toBe(false)
    await store.dispose()
  })
})
