import { describe, expect, it } from 'vitest'
import { FILE_ATTRIBUTE_READONLY, attrsWithReadOnly } from '../../../src/main/win32/attrs'

describe('attrsWithReadOnly', () => {
  it('sets and clears the read-only bit without touching other flags', () => {
    const archive = 0x00000020
    const withRo = attrsWithReadOnly(archive, true)
    expect(withRo & FILE_ATTRIBUTE_READONLY).toBe(FILE_ATTRIBUTE_READONLY)
    expect(withRo & archive).toBe(archive)
    expect(attrsWithReadOnly(withRo, false) & FILE_ATTRIBUTE_READONLY).toBe(0)
    expect(attrsWithReadOnly(withRo, false) & archive).toBe(archive)
  })
})
