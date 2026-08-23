import { describe, expect, it } from 'vitest'
import { queryUsnJournal, readUsnDirtyRelPaths } from '../../../src/main/win32/usn'

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
