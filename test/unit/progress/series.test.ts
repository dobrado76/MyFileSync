import { describe, expect, it } from 'vitest'
import {
  appendSample,
  chartSampleBudget,
  compactSamples,
  chartTimeWindow,
  downsampleEven,
  estimateEtaMs,
  RATE_TAIL,
  recentRate,
} from '../../../src/shared/progress/series'

describe('progress series', () => {
  it('replaces a sample that arrives too soon', () => {
    const first = [{ at: 0, items: 0, bytes: 0 }]
    const next = appendSample(first, { at: 50, items: 2, bytes: 10 })
    expect(next).toHaveLength(1)
    expect(next[0]?.items).toBe(2)
  })

  it('estimates remaining time from recent byte rate', () => {
    const samples = [
      { at: 0, items: 0, bytes: 0 },
      { at: 10_000, items: 10, bytes: 10_000_000 },
    ]
    expect(recentRate(samples, 'bytes')).toBe(1_000_000)
    expect(estimateEtaMs(samples, 10, 20_000_000)).toBe(20_000)
  })

  it('downsampleEven keeps first and last and stays within max', () => {
    const samples = Array.from({ length: 100 }, (_, i) => ({
      at: i * 1000,
      items: i,
      bytes: i * 10,
    }))
    const out = downsampleEven(samples, 10)
    expect(out.length).toBeLessThanOrEqual(10)
    expect(out[0]).toEqual(samples[0])
    expect(out[out.length - 1]).toEqual(samples[99])
  })

  it('compactSamples keeps the start of a long run instead of sliding it off', () => {
    let samples = [{ at: 0, items: 0, bytes: 0 }]
    for (let i = 1; i <= 800; i++) {
      samples = appendSample(samples, { at: i * 200, items: i, bytes: i * 100 }, 200, 80)
    }
    expect(samples[0]?.at).toBe(0)
    expect(samples[samples.length - 1]?.at).toBe(800 * 200)
    expect(samples.length).toBeLessThanOrEqual(80)
    expect(samples[0]?.items).toBe(0)
  })

  it('chartTimeWindow starts at the first sample so a new phase is not a blank hour', () => {
    const window = chartTimeWindow(
      [
        { at: 59 * 60_000, items: 0, bytes: 0 },
        { at: 60 * 60_000, items: 100, bytes: 0 },
      ],
      60 * 60_000,
      66 * 60_000,
    )
    expect(window.startMs).toBe(59 * 60_000)
    expect(window.endMs).toBe(66 * 60_000)
  })

  it('chartSampleBudget is at least one sample per physical plot pixel', () => {
    expect(chartSampleBudget(1400)).toBe(1400 + RATE_TAIL)
    expect(chartSampleBudget(800.4)).toBe(800 + RATE_TAIL)
  })

  it('compactSamples keeps a high-res tail so recentRate still works', () => {
    const samples = compactSamples(
      Array.from({ length: 200 }, (_, i) => ({
        at: i * 200,
        items: i,
        bytes: i * 50,
      })),
      60,
      20,
    )
    const rate = recentRate(samples, 'items', 4000)
    expect(rate).toBeGreaterThan(4)
    expect(rate).toBeLessThan(6)
  })
})
