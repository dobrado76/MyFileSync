import { useCallback, useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react'
import type { CompareFilter, CompareRow, FolderTreeNode } from '@shared/schemas/compare'
import type { PairDiskRoots } from '@shared/compare/folderTree'
import { CompareFolderTree, type TreeFolderAction } from './CompareFolderTree'
import { CompareInspectMenu } from './CompareInspectMenu'

function adsHint(row: CompareRow): string {
  if (row.adsDelta.equal) return ''
  const parts: string[] = []
  if (row.adsDelta.added) parts.push(`+${row.adsDelta.added} ADS`)
  if (row.adsDelta.removed) parts.push(`-${row.adsDelta.removed} ADS`)
  if (row.adsDelta.changed) parts.push(`${row.adsDelta.changed} ADS≠`)
  return parts.join(' ')
}

function rowClass(row: CompareRow, failed: boolean): string {
  if (failed) return 'row-error'
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
  rowOffset: number
  rowTotal: number
  filter: CompareFilter
  compareListVersion?: number
  busy: boolean
  folderTree: FolderTreeNode | null
  compareRunId?: string | null
  pathPrefix: string
  pathPrefixLabel?: string
  rootLabel: string
  pairSourcePaths?: Record<string, string>
  pairRoots?: PairDiskRoots[]
  syncFailedRowIds: string[]
  hasSyncErrors: boolean
  onFilterChange: (filter: CompareFilter) => void
  onSelectFolder: (path: string) => void
  onFolderAction: (action: TreeFolderAction, path: string, deletes: number) => void
  onToggleIncluded: (rowId: string, included: boolean) => void
  onSelectRow: (row: CompareRow) => void
  onRowDoubleClick: (row: CompareRow) => void
  onRowsWindowChange: (offset: number, limit: number) => void
  onOpenPath: (path: string) => void
  onRevealPath: (path: string) => void
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
  {
    id: 'errors',
    label: 'Errors',
    tooltip: 'Show items that failed on the last sync run.',
  },
]

const TREE_MIN = 140
const TREE_DEFAULT = 220
const ROW_H = 28
const OVERSCAN = 20

export function CompareGrid({
  rows,
  rowOffset,
  rowTotal,
  compareListVersion = 0,
  filter,
  busy,
  folderTree,
  compareRunId,
  pathPrefix,
  pathPrefixLabel,
  rootLabel,
  pairSourcePaths,
  pairRoots,
  syncFailedRowIds,
  hasSyncErrors,
  onFilterChange,
  onSelectFolder,
  onFolderAction,
  onToggleIncluded,
  onSelectRow,
  onRowDoubleClick,
  onRowsWindowChange,
  onOpenPath,
  onRevealPath,
  selectedRowId,
}: CompareGridProps) {
  const failedIds = new Set(syncFailedRowIds)
  const folderChipLabel = pathPrefixLabel ?? pathPrefix
  const emptyMessage = pathPrefix
    ? `No changes in ${folderChipLabel}.`
    : 'Set source and target folders, then click Compare.'
  const splitRef = useRef<HTMLDivElement>(null)
  const [treeWidth, setTreeWidth] = useState(TREE_DEFAULT)
  const [dragging, setDragging] = useState(false)
  const [rowMenu, setRowMenu] = useState<{
    x: number
    y: number
    leftPath?: string
    rightPath?: string
  } | null>(null)

  useEffect(() => {
    if (!rowMenu) return
    const close = () => setRowMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [rowMenu])

  const openRowMenu = (event: MouseEvent, row: CompareRow) => {
    event.preventDefault()
    event.stopPropagation()
    onSelectRow(row)
    const maxX = Math.max(8, window.innerWidth - 280)
    const maxY = Math.max(8, window.innerHeight - 220)
    setRowMenu({
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
      leftPath: row.leftPath,
      rightPath: row.rightPath,
    })
  }

  const onSplitterPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const split = splitRef.current
    if (!split) return
    const startX = event.clientX
    const startWidth = treeWidth
    const max = Math.max(TREE_MIN, Math.floor(split.clientWidth * 0.55))
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    setDragging(true)

    const onMove = (move: globalThis.PointerEvent) => {
      setTreeWidth(Math.min(max, Math.max(TREE_MIN, startWidth + move.clientX - startX)))
    }
    const onUp = () => {
      setDragging(false)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [treeWidth])

  const bodyRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number | null>(null)
  const requestWindow = useCallback(() => {
    const el = bodyRef.current
    if (!el || rowTotal === 0) return
    const start = Math.floor(el.scrollTop / ROW_H)
    const visible = Math.max(1, Math.ceil(el.clientHeight / ROW_H))
    const offset = Math.max(0, start - OVERSCAN)
    const limit = visible + OVERSCAN * 2
    const haveEnd = rowOffset + rows.length
    const needEnd = Math.min(rowTotal, start + visible + OVERSCAN)
    const viewportEnd = start + visible
    const outsideWindow = start >= haveEnd || viewportEnd <= rowOffset
    if (!outsideWindow && rowOffset <= start && haveEnd >= needEnd) return
    onRowsWindowChange(offset, limit)
  }, [onRowsWindowChange, rowOffset, rowTotal, rows.length])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0
  }, [pathPrefix, filter])

  useEffect(() => {
    requestWindow()
  }, [rowTotal, pathPrefix, filter, compareListVersion, requestWindow])

  const onBodyScroll = useCallback(() => {
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      requestWindow()
    })
  }, [requestWindow])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

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
              disabled={busy || (option.id === 'errors' && !hasSyncErrors)}
              title={option.tooltip}
              aria-label={option.tooltip}
              aria-pressed={filter === option.id}
              onClick={() => onFilterChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {pathPrefix ? (
          <button
            type="button"
            className="compare-folder-chip"
            title="Show all folders"
            onClick={() => onSelectFolder('')}
          >
            {folderChipLabel}
            <span aria-hidden="true"> ×</span>
          </button>
        ) : null}
      </div>

      <div className={`compare-split ${dragging ? 'compare-split-dragging' : ''}`} ref={splitRef}>
        <div className="compare-tree-pane" style={{ width: treeWidth }}>
          <CompareFolderTree
            root={folderTree}
            compareRunId={compareRunId}
            selectedPath={pathPrefix}
            rootLabel={rootLabel}
            pairSourcePaths={pairSourcePaths}
            pairRoots={pairRoots}
            busy={busy}
            onSelect={onSelectFolder}
            onFolderAction={onFolderAction}
            onOpenPath={onOpenPath}
            onRevealPath={onRevealPath}
          />
        </div>
        <div
          className="compare-split-gutter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize folder tree"
          onPointerDown={onSplitterPointerDown}
        />
        <div className="compare-grid-wrap">
          <table className="compare-grid compare-grid-bm compare-grid-head">
            <colgroup>
              <col className="col-check" />
              <col className="col-source" />
              <col className="col-action" />
              <col className="col-target" />
            </colgroup>
            <thead>
              <tr>
                <th className="col-check">☑</th>
                <th className="col-source">Source</th>
                <th className="col-action">Action</th>
                <th className="col-target">Target</th>
              </tr>
            </thead>
          </table>
          <div className="compare-grid-body" ref={bodyRef} onScroll={onBodyScroll}>
            {rowTotal === 0 ? (
              <table className="compare-grid compare-grid-bm">
                <colgroup>
                  <col className="col-check" />
                  <col className="col-source" />
                  <col className="col-action" />
                  <col className="col-target" />
                </colgroup>
                <tbody>
                  <tr>
                    <td colSpan={4} className="empty-row">
                      {emptyMessage}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="compare-grid-spacer" style={{ height: rowTotal * ROW_H }}>
                <table
                  className="compare-grid compare-grid-bm compare-grid-window"
                  style={{ top: rowOffset * ROW_H }}
                >
                  <colgroup>
                    <col className="col-check" />
                    <col className="col-source" />
                    <col className="col-action" />
                    <col className="col-target" />
                  </colgroup>
                  <tbody>
                    {rows.map((row) => {
                      const ads = adsHint(row)
                      const failed = failedIds.has(row.id)
                      return (
                        <tr
                          key={row.id}
                          className={`${rowClass(row, failed)} ${selectedRowId === row.id ? 'row-selected' : ''}`}
                          onClick={() => onSelectRow(row)}
                          onDoubleClick={() => onRowDoubleClick(row)}
                          onContextMenu={(event) => openRowMenu(event, row)}
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
                          <td className="action-cell">
                            {row.action}
                            {failed ? <span className="sync-error-hint"> · failed</span> : null}
                          </td>
                          <td className="path-cell">{row.rightPath ?? (row.right ? row.relPath : '—')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {rowMenu ? (
        <div
          className="tree-context-menu"
          style={{ left: rowMenu.x, top: rowMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <CompareInspectMenu
            sourcePath={rowMenu.leftPath}
            targetPath={rowMenu.rightPath}
            onOpen={(path) => {
              setRowMenu(null)
              onOpenPath(path)
            }}
            onReveal={(path) => {
              setRowMenu(null)
              onRevealPath(path)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}
