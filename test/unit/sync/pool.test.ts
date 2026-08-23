import { describe, expect, it } from 'vitest'
import { runWithConcurrency } from '../../../src/shared/sync/pool'

describe('runWithConcurrency', () => {
  it('runs every item once', async () => {
    const seen: number[] = []
    await runWithConcurrency([1, 2, 3, 4], 2, () => false, async (n) => {
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4])
  })

  it('keeps at most N items in flight', async () => {
    let inFlight = 0
    let maxInFlight = 0
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 3, () => false, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('stops taking new work when cancelled', async () => {
    const seen: number[] = []
    let cancelled = false
    await runWithConcurrency([1, 2, 3, 4, 5], 1, () => cancelled, async (n) => {
      seen.push(n)
      if (n === 2) cancelled = true
    })
    expect(seen).toEqual([1, 2])
  })
})
