import { describe, expect, it } from 'vitest'
import type { PlannedAction } from '@shared/schemas/compare'
import { syncProgressPath, syncProgressVerb } from '@shared/sync/progressPath'

function action(partial: Partial<PlannedAction>): PlannedAction {
  return {
    rowId: '1',
    pairId: 'p',
    relPath: 'sub/file.txt',
    action: 'Create',
    direction: 'leftToRight',
    isDir: false,
    excludeStreams: [],
    workBytes: 1,
    ...partial,
  }
}

describe('syncProgressPath', () => {
  it('prefers dest then source over relPath', () => {
    expect(
      syncProgressPath(
        action({
          sourcePath: 'D:\\src\\sub\\file.txt',
          destPath: 'E:\\dst\\sub\\file.txt',
        }),
      ),
    ).toBe('E:\\dst\\sub\\file.txt')
    expect(syncProgressPath(action({ sourcePath: 'D:\\src\\sub\\file.txt' }))).toBe(
      'D:\\src\\sub\\file.txt',
    )
    expect(syncProgressPath(action({}))).toBe('sub/file.txt')
  })
})

describe('syncProgressVerb', () => {
  it('maps sync actions to present-tense labels', () => {
    expect(syncProgressVerb('Create')).toBe('Copying')
    expect(syncProgressVerb('Update')).toBe('Updating')
    expect(syncProgressVerb('UpdateStreamsOnly')).toBe('Updating')
    expect(syncProgressVerb('Delete')).toBe('Deleting')
    expect(syncProgressVerb('Move')).toBe('Moving')
    expect(syncProgressVerb('Rename')).toBe('Renaming')
  })
})
