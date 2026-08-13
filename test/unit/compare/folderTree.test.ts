import { describe, expect, it } from 'vitest'
import { buildFolderTree, pathMatchesFolderName, pathMatchesPrefix } from '../../../src/shared/compare/folderTree'
import type { CompareRow } from '@shared/schemas/compare'

function row(partial: Partial<CompareRow> & { relPath: string }): CompareRow {
  return {
    id: partial.id ?? partial.relPath,
    pairId: 'p',
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

  it('matches a folder prefix including the folder row itself', () => {
    expect(pathMatchesPrefix('neu/a.txt', 'neu')).toBe(true)
    expect(pathMatchesPrefix('neu', 'neu')).toBe(true)
    expect(pathMatchesPrefix('neuter/a.txt', 'neu')).toBe(false)
    expect(pathMatchesPrefix('old/a.txt', 'neu')).toBe(false)
  })

  it('matches a folder name at any depth', () => {
    expect(pathMatchesFolderName('ComfyUI/models/a.safetensors', 'ComfyUI')).toBe(true)
    expect(pathMatchesFolderName('other/ComfyUI/x', 'ComfyUI')).toBe(true)
    expect(pathMatchesFolderName('ComfyUI_windows_portable/x', 'ComfyUI')).toBe(false)
  })
})
