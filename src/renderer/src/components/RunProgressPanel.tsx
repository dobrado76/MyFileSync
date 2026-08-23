import { formatBytes, formatByteRate, formatClock, formatEta, formatItemRate } from '@shared/progress/format'
import { estimateEtaMs, projectedDurationMs, recentRate, type ProgressSample } from '@shared/progress/series'
import { ProgressAreaChart } from './ProgressAreaChart'

type RunProgressPanelProps = {
  kind: 'compare' | 'sync'
  phaseLabel: string
  currentPath?: string
  itemsDone: number
  itemsTotal: number
  bytesDone: number
  bytesTotal: number
  samples: ProgressSample[]
  startedAt: number
  now: number
  cancelling: boolean
  onMinimize: () => void
  onCancel: () => void
  onPlotPhysicalWidth?: (px: number) => void
}

export function RunProgressPanel({
  kind,
  phaseLabel,
  currentPath,
  itemsDone,
  itemsTotal,
  bytesDone,
  bytesTotal,
  samples,
  startedAt,
  now,
  cancelling,
  onMinimize,
  onCancel,
  onPlotPhysicalWidth,
}: RunProgressPanelProps) {
  const elapsedMs = Math.max(0, now - startedAt)
  const remainingItems = Math.max(0, itemsTotal - itemsDone)
  const remainingBytes = Math.max(0, bytesTotal - bytesDone)
  const etaMs = itemsTotal > 0 ? estimateEtaMs(samples, remainingItems, remainingBytes) : null
  const projectedMs = projectedDurationMs(elapsedMs, etaMs)
  const itemRate = recentRate(samples, 'items')
  const byteRate = recentRate(samples, 'bytes')
  const percent = itemsTotal > 0 ? Math.min(100, Math.round((itemsDone / itemsTotal) * 100)) : null
  const title =
    percent === null ? `${phaseLabel}…` : `${phaseLabel}… ${percent}%`
  const action =
    currentPath?.trim()
      ? currentPath
      : cancelling
        ? 'Cancelling…'
        : 'Working…'

  return (
    <section className="run-progress" aria-label="Run progress">
      <header className="run-progress-head">
        <div className="run-progress-title-row">
          <h2 className="run-progress-title">{title}</h2>
          <button
            type="button"
            className="run-progress-min"
            title="Show only the status bar"
            aria-label="Minimize progress"
            onClick={onMinimize}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M3 6.5 8 11.5 13 6.5H3z" />
            </svg>
          </button>
        </div>
        <p className="run-progress-current" title={currentPath}>
          {action}
        </p>
      </header>

      {kind === 'sync' ? (
        <ProgressAreaChart
          samples={samples}
          field="bytes"
          total={bytesTotal}
          elapsedMs={elapsedMs}
          projectedMs={projectedMs}
          rateLabel={formatByteRate(byteRate)}
          totalTicks={bytesTotal > 0 ? [formatBytes(bytesTotal), formatBytes(bytesTotal / 2)].filter(Boolean) : []}
          fill="var(--progress-bytes)"
          remainFill="var(--progress-remain)"
          onPlotPhysicalWidth={onPlotPhysicalWidth}
        />
      ) : null}

      <div className="run-progress-stats">
        <div>
          <span className="run-progress-stat-label">Processed</span>
          <strong>
            {itemsDone.toLocaleString()}
            {kind === 'sync' && bytesDone > 0 ? ` (${formatBytes(bytesDone)})` : ''}
          </strong>
          <span className="run-progress-stat-time">{formatClock(elapsedMs)}</span>
        </div>
        <div>
          <span className="run-progress-stat-label">Remaining</span>
          <strong>
            {itemsTotal > 0
              ? `${remainingItems.toLocaleString()}${
                  kind === 'sync' && remainingBytes > 0 ? ` (${formatBytes(remainingBytes)})` : ''
                }`
              : '—'}
          </strong>
          <span className="run-progress-stat-time">{etaMs === null ? '…' : formatEta(etaMs)}</span>
        </div>
      </div>

      <ProgressAreaChart
        samples={samples}
        field="items"
        total={itemsTotal}
        elapsedMs={elapsedMs}
        projectedMs={projectedMs}
        rateLabel={formatItemRate(itemRate)}
        totalTicks={
          itemsTotal > 0
            ? [itemsTotal.toLocaleString(), Math.round(itemsTotal / 2).toLocaleString()]
            : []
        }
        fill="var(--progress-items)"
        remainFill="var(--progress-remain)"
        onPlotPhysicalWidth={onPlotPhysicalWidth}
      />

      <footer className="run-progress-foot">
        <button type="button" className="button" onClick={onCancel} disabled={cancelling}>
          {cancelling ? 'Cancelling…' : 'Stop'}
        </button>
      </footer>
    </section>
  )
}
