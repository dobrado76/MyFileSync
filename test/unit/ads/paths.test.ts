import { describe, expect, it } from 'vitest'
import {
  buildStreamPath,
  manifestsEqual,
  normalizeListedStreamName,
  sortManifest,
  toAdsManifest,
  toLongPath,
  validateStreamName,
  withoutIgnoredStreams,
} from '@shared/ads/paths'

describe('validateStreamName', () => {
  it('rejects empty and reserved names', () => {
    expect(validateStreamName('')).toMatch(/empty/)
    expect(validateStreamName('::$DATA')).toMatch(/reserved/)
  })

  it('rejects invalid characters', () => {
    expect(validateStreamName('bad/name')).toMatch(/invalid/)
  })

  it('accepts valid stream names', () => {
    expect(validateStreamName('Zone.Identifier')).toBeNull()
    expect(validateStreamName('parameters')).toBeNull()
  })
})

describe('buildStreamPath', () => {
  it('builds standard stream path', () => {
    expect(buildStreamPath('C:\\data\\file.txt', 'Zone.Identifier')).toBe(
      'C:\\data\\file.txt:Zone.Identifier:$DATA',
    )
  })

  it('prefixes long paths', () => {
    const longHost = `C:\\${'a'.repeat(260)}\\file.txt`
    const streamPath = buildStreamPath(longHost, 'MD5')
    expect(streamPath.startsWith('\\\\?\\')).toBe(true)
    expect(streamPath.endsWith(':MD5:$DATA')).toBe(true)
  })

  it('normalizes UNC paths for long-path prefix', () => {
    const unc = '\\\\server\\share\\file.txt'
    expect(toLongPath(unc)).toBe('\\\\?\\UNC\\server\\share\\file.txt')
  })
})

describe('normalizeListedStreamName', () => {
  it('parses FindFirstStreamW names', () => {
    expect(normalizeListedStreamName('::$DATA')).toBe('::$DATA')
    expect(normalizeListedStreamName(':Zone.Identifier:$DATA')).toBe('Zone.Identifier')
    expect(normalizeListedStreamName(':parameters:$DATA')).toBe('parameters')
  })
})

describe('manifest helpers', () => {
  it('sorts and compares manifests', () => {
    const unsorted = [
      { name: 'b', size: 2 },
      { name: 'a', size: 1 },
    ]
    expect(sortManifest(unsorted).map((e: { name: string }) => e.name)).toEqual(['a', 'b'])
    expect(manifestsEqual(unsorted, [...unsorted].reverse())).toBe(true)
    expect(manifestsEqual([{ name: 'a', size: 1 }], [{ name: 'a', size: 2 }])).toBe(false)
  })

  it('strips primary stream from raw list', () => {
    const manifest = toAdsManifest([
      { name: '::$DATA', size: 100 },
      { name: 'Zone.Identifier', size: 26 },
    ])
    expect(manifest).toEqual([{ name: 'Zone.Identifier', size: 26 }])
  })

  it('drops ignored stream names', () => {
    const manifest = [
      { name: 'Zone.Identifier', size: 26 },
      { name: 'parameters', size: 12 },
    ]
    expect(withoutIgnoredStreams(manifest, ['Zone.Identifier'])).toEqual([{ name: 'parameters', size: 12 }])
    expect(withoutIgnoredStreams(manifest, 'all')).toEqual([])
  })
})
