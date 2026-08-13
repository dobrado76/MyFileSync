import { describe, expect, it } from 'vitest'
import {
  classifyFilter,
  relativeFilterFromAbs,
  shouldIncludePath,
} from '@shared/compare/filters'

describe('filters', () => {
  it('excludes matching globs by file name at any depth', () => {
    expect(shouldIncludePath('foo/thumbs.db', [], ['thumbs.db'])).toBe(false)
    expect(shouldIncludePath('foo/bar.txt', [], ['*.tmp'])).toBe(true)
  })

  it('excludes a named folder at any depth (unanchored gitignore pattern)', () => {
    expect(shouldIncludePath('!Thumbnails', [], ['!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('assets/!Thumbnails', [], ['!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('assets/!Thumbnails/cache.jpg', [], ['!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('assets/keep.txt', [], ['!Thumbnails'])).toBe(true)
  })

  it('excludes a single instance relative to the pair root', () => {
    expect(shouldIncludePath('!Thumbnails', [], ['/!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('!Thumbnails/a.jpg', [], ['/!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('assets/!Thumbnails', [], ['/!Thumbnails'])).toBe(true)
    expect(shouldIncludePath('assets/!Thumbnails', [], ['assets/!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('assets/!Thumbnails/cache.jpg', [], ['assets/!Thumbnails'])).toBe(false)
    expect(shouldIncludePath('other/!Thumbnails', [], ['assets/!Thumbnails'])).toBe(true)
  })

  it('classifies any-instance patterns vs this-path rules', () => {
    expect(classifyFilter('!Thumbnails')).toBe('pattern')
    expect(classifyFilter('*.tmp')).toBe('pattern')
    expect(classifyFilter('**/node_modules/**')).toBe('pattern')
    expect(classifyFilter('/!Thumbnails')).toBe('path')
    expect(classifyFilter('assets/!Thumbnails')).toBe('path')
  })

  it('converts a picked absolute path to a root-relative gitignore rule', () => {
    const root = 'D:\\AI\\ComfyUI_windows_portable'
    expect(relativeFilterFromAbs('D:\\AI\\ComfyUI_windows_portable\\!Thumbnails', [root])).toBe(
      '/!Thumbnails',
    )
    expect(
      relativeFilterFromAbs('D:\\AI\\ComfyUI_windows_portable\\models\\!Thumbnails', [root]),
    ).toBe('models/!Thumbnails')
    expect(relativeFilterFromAbs('D:\\OtherProject\\!Thumbnails', [root])).toBeNull()
  })

  it('honors include list when set', () => {
    expect(shouldIncludePath('keep.txt', ['*.txt'], [])).toBe(true)
    expect(shouldIncludePath('skip.log', ['*.txt'], [])).toBe(false)
  })

  it('ignores comments', () => {
    expect(shouldIncludePath('foo.tmp', [], ['# ignore me', '*.tmp'])).toBe(false)
    expect(shouldIncludePath('foo.txt', [], ['# *.txt'])).toBe(true)
  })
})
