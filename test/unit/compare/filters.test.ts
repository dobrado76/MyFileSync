import { describe, expect, it } from 'vitest'
import { shouldIncludePath } from '@shared/compare/filters'

describe('filters', () => {
  it('excludes matching globs', () => {
    expect(shouldIncludePath('foo/thumbs.db', [], ['thumbs.db'])).toBe(false)
    expect(shouldIncludePath('foo/bar.txt', [], ['*.tmp'])).toBe(true)
  })

  it('honors include list when set', () => {
    expect(shouldIncludePath('keep.txt', ['*.txt'], [])).toBe(true)
    expect(shouldIncludePath('skip.log', ['*.txt'], [])).toBe(false)
  })
})
