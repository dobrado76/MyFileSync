import { describe, expect, it } from 'vitest'
import { formatBytes, formatClock, formatEta, formatItemRate } from '@shared/progress/format'

describe('progress format', () => {
  it('formats bytes and clocks', () => {
    expect(formatBytes(141_000_000_000)).toBe('141 GB')
    expect(formatBytes(48_800_000_000)).toBe('48.8 GB')
    expect(formatClock(15_919_000)).toBe('04:25:19')
    expect(formatEta(14_400_000)).toBe('4 hours 0 min')
    expect(formatItemRate(6.2)).toBe('6.2 items/sec')
  })
})
