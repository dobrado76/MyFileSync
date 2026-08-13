import { describe, expect, it } from 'vitest'
import {
  isFileHashCacheCurrent,
  parseFileHashCache,
  serializeFileHashCache,
} from '@shared/ads/hashCache'

describe('ADS hash cache payload', () => {
  it('round-trips hash with size and mtime', () => {
    const entry = { hash: 'abc123', size: 4096, mtimeMs: 1_700_000_000_000 }
    const parsed = parseFileHashCache(`${serializeFileHashCache(entry)}\0\r\n`)
    expect(parsed).toEqual(entry)
  })

  it('rejects legacy hash-only streams (cannot know if stale)', () => {
    expect(parseFileHashCache('d41d8cd98f00b204e9800998ecf8427e\0\r\n')).toBeUndefined()
  })

  it('is current only when size and mtime still match', () => {
    const entry = { hash: 'abc', size: 10, mtimeMs: 1000 }
    expect(isFileHashCacheCurrent(entry, 10, 1000)).toBe(true)
    expect(isFileHashCacheCurrent(entry, 10, 1001)).toBe(true)
    expect(isFileHashCacheCurrent(entry, 11, 1000)).toBe(false)
    expect(isFileHashCacheCurrent(entry, 10, 5000)).toBe(false)
  })
})
