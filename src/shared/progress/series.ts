export type ProgressSample = {
  at: number
  items: number
  bytes: number
}

const MIN_GAP_MS = 200
/** Keep this many newest points at full resolution so the 15s rate window stays accurate. */
export const RATE_TAIL = 90
/** Used before the chart has been measured (≈ 2560 CSS px at 1×). */
export const DEFAULT_SAMPLE_BUDGET = 2560 + RATE_TAIL
const RATE_WINDOW_MS = 15_000

/** At least one sample per physical plot pixel, plus a dense tail for the live rate. */
export function chartSampleBudget(plotPhysicalPx: number, tail = RATE_TAIL): number {
  return Math.max(2, Math.round(plotPhysicalPx)) + Math.max(0, tail)
}

/** Pick `max` points evenly across the series, always keeping first and last. */
export function downsampleEven(samples: readonly ProgressSample[], max: number): ProgressSample[] {
  if (samples.length <= max) return samples.slice()
  if (max <= 1) return samples.slice(-1)
  if (max === 2) return [samples[0]!, samples[samples.length - 1]!]

  const lastIdx = samples.length - 1
  const out: ProgressSample[] = [samples[0]!]
  for (let i = 1; i < max - 1; i++) {
    const idx = Math.round((i / (max - 1)) * lastIdx)
    const sample = samples[idx]!
    if (sample.at !== out[out.length - 1]!.at) out.push(sample)
  }
  const last = samples[lastIdx]!
  if (out[out.length - 1]!.at !== last.at) out.push(last)
  return out
}

/**
 * Compact the series so it still spans the whole run.
 * A sliding window of the last N samples would erase the start of a long job.
 */
export function compactSamples(
  samples: readonly ProgressSample[],
  max = DEFAULT_SAMPLE_BUDGET,
  tailCount = RATE_TAIL,
): ProgressSample[] {
  if (samples.length <= max) return samples.slice()
  const keepTail = Math.min(tailCount, Math.max(2, Math.floor(max / 3)), samples.length)
  const tail = samples.slice(-keepTail)
  const head = samples.slice(0, samples.length - keepTail)
  const headBudget = Math.max(2, max - tail.length)
  const compacted = downsampleEven(head.length > 0 ? head : samples.slice(0, 1), headBudget)
  const joinAt = tail[0]?.at
  while (compacted.length > 0 && joinAt !== undefined && compacted[compacted.length - 1]!.at >= joinAt) {
    compacted.pop()
  }
  return compacted.concat(tail)
}

export function appendSample(
  samples: readonly ProgressSample[],
  next: ProgressSample,
  minGapMs = MIN_GAP_MS,
  max = DEFAULT_SAMPLE_BUDGET,
): ProgressSample[] {
  const last = samples[samples.length - 1]
  if (last && next.at - last.at < minGapMs) {
    const copy = samples.slice(0, -1)
    copy.push(next)
    return copy
  }
  const copy = samples.slice()
  copy.push(next)
  return compactSamples(copy, max)
}

export function recentRate(
  samples: readonly ProgressSample[],
  field: 'items' | 'bytes',
  windowMs = RATE_WINDOW_MS,
): number {
  if (samples.length < 2) return 0
  const end = samples[samples.length - 1]!
  const cutoff = end.at - windowMs
  let start = samples[0]!
  for (let i = samples.length - 2; i >= 0; i--) {
    const sample = samples[i]!
    start = sample
    if (sample.at <= cutoff) break
  }
  const dt = (end.at - start.at) / 1000
  if (dt <= 0) return 0
  return Math.max(0, (end[field] - start[field]) / dt)
}

export function estimateEtaMs(
  samples: readonly ProgressSample[],
  remainingItems: number,
  remainingBytes: number,
): number | null {
  if (remainingItems <= 0 && remainingBytes <= 0) return 0
  const byteRate = recentRate(samples, 'bytes')
  if (remainingBytes > 0 && byteRate > 0) {
    return (remainingBytes / byteRate) * 1000
  }
  const itemRate = recentRate(samples, 'items')
  if (remainingItems > 0 && itemRate > 0) {
    return (remainingItems / itemRate) * 1000
  }
  return null
}

/** Visible X range: this phase only. After Enumerating→Comparing, samples restart at elapsed time. */
export function chartTimeWindow(
  samples: readonly ProgressSample[],
  elapsedMs: number,
  projectedMs: number,
): { startMs: number; endMs: number } {
  const startMs = Math.max(0, samples[0]?.at ?? 0)
  const endMs = Math.max(projectedMs, elapsedMs, startMs + 1)
  return { startMs, endMs }
}

export function projectedDurationMs(
  elapsedMs: number,
  etaMs: number | null,
): number {
  if (etaMs === null) return Math.max(elapsedMs, 1)
  return Math.max(elapsedMs + etaMs, elapsedMs, 1)
}
