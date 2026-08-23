import { useEffect, useRef, useState } from 'react'
import { formatClock } from '@shared/progress/format'
import { chartTimeWindow, type ProgressSample } from '@shared/progress/series'

type ProgressAreaChartProps = {
  samples: ProgressSample[]
  field: 'items' | 'bytes'
  total: number
  elapsedMs: number
  projectedMs: number
  rateLabel: string
  totalTicks: string[]
  fill: string
  remainFill: string
  onPlotPhysicalWidth?: (px: number) => void
}

function xAt(at: number, startMs: number, rangeMs: number, width: number): number {
  return ((at - startMs) / rangeMs) * width
}

function yAt(value: number, max: number, height: number): number {
  if (max <= 0) return height
  return height - (value / max) * height
}

function areaPath(
  points: Array<{ x: number; y: number }>,
  height: number,
): string {
  if (points.length === 0) return ''
  const first = points[0]!
  const last = points[points.length - 1]!
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`
}

export function ProgressAreaChart({
  samples,
  field,
  total,
  elapsedMs,
  projectedMs,
  rateLabel,
  totalTicks,
  fill,
  remainFill,
  onPlotPhysicalWidth,
}: ProgressAreaChartProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 800, height: 132, dpr: 1 })

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const report = () => {
      const dpr = window.devicePixelRatio || 1
      const cssW = el.clientWidth
      const cssH = el.clientHeight
      const width = Math.max(1, Math.round(cssW * dpr))
      const height = Math.max(1, Math.round(cssH * dpr))
      setBox({ width, height, dpr })
      const pad = Math.round(8 * dpr)
      onPlotPhysicalWidth?.(Math.max(1, width - pad * 2))
    }

    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [onPlotPhysicalWidth])

  const padL = Math.round(8 * box.dpr)
  const padR = padL
  const innerW = Math.max(1, box.width - padL - padR)
  const maxValue = Math.max(total, samples[samples.length - 1]?.[field] ?? 0, 1)
  const { startMs, endMs } = chartTimeWindow(samples, elapsedMs, projectedMs)
  const rangeMs = Math.max(endMs - startMs, 1)
  const done = samples.map((sample) => ({
    x: padL + xAt(sample.at, startMs, rangeMs, innerW),
    y: yAt(sample[field], maxValue, box.height),
  }))
  if (done.length === 1) {
    done.push({ x: done[0]!.x, y: done[0]!.y })
  }
  const last = done[done.length - 1]
  const remain =
    last && total > 0
      ? [
          last,
          { x: padL + innerW, y: yAt(total, maxValue, box.height) },
        ]
      : []

  const timeTicks = [0, 0.25, 0.5, 0.75].map((p) => ({
    x: padL + innerW * p,
    label: formatClock(startMs + rangeMs * p),
    edge: p === 0 ? 'start' : undefined,
  }))

  return (
    <div ref={hostRef} className="progress-chart">
      <svg
        className="progress-chart-svg"
        viewBox={`0 0 ${box.width} ${box.height}`}
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={`h${p}`}
            className="progress-chart-grid"
            x1={padL}
            x2={padL + innerW}
            y1={box.height * p}
            y2={box.height * p}
          />
        ))}
        {timeTicks.map((tick) => (
          <line
            key={`v${tick.x}`}
            className="progress-chart-grid"
            x1={tick.x}
            x2={tick.x}
            y1={0}
            y2={box.height}
          />
        ))}
        {remain.length > 0 ? (
          <path className="progress-chart-remain" d={areaPath(remain, box.height)} fill={remainFill} />
        ) : null}
        {done.length > 0 ? <path d={areaPath(done, box.height)} fill={fill} /> : null}
        {last ? (
          <line
            className="progress-chart-now"
            x1={last.x}
            x2={last.x}
            y1={0}
            y2={box.height}
          />
        ) : null}
      </svg>
      <div className="progress-chart-rate">{rateLabel}</div>
      <div className="progress-chart-totals">
        {totalTicks.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="progress-chart-times">
        {timeTicks.map((tick) => (
          <span
            key={tick.label}
            data-edge={tick.edge}
            style={{ left: `${((tick.x - padL) / innerW) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  )
}
