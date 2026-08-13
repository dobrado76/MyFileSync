import type { CompareFilter, CompareRow } from '@shared/schemas/compare'

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

function adsBadge(row: CompareRow): string {
  if (row.adsDelta.equal) return '='
  const delta = row.adsDelta.added - row.adsDelta.removed
  if (delta > 0) return `+${row.adsDelta.added}`
  if (delta < 0) return `-${row.adsDelta.removed}`
  return '≠'
}

function rowClass(row: CompareRow): string {
  if (!row.included) return 'row-excluded'
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
  onCompare: () => void
  onSync: () => void
  onToggleIncluded: (rowId: string, included: boolean) => void
  onSelectRow: (row: CompareRow) => void
  selectedRowId: string | null
}

const FILTERS: CompareFilter[] = ['all', 'differences', 'leftOnly', 'rightOnly', 'adsDiff']

export function CompareGrid({
  rows,
  filter,
  busy,
  onFilterChange,
  onCompare,
  onSync,
  onToggleIncluded,
  onSelectRow,
  selectedRowId,
}: CompareGridProps) {
  return (
    <section className="compare-panel">
      <div className="compare-toolbar">
        <button type="button" className="button button-primary" disabled={busy} onClick={onCompare}>
          Compare
        </button>
        <button type="button" className="button button-primary" disabled={busy} onClick={onSync}>
          Sync
        </button>
        <div className="filter-group">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`button ${filter === f ? 'button-active' : ''}`}
              onClick={() => onFilterChange(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-grid-wrap">
        <table className="compare-grid">
          <thead>
            <tr>
              <th>☑</th>
              <th>Path</th>
              <th>Left</th>
              <th>Right</th>
              <th>Action</th>
              <th>ADS</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-row">
                  Run Compare to see differences.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${rowClass(row)} ${selectedRowId === row.id ? 'row-selected' : ''}`}
                  onClick={() => onSelectRow(row)}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={row.included}
                      disabled={row.action === 'Skip'}
                      onChange={(e) => onToggleIncluded(row.id, e.target.checked)}
                    />
                  </td>
                  <td className="path-cell">{row.relPath}</td>
                  <td>
                    {row.left
                      ? `${formatSize(row.left.size)} · ${formatDate(row.left.mtimeMs)}`
                      : '—'}
                  </td>
                  <td>
                    {row.right
                      ? `${formatSize(row.right.size)} · ${formatDate(row.right.mtimeMs)}`
                      : '—'}
                  </td>
                  <td>{row.action}</td>
                  <td>{adsBadge(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
