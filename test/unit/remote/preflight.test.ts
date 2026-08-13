import { describe, expect, it } from 'vitest'
import { isUncPath, PROBE_STREAM_NAME } from '../../../src/main/remote/preflight'

describe('isUncPath', () => {
  it('detects classic UNC paths', () => {
    expect(isUncPath('\\\\server\\share\\folder')).toBe(true)
    expect(isUncPath('//server/share/folder')).toBe(false)
  })

  it('detects long-path UNC prefixes', () => {
    expect(isUncPath('\\\\?\\UNC\\server\\share')).toBe(true)
  })

  it('rejects local drive paths', () => {
    expect(isUncPath('C:\\Users\\data')).toBe(false)
    expect(isUncPath('\\\\?\\C:\\Users\\data')).toBe(false)
  })
})

describe('PROBE_STREAM_NAME', () => {
  it('matches ADS preflight spec', () => {
    expect(PROBE_STREAM_NAME).toBe('MyFileSyncProbe')
  })
})
