import type { CompareFilter, CompareRow } from '@shared/schemas/compare'

function adsHint(row: CompareRow): string {
  if (row.adsDelta.equal) return ''
  const parts: string[] = []
  if (row.adsDelta.added) parts.push(`+${row.adsDelta.added} ADS`)
  if (row.adsDelta.removed) parts.push(`-${row.adsDelta.removed} ADS`)
  if (row.adsDelta.changed) parts.push(`${row.adsDelta.changed} ADS≠`)
  return parts.join(' ')
}

function rowClass(row: CompareRow): string {
  if (!row.included) return 'row-excluded'
  if (row.action === 'Move' || row.action === 'Rename') return 'row-move'
  switch (row.category) {
    case 'equal':
      return 'row-equal'
    case 'leftOnly':
    case 'leftNewer':
    case 'contentDiff':
      return 'row-copy-ltr'
    case 'rightOnly':
    case 'rightNewer':
      return 'row-copy-rtl'
    case 'adsDiff':
      return 'row-ads-diff'
    default:
      return ''
  }
}

type CompareGridProps = {
  rows: CompareRow[]
  filter: CompareFilter
  busy: boolean
  onFilterChange: (filter: CompareFilter) => void
  onToggleIncluded: (rowId: string, included: boolean) => void
  onSelectRow: (row: CompareRow) => void
  onRowDoubleClick: (row: CompareRow) => void
  selectedRowId: string | null
}

const FILTER_OPTIONS: Array<{ id: CompareFilter; label: string; tooltip: string }> = [
  {
    id: 'all',
    label: 'All',
    tooltip: 'Show every compared item, including files and folders that already match.',
  },
  {
    id: 'differences',
    label: 'Differences',
    tooltip: 'Show only items that differ between source and target — anything that would create, update, delete, or move on sync.',
  },
  {
    id: 'leftOnly',
    label: '← Source only',
    tooltip: 'Show items that exist in the source folder but not on the target (new on source).',
  },
  {
    id: 'rightOnly',
    label: 'Target only →',
    tooltip: 'Show items that exist in the target folder but not in the source.',
  },
  {
    id: 'deleted',
    label: 'Deleted',
    tooltip:
      'Show items gone from the source that will be deleted on the target. Uncheck a row to keep it.',
  },
  {
    id: 'moved',
    label: 'Moved',
    tooltip: 'Show items that were renamed or moved to another folder — sync will rename on the target instead of copy+delete.',
  },
  {
    id: 'adsDiff',
    label: 'ADS ≠',
    tooltip: 'Show items where the main file matches but NTFS alternate data streams differ (MyFileSync specialty).',
  },
]

export function CompareGrid({
  rows,
  filter,
  busy,
  onFilterChange,
  onToggleIncluded,
  onSelectRow,
  onRowDoubleClick,
  selectedRowId,
}: CompareGridProps) {
  return (
    <section className="compare-panel">
      <div className="compare-filter-bar">
        <span className="compare-filter-label">Show</span>
        <div className="filter-toggle-group" role="group" aria-label="Compare result filters">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`filter-toggle ${filter === option.id ? 'filter-toggle-active' : ''}`}
              disabled={busy}
              title={option.tooltip}
              aria-label={option.tooltip}
              aria-pressed={filter === option.id}
              onClick={() => onFilterChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-grid-wrap">
        <table className="compare-grid compare-grid-bm">
          <thead>
            <tr>
              <th className="col-check">☑</th>
              <th className="col-source">Source</th>
              <th className="col-action">Action</th>
              <th className="col-target">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-row">
                  Set source and target folders, then click Compare.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const ads = adsHint(row)
                return (
                  <tr
                    key={row.id}
                    className={`${rowClass(row)} ${selectedRowId === row.id ? 'row-selected' : ''}`}
                    onClick={() => onSelectRow(row)}
                    onDoubleClick={() => onRowDoubleClick(row)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={row.included}
                        disabled={row.action === 'Skip'}
                        onChange={(e) => onToggleIncluded(row.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="path-cell">
                      {row.leftPath ?? (row.left ? row.relPath : '—')}
                      {ads ? <span className="ads-hint"> · {ads}</span> : null}
                    </td>
                    <td className="action-cell">{row.action}</td>
                    <td className="path-cell">{row.rightPath ?? (row.right ? row.relPath : '—')}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
