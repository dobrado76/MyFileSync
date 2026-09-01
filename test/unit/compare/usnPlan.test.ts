import { describe, expect, it } from 'vitest'
import { createDefaultJob, pairComparesAds } from '@shared/schemas/job'
import {
  buildDirtyPrefixSet,
  compareUsnFilterKey,
  compareUsnPairIdentityKey,
  compareUsnPairKey,
  compareUsnStoreKey,
  describeUsnFilterKeyDiff,
  describeJournalCursorInvalid,
  journalCursorValid,
  legacyUsnPairKeyMatches,
  pathUnderRoot,
  shouldSkipUsnSubtree,
  usnRecordAbsPaths,
} from '@shared/compare/usnPlan'

describe('journalCursorValid', () => {
  const live = { journalId: '10', firstUsn: '100', nextUsn: '500' }

  it('accepts a cursor still in the ring', () => {
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '200' }, live)).toBe(
      true,
    )
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '100' }, live)).toBe(
      true,
    )
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '500' }, live)).toBe(
      true,
    )
  })

  it('rejects a wrapped or recreated journal', () => {
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '50' }, live)).toBe(
      false,
    )
    expect(describeJournalCursorInvalid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '50' }, live)).toMatch(
      /wrapped/i,
    )
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '99', nextUsn: '200' }, live)).toBe(
      false,
    )
    expect(journalCursorValid({ volumeRoot: 'D:\\', journalId: '10', nextUsn: '900' }, live)).toBe(
      false,
    )
    expect(
      journalCursorValid(
        { volumeRoot: 'D:\\', journalId: '10', nextUsn: '200', volumeSerial: '1' },
        { ...live, volumeSerial: '2' },
      ),
    ).toBe(false)
  })
})

describe('dirty prefixes and skip', () => {
  it('marks ancestors so only the dirty branch is walked', () => {
    const dirty = buildDirtyPrefixSet(['photos/2024/a.jpg', 'docs\\readme.txt'])
    expect(dirty.has('photos')).toBe(true)
    expect(dirty.has('photos/2024')).toBe(true)
    expect(dirty.has('photos/2024/a.jpg')).toBe(true)
    expect(dirty.has('docs')).toBe(true)
    expect(shouldSkipUsnSubtree('', dirty)).toBe(false)
    expect(shouldSkipUsnSubtree('photos', dirty)).toBe(false)
    expect(shouldSkipUsnSubtree('photos/2024', dirty)).toBe(false)
    expect(shouldSkipUsnSubtree('photos/2020', dirty)).toBe(true)
    expect(shouldSkipUsnSubtree('music', dirty)).toBe(true)
  })

  it('does not skip a folder that has a dirty descendant', () => {
    const dirty = buildDirtyPrefixSet(['a/b/c.txt'])
    expect(shouldSkipUsnSubtree('a', dirty)).toBe(false)
    expect(shouldSkipUsnSubtree('a/b', dirty)).toBe(false)
    expect(shouldSkipUsnSubtree('a/other', dirty)).toBe(true)
  })
})

describe('pathUnderRoot', () => {
  it('returns a relative path when the file is inside the pair root', () => {
    expect(pathUnderRoot('D:\\Vault\\photos\\a.jpg', 'D:\\Vault')).toBe('photos/a.jpg')
    expect(pathUnderRoot('D:\\Vault', 'D:\\Vault')).toBe('')
    expect(pathUnderRoot('E:\\other\\a.jpg', 'D:\\Vault')).toBeNull()
  })
})

describe('usnRecordAbsPaths', () => {
  it('includes both live FRN path and parent+name when a file was renamed', () => {
    const paths = usnRecordAbsPaths(
      'D:\\Vault\\models\\loras\\prod\\a.safetensors',
      'D:\\Vault\\models\\loras\\!Testing',
      'a.safetensors',
    )
    expect(paths).toEqual([
      'D:\\Vault\\models\\loras\\prod\\a.safetensors',
      'D:\\Vault\\models\\loras\\!Testing\\a.safetensors',
    ])
  })

  it('dedupes when live path already matches the journal name', () => {
    expect(
      usnRecordAbsPaths('D:\\Vault\\keep\\a.txt', 'D:\\Vault\\keep', 'a.txt'),
    ).toEqual(['D:\\Vault\\keep\\a.txt'])
  })

  it('falls back to parent+name when the FRN no longer resolves', () => {
    expect(usnRecordAbsPaths(null, 'D:\\Vault\\!Testing', 'gone.bin')).toEqual([
      'D:\\Vault\\!Testing\\gone.bin',
    ])
  })
})

describe('compareUsnFilterKey', () => {
  it('changes when filters change', () => {
    const job = createDefaultJob('usn')
    const a = compareUsnFilterKey(job)
    job.filters.exclude = [...job.filters.exclude, '*.bak']
    expect(compareUsnFilterKey(job)).not.toBe(a)
  })

  it('does not change when another pair is enabled', () => {
    const job = createDefaultJob('usn')
    job.pairs.push({
      ...job.pairs[0]!,
      id: 'pair-2',
      left: 'D:\\A',
      right: 'E:\\B',
      enabled: false,
    })
    const one = compareUsnFilterKey(job)
    job.pairs[1]!.enabled = true
    expect(compareUsnFilterKey(job)).toBe(one)
    expect(compareUsnPairKey(job.pairs[0]!)).not.toBe(compareUsnPairKey(job.pairs[1]!))
  })

  it('reuses the same store key for the same paths in another job', () => {
    const jobA = createDefaultJob('usn-a')
    const jobB = createDefaultJob('usn-b')
    jobB.pairs[0]!.left = jobA.pairs[0]!.left
    jobB.pairs[0]!.right = jobA.pairs[0]!.right
    expect(compareUsnStoreKey(jobA, jobA.pairs[0]!)).toBe(
      compareUsnStoreKey(jobB, jobB.pairs[0]!),
    )
  })

  it('ignores filter list order when building the filter key', () => {
    const job = createDefaultJob('order')
    const a = compareUsnFilterKey(job)
    job.filters.exclude = [...job.filters.exclude].reverse()
    expect(compareUsnFilterKey(job)).toBe(a)
  })
})

describe('normalizeUsnRootPath', () => {
  it('treats long-path and normal paths as the same pair root', () => {
    const pair = createDefaultJob('x').pairs[0]!
    pair.left = 'D:\\Backup'
    pair.right = 'E:\\Mirror'
    const withLong = {
      ...pair,
      left: '\\\\?\\D:\\Backup',
      right: '\\\\?\\E:\\Mirror',
    }
    expect(compareUsnPairIdentityKey(withLong)).toBe(compareUsnPairIdentityKey(pair))
  })
})

describe('describeUsnFilterKeyDiff', () => {
  it('lists the field that changed', () => {
    const job = createDefaultJob('diff')
    const saved = compareUsnFilterKey(job)
    job.variant = 'update'
    const diffs = describeUsnFilterKeyDiff(saved, job)
    expect(diffs.some((line) => line.startsWith('variant:'))).toBe(true)
  })
})

describe('legacyUsnPairKeyMatches', () => {
  it('matches the same paths under a different pair id', () => {
    const pair = createDefaultJob('x').pairs[0]!
    const legacyKey = `old-id:${pairComparesAds(pair) ? 1 : 0}:${pair.left}\0${pair.right}`
    expect(legacyUsnPairKeyMatches(pair, legacyKey)).toBe(true)
  })
})
