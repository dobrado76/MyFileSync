import { describe, expect, it } from 'vitest'
import { comparePlannedActions, estimateWorkBytes, sortSyncActions } from '../../../src/shared/sync/order'
import type { CompareRow, PlannedAction } from '@shared/schemas/compare'

function row(partial: Partial<CompareRow> & { relPath: string; action: CompareRow['action'] }): CompareRow {
  return {
    id: partial.id ?? partial.relPath,
    pairId: 'p',
    category: 'leftOnly',
    direction: 'leftToRight',
    included: true,
    adsDelta: { equal: true, added: 0, removed: 0, changed: 0 },
    left: { size: partial.left?.size ?? 0, mtimeMs: 0, isDir: false, adsManifest: partial.left?.adsManifest ?? [] },
    ...partial,
  }
}

function action(partial: Partial<PlannedAction> & Pick<PlannedAction, 'relPath' | 'action'>): PlannedAction {
  return {
    rowId: partial.relPath,
    pairId: 'p',
    direction: 'leftToRight',
    isDir: false,
    excludeStreams: [],
    workBytes: 0,
    ...partial,
  }
}

describe('sync order', () => {
  it('estimates work bytes by action type', () => {
    expect(estimateWorkBytes(row({ relPath: 'a.txt', action: 'Move' }))).toBe(0)
    expect(
      estimateWorkBytes(
        row({
          relPath: 'a.txt',
          action: 'UpdateStreamsOnly',
          left: { size: 1_000_000, mtimeMs: 0, isDir: false, adsManifest: [{ name: 'MD5', size: 32 }] },
        }),
      ),
    ).toBe(32)
    expect(
      estimateWorkBytes(
        row({
          relPath: 'big.bin',
          action: 'Create',
          left: { size: 9_000_000, mtimeMs: 0, isDir: false, adsManifest: [] },
        }),
      ),
    ).toBe(9_000_000)
  })

  it('runs quick action tiers before heavy copies and deletes last', () => {
    const list = [
      action({ relPath: 'z.txt', action: 'Create', workBytes: 100 }),
      action({ relPath: 'a.txt', action: 'Delete', workBytes: 0 }),
      action({ relPath: 'm.txt', action: 'Move', workBytes: 0 }),
      action({ relPath: 's.txt', action: 'UpdateStreamsOnly', workBytes: 64 }),
      action({ relPath: 'u.txt', action: 'Update', workBytes: 500 }),
    ]
    sortSyncActions(list)
    expect(list.map((a) => a.action)).toEqual([
      'Move',
      'UpdateStreamsOnly',
      'Update',
      'Create',
      'Delete',
    ])
  })

  it('sorts smaller work before larger within the same tier', () => {
    const list = [
      action({ relPath: 'b.bin', action: 'Create', workBytes: 9_000 }),
      action({ relPath: 'a.txt', action: 'Create', workBytes: 100 }),
      action({ relPath: 'c.bin', action: 'Update', workBytes: 5_000 }),
      action({ relPath: 'd.txt', action: 'Update', workBytes: 50 }),
    ]
    sortSyncActions(list)
    expect(list.map((a) => `${a.action}:${a.workBytes}`)).toEqual([
      'Update:50',
      'Update:5000',
      'Create:100',
      'Create:9000',
    ])
  })

  it('comparePlannedActions is stable by path within equal tier and size', () => {
    expect(
      comparePlannedActions(
        action({ relPath: 'b.txt', action: 'Create', workBytes: 100 }),
        action({ relPath: 'a.txt', action: 'Create', workBytes: 100 }),
      ),
    ).toBeGreaterThan(0)
  })
})
