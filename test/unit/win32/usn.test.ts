import { describe, expect, it } from 'vitest'
import { queryUsnJournal, readUsnDirtyRelPaths, usnReadShouldAbort } from '../../../src/main/win32/usn'

describe('usnReadShouldAbort', () => {
  it('allows volume churn when nothing under the pair root resolved', () => {
    expect(usnReadShouldAbort(500, 450, 0)).toBeNull()
  })

  it('aborts when every record failed to resolve', () => {
    expect(usnReadShouldAbort(100, 100, 0)).toMatch(/Could not resolve any/)
  })

  it('allows some unresolvable FRNs when at least one pair path was found', () => {
    expect(usnReadShouldAbort(100, 95, 2)).toBeNull()
  })

  it('accepts NTFS file ids with the high bit set (uint64, not int64)', () => {
    const buf = Buffer.alloc(16)
    const fileId = 10_810_890_905_502_955_681n
    expect(() => buf.writeBigUInt64LE(fileId, 8)).not.toThrow()
    expect(buf.readBigUInt64LE(8)).toBe(fileId)
    expect(() => buf.writeBigInt64LE(fileId, 8)).toThrow(/out of range/i)
  })
})

describe('USN journal', () => {
  it('queries and reads recent records on the system volume when Windows exposes one', async () => {
    if (process.platform !== 'win32') return
    const result = await queryUsnJournal('C:\\Windows')
    if (!result.ok) {
      expect(result.error.message).toMatch(/journal|volume/i)
      return
    }
    expect(result.value.journalId).toMatch(/^\d+$/)
    expect(BigInt(result.value.nextUsn) >= BigInt(result.value.firstUsn)).toBe(true)

    const empty = await readUsnDirtyRelPaths(
      'C:\\Windows',
      result.value.nextUsn,
      result.value.journalId,
    )
    expect(empty.ok).toBe(true)
    if (empty.ok) expect(empty.value.relPaths).toEqual([])
  })
})
