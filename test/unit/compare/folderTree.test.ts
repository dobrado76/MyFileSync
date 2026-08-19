import { describe, expect, it } from 'vitest'
import {
  buildFolderTree,
  displayTreePath,
  joinRootRel,
  pairTreeRootPath,
  pathMatchesFolderName,
  pathMatchesPrefix,
  resolveCompareDiskPaths,
  rowMatchesTreePath,
} from '../../../src/shared/compare/folderTree'
import type { CompareRow } from '@shared/schemas/compare'

function row(partial: Partial<CompareRow> & { relPath: string }): CompareRow {
  return {
    id: partial.id ?? partial.relPath,
    pairId: partial.pairId ?? 'p',
    category: partial.category ?? 'leftOnly',
    action: partial.action ?? 'Create',
    direction: 'leftToRight',
    included: true,
    adsDelta: { equal: true, added: 0, removed: 0, changed: 0 },
    ...partial,
  }
}

describe('folderTree', () => {
  it('nests files under their parent folders', () => {
    const tree = buildFolderTree([
      row({ relPath: 'neu/a.txt' }),
      row({ relPath: 'neu/b.txt', action: 'Update', category: 'leftNewer' }),
      row({ relPath: 'old/a.txt', action: 'Delete', category: 'rightOnly' }),
    ])
    expect(tree.children.map((c) => c.name).sort()).toEqual(['neu', 'old'])
    const neu = tree.children.find((c) => c.name === 'neu')
    expect(neu?.count).toBe(2)
    expect(neu?.creates).toBe(1)
    expect(neu?.updates).toBe(1)
    expect(tree.count).toBe(3)
  })

  it('treats a directory row as its own node', () => {
    const tree = buildFolderTree([
      row({ relPath: 'src-only', left: { size: 0, mtimeMs: 0, isDir: true, adsManifest: [] } }),
    ])
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]?.path).toBe('src-only')
    expect(tree.children[0]?.count).toBe(1)
  })

  it('lists both the old and new folders for a move, without double-counting the root', () => {
    const tree = buildFolderTree([
      row({
        relPath: 'neu/a.txt',
        fromRelPath: 'old/a.txt',
        action: 'Move',
        category: 'leftOnly',
      }),
    ])
    expect(tree.count).toBe(1)
    expect(tree.moves).toBe(1)
    const neu = tree.children.find((c) => c.name === 'neu')
    const old = tree.children.find((c) => c.name === 'old')
    expect(neu?.count).toBe(1)
    expect(old?.count).toBe(1)
  })

  it('groups multi-pair jobs under pair roots', () => {
    const labels = [
      { pairId: 'a', label: 'Test' },
      { pairId: 'b', label: 'Sites' },
    ]
    const tree = buildFolderTree(
      [
        row({ pairId: 'a', relPath: 'foo/a.txt' }),
        row({ pairId: 'b', relPath: 'foo/b.txt' }),
        row({ pairId: 'b', relPath: 'bar/c.txt' }),
      ],
      labels,
    )
    expect(tree.children.map((c) => c.name).sort()).toEqual(['Sites', 'Test'])
    const test = tree.children.find((c) => c.name === 'Test')
    const sites = tree.children.find((c) => c.name === 'Sites')
    expect(test?.path).toBe(pairTreeRootPath('a'))
    expect(test?.children[0]?.path).toBe(`${pairTreeRootPath('a')}/foo`)
    expect(sites?.children.map((c) => c.name).sort()).toEqual(['bar', 'foo'])
    expect(tree.count).toBe(3)
  })

  it('omits pair roots that have no remaining diffs', () => {
    const labels = [
      { pairId: 'a', label: 'Test' },
      { pairId: 'b', label: 'Sites' },
      { pairId: 'c', label: 'InstantID' },
    ]
    const tree = buildFolderTree([row({ pairId: 'b', relPath: 'foo/b.txt' })], labels)
    expect(tree.children.map((c) => c.name)).toEqual(['Sites'])
    expect(tree.count).toBe(1)
  })

  it('keeps single-pair jobs flat under the root', () => {
    const labels = [{ pairId: 'a', label: 'Movies' }]
    const tree = buildFolderTree([row({ pairId: 'a', relPath: 'clip.mkv' })], labels)
    expect(tree.path).toBe('')
    expect(tree.children).toHaveLength(0)
    expect(tree.count).toBe(1)
  })

  it('matches a folder prefix including the folder row itself', () => {
    expect(pathMatchesPrefix('neu/a.txt', 'neu')).toBe(true)
    expect(pathMatchesPrefix('neu', 'neu')).toBe(true)
    expect(pathMatchesPrefix('neuter/a.txt', 'neu')).toBe(false)
    expect(pathMatchesPrefix('old/a.txt', 'neu')).toBe(false)
  })

  it('matches pair-scoped tree paths for multi-pair jobs', () => {
    const treePath = `${pairTreeRootPath('a')}/neu`
    expect(rowMatchesTreePath({ pairId: 'a', relPath: 'neu/x.txt' }, treePath, true)).toBe(true)
    expect(rowMatchesTreePath({ pairId: 'b', relPath: 'neu/x.txt' }, treePath, true)).toBe(false)
    expect(rowMatchesTreePath({ pairId: 'a', relPath: 'neu/x.txt' }, 'neu', false)).toBe(true)
  })

  it('formats pair tree paths for display', () => {
    const labels = [
      { pairId: 'a', label: 'Test' },
      { pairId: 'b', label: 'Sites' },
    ]
    expect(displayTreePath(`${pairTreeRootPath('a')}/neu`, labels)).toBe('Test/neu')
    expect(displayTreePath(pairTreeRootPath('b'), labels)).toBe('Sites')
  })

  it('matches a folder name at any depth', () => {
    expect(pathMatchesFolderName('ComfyUI/models/a.safetensors', 'ComfyUI')).toBe(true)
    expect(pathMatchesFolderName('other/ComfyUI/x', 'ComfyUI')).toBe(true)
    expect(pathMatchesFolderName('ComfyUI_windows_portable/x', 'ComfyUI')).toBe(false)
  })

  it('joins a pair root to a relative compare path', () => {
    expect(joinRootRel('D:\\Movies', 'Action/a.mkv')).toBe('D:\\Movies\\Action\\a.mkv')
    expect(joinRootRel('D:\\Movies\\', '')).toBe('D:\\Movies')
  })

  it('resolves tree nodes to source and target disk paths', () => {
    const pairs = [
      { id: 'p1', left: 'D:\\A', right: 'E:\\A' },
      { id: 'p2', left: 'D:\\B', right: 'E:\\B' },
    ]
    expect(resolveCompareDiskPaths('', pairs)).toBeNull()
    expect(resolveCompareDiskPaths(pairTreeRootPath('p2'), pairs)).toEqual({
      left: 'D:\\B',
      right: 'E:\\B',
    })
    expect(resolveCompareDiskPaths(`${pairTreeRootPath('p1')}/films/x`, pairs)).toEqual({
      left: 'D:\\A\\films\\x',
      right: 'E:\\A\\films\\x',
    })
    expect(resolveCompareDiskPaths('films/x', [pairs[0]!])).toEqual({
      left: 'D:\\A\\films\\x',
      right: 'E:\\A\\films\\x',
    })
  })
})
