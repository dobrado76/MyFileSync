import { useCallback, useRef, useState, type PointerEvent } from 'react'
import type { JobFile } from '@shared/schemas/job'
import type { CompareFilter, CompareRow, CompareStats, FolderTreeNode } from '@shared/schemas/compare'
import { displayTreePath, pairLabelFromLeftPath, type PairTreeLabel } from '@shared/compare/folderTree'
import { CompareGrid } from './CompareGrid'
import { FilterManager } from './FilterManager'
import { JobSettingsPanel } from './JobSettingsPanel'
import { RowDetailPanel } from './RowDetailPanel'
import type { LogEntry } from '../store/workbenchStore'
import type { TreeFolderAction } from './CompareFolderTree'

export type MainTab = 'options' | 'compare' | 'filters' | 'log'

const PAIR_LIST_MIN = 40
const PAIR_SPLIT_RESERVE = 220

type BackupMirrorWorkbenchProps = {
  activeJob: JobFile | null
  activePairIndex: number
  mainTab: MainTab
  compareRows: CompareRow[]
  compareRowOffset: number
  compareRowTotal: number
  compareFolderTree: FolderTreeNode | null
  comparePathPrefix: string
  compareFilter: CompareFilter
  compareBusy: boolean
  compareStats: CompareStats | null
  syncBusy: boolean
  syncQueued: boolean
  selectedRow: CompareRow | null
  logs: LogEntry[]
  busy: boolean
  onMainTabChange: (tab: MainTab) => void
  onImportJob: () => void
  onChangeJob: (patch: Partial<JobFile>) => void
  onBrowsePath: (index: number, side: 'left' | 'right') => void
  onSetPairPath: (index: number, side: 'left' | 'right', path: string) => void
  onSetPairEnabled: (index: number, enabled: boolean) => void
  onSetPairListHeight: (height: number, persist?: boolean) => void
  onVariantChange: (variant: JobFile['variant']) => void
  onAddPair: () => void
  onRemovePair: (index: number) => void
  onMovePair: (index: number, direction: -1 | 1) => void
  onFlipPair: (index: number) => void
  onClearList: () => void
  onSaveJob: () => void
  onDeleteJob: () => void
  onCompare: () => void
  onSync: () => void
  onCancel: () => void
  onFilterChange: (filter: CompareFilter) => void
  onSelectFolder: (path: string) => void
  onRowsWindowChange: (offset: number, limit: number) => void
  onFolderAction: (action: TreeFolderAction, path: string, deletes: number) => void
  onOpenPath: (path: string) => void
  onRevealPath: (path: string) => void
  onToggleIncluded: (rowId: string, included: boolean) => void
  onSelectRow: (row: CompareRow | null) => void
  onPairIndexChange: (index: number) => void
  syncFailedRowIds: string[]
  hasSyncErrors: boolean
}

export function BackupMirrorWorkbench(props: BackupMirrorWorkbenchProps) {
  const {
    activeJob,
    activePairIndex,
    mainTab,
    compareRows,
    compareRowOffset,
    compareRowTotal,
    compareFolderTree,
    comparePathPrefix,
    compareFilter,
    compareBusy,
    compareStats,
    syncBusy,
    syncQueued,
    selectedRow,
    logs,
    busy,
    onMainTabChange,
    onImportJob,
    onChangeJob,
    onBrowsePath,
    onSetPairPath,
    onSetPairEnabled,
    onSetPairListHeight,
    onVariantChange,
    onAddPair,
    onRemovePair,
    onMovePair,
    onFlipPair,
    onClearList,
    onSaveJob,
    onDeleteJob,
    onCompare,
    onSync,
    onCancel,
    onFilterChange,
    onSelectFolder,
    onRowsWindowChange,
    onFolderAction,
    onOpenPath,
    onRevealPath,
    onToggleIncluded,
    onSelectRow,
    onPairIndexChange,
    syncFailedRowIds,
    hasSyncErrors,
  } = props

  const enabledPairs = activeJob?.pairs.filter((p) => p.enabled) ?? []
  const pairTreeLabels: PairTreeLabel[] = enabledPairs.map((p) => ({
    pairId: p.id,
    label: pairLabelFromLeftPath(p.left),
  }))
  const pairSourcePaths = Object.fromEntries(enabledPairs.map((p) => [p.id, p.left]))
  const pairRoots = enabledPairs.map((p) => ({ id: p.id, left: p.left, right: p.right }))
  const comparePathLabel =
    comparePathPrefix && pairTreeLabels.length > 1
      ? displayTreePath(comparePathPrefix, pairTreeLabels)
      : comparePathPrefix
  const treeRootLabel =
    enabledPairs.length === 1
      ? enabledPairs[0]?.left.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'All folders'
      : 'All folders'
  const fileCount = compareStats?.total ?? compareRows.length
  const hasSyncWork = (compareStats?.toSync ?? 0) > 0
  const configLocked = compareBusy || syncBusy
  const noEnabledPairs = enabledPairs.length === 0
  const syncDisabled = syncBusy || noEnabledPairs || (!compareBusy && !hasSyncWork)
  const syncLabel = syncQueued && compareBusy ? 'Queued' : 'Sync'
  const syncTitle = compareBusy
    ? syncQueued
      ? 'Sync is queued — click to cancel queue'
      : 'Queue sync to run automatically when compare finishes'
    : hasSyncWork
      ? 'Run sync for included changes'
      : 'Nothing to sync — run Compare first'
  const mainColRef = useRef<HTMLDivElement>(null)
  const pairListRef = useRef<HTMLDivElement>(null)
  const dragHeightRef = useRef<number | null>(null)
  const [dragPairListHeight, setDragPairListHeight] = useState<number | null>(null)
  const [pairSplitDragging, setPairSplitDragging] = useState(false)
  const pairListHeight = dragPairListHeight ?? activeJob?.ui?.pairListHeight ?? null

  const onPairSplitPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const column = mainColRef.current
      const list = pairListRef.current
      if (!column || !list) return
      const startY = event.clientY
      const startHeight = list.getBoundingClientRect().height
      const max = Math.max(PAIR_LIST_MIN, column.clientHeight - PAIR_SPLIT_RESERVE)
      const target = event.currentTarget
      target.setPointerCapture(event.pointerId)
      dragHeightRef.current = startHeight
      setPairSplitDragging(true)
      setDragPairListHeight(startHeight)

      const onMove = (move: globalThis.PointerEvent) => {
        const next = Math.min(max, Math.max(PAIR_LIST_MIN, startHeight + move.clientY - startY))
        dragHeightRef.current = next
        setDragPairListHeight(next)
      }
      const onUp = () => {
        setPairSplitDragging(false)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
        const height = dragHeightRef.current
        dragHeightRef.current = null
        setDragPairListHeight(null)
        if (height != null) onSetPairListHeight(height, true)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    },
    [onSetPairListHeight],
  )

  return (
    <div className="bm-workbench">
      <div className="bm-toolbar">
        <div className="bm-toolbar-left">
          {activeJob ? (
            <label className="bm-field" htmlFor="job-name">
              <span className="bm-label">Name</span>
              <input
                id="job-name"
                className="bm-control bm-name-input"
                value={activeJob.name}
                disabled={configLocked}
                onChange={(e) => onChangeJob({ name: e.target.value })}
                placeholder="Job name"
                title={
                  configLocked
                    ? 'Finish or cancel compare/sync before renaming this job'
                    : 'Rename this job — click Save to keep the change'
                }
              />
            </label>
          ) : null}

          <button
            type="button"
            className="button button-sm"
            disabled={configLocked}
            onClick={onImportJob}
            title={
              configLocked
                ? 'Finish or cancel compare/sync before importing a job'
                : 'Import a FreeFileSync, BackupMirror INI, or MyFileSync job file'
            }
          >
            Import…
          </button>

          {activeJob ? (
            <>
              <button
                type="button"
                className="button button-sm button-primary"
                disabled={busy || configLocked}
                onClick={onSaveJob}
                title={
                  configLocked
                    ? 'Finish or cancel compare/sync before saving job changes'
                    : 'Save the current job to disk (Ctrl+S)'
                }
              >
                Save
              </button>
              <button
                type="button"
                className="button button-sm button-danger"
                disabled={busy || configLocked}
                onClick={onDeleteJob}
                title={
                  configLocked
                    ? 'Finish or cancel compare/sync before deleting this job'
                    : 'Delete this job from the list permanently'
                }
              >
                Delete job
              </button>

              <span className="bm-toolbar-divider" aria-hidden="true" />

              <div className="bm-toolbar-actions">
                <button
                  type="button"
                  className="button button-sm"
                  title="Clear the compare result list"
                  onClick={onClearList}
                >
                  Clear
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="bm-tabs" role="tablist" aria-label="Job views">
          {(
            [
              ['options', 'Options'],
              ['compare', 'Compare'],
              ['filters', 'Filters'],
              ['log', 'Log'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mainTab === id}
              className={`bm-tab ${mainTab === id ? 'bm-tab-active' : ''}`}
              onClick={() => onMainTabChange(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!activeJob ? (
        <div className="empty-workbench">
          <p className="empty-workbench-title">No job loaded</p>
          <p className="empty-workbench-hint">
            Click <strong>+ New</strong> to create a job, or <strong>Import…</strong> to load a
            FreeFileSync <code>.ffs_gui</code> file.
          </p>
        </div>
      ) : (
        <>
          {mainTab === 'options' && (
            <div
              className={`bm-main-column${pairSplitDragging ? ' bm-pair-split-dragging' : ''}`}
              ref={mainColRef}
            >
                <div className="bm-pair-stack">
                  <div className="bm-pair-head">
                    <span className="bm-pair-enable-spacer" title="Include in Compare and Sync" />
                    <span className="bm-label">Source folder</span>
                    <div className="bm-pair-head-mid">
                    <select
                      className="bm-control bm-variant-select"
                      value={activeJob.variant}
                      disabled={configLocked}
                      onChange={(e) => onVariantChange(e.target.value as JobFile['variant'])}
                      title="Sync variant: Mirror, Update, Auto, or Two-way"
                    >
                      <option value="mirror">Mirror</option>
                      <option value="update">Update</option>
                      <option value="automatic">Auto</option>
                      <option value="twoWay">Two-way</option>
                    </select>
                    <select
                      className="bm-control bm-compare-select"
                      disabled={configLocked}
                      value={
                        activeJob.compare.method === 'content'
                          ? `content:${activeJob.compare.contentHash}`
                          : 'sizeAndTime'
                      }
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === 'sizeAndTime') {
                          onChangeJob({
                            compare: { ...activeJob.compare, method: 'sizeAndTime', contentHash: 'md5' },
                          })
                          return
                        }
                        const hash = value === 'content:sha256' ? 'sha256' : 'md5'
                        onChangeJob({
                          compare: { ...activeJob.compare, method: 'content', contentHash: hash },
                        })
                      }}
                      title="How files are compared. Size + date/time is fast. MD5/SHA-256 hashes file contents."
                    >
                      <option value="sizeAndTime">Size + date/time</option>
                      <option value="content:md5">MD5 content</option>
                      <option value="content:sha256">SHA-256 content</option>
                    </select>
                    </div>
                    <span className="bm-label">Target folder</span>
                    <span className="bm-pair-head-actions" />
                  </div>
                  <div
                    className="bm-pair-list"
                    ref={pairListRef}
                    style={
                      pairListHeight == null
                        ? undefined
                        : { height: pairListHeight, maxHeight: 'none' }
                    }
                  >
                    {activeJob.pairs.map((p, i) => (
                      <div
                        key={p.id}
                        className={`bm-pair-row${i === activePairIndex ? ' bm-pair-row-active' : ''}${p.enabled ? '' : ' bm-pair-row-off'}`}
                        onClick={() => onPairIndexChange(i)}
                      >
                        <label
                          className="bm-pair-enable"
                          title="Include this pair in Compare and Sync"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            disabled={configLocked}
                            onChange={(e) => onSetPairEnabled(i, e.target.checked)}
                          />
                        </label>
                        <div className="bm-path-row">
                          <input
                            className="settings-input"
                            type="text"
                            spellCheck={false}
                            autoComplete="off"
                            disabled={configLocked}
                            value={p.left}
                            title={p.left}
                            placeholder="Source folder"
                            onFocus={() => onPairIndexChange(i)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onSetPairPath(i, 'left', e.target.value)}
                          />
                          <button
                            type="button"
                            className="button"
                            disabled={busy || configLocked}
                            onClick={(e) => {
                              e.stopPropagation()
                              onBrowsePath(i, 'left')
                            }}
                          >
                            …
                          </button>
                        </div>
                        <button
                          type="button"
                          className="button bm-pair-flip"
                          title="Swap source and target"
                          disabled={configLocked}
                          onClick={(e) => {
                            e.stopPropagation()
                            onFlipPair(i)
                          }}
                        >
                          ⇄
                        </button>
                        <div className="bm-path-row">
                          <input
                            className="settings-input"
                            type="text"
                            spellCheck={false}
                            autoComplete="off"
                            disabled={configLocked}
                            value={p.right}
                            title={p.right}
                            placeholder="Target folder"
                            onFocus={() => onPairIndexChange(i)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => onSetPairPath(i, 'right', e.target.value)}
                          />
                          <button
                            type="button"
                            className="button"
                            disabled={busy || configLocked}
                            onClick={(e) => {
                              e.stopPropagation()
                              onBrowsePath(i, 'right')
                            }}
                          >
                            …
                          </button>
                        </div>
                        <div className="bm-pair-row-actions">
                          <button
                            type="button"
                            className="button button-sm"
                            title="Move pair up"
                            disabled={configLocked || i === 0}
                            onClick={(e) => {
                              e.stopPropagation()
                              onMovePair(i, -1)
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button button-sm"
                            title="Move pair down"
                            disabled={configLocked || i === activeJob.pairs.length - 1}
                            onClick={(e) => {
                              e.stopPropagation()
                              onMovePair(i, 1)
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="button button-sm"
                            title="Remove this folder pair"
                            disabled={configLocked || activeJob.pairs.length <= 1}
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemovePair(i)
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="bm-add-pair" disabled={configLocked} onClick={onAddPair}>
                    + Add folder pair
                  </button>
                </div>
                <div
                  className="bm-pair-split-gutter"
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="Resize folder pair list"
                  title="Drag to show more or fewer folder pairs"
                  onPointerDown={onPairSplitPointerDown}
                />

                <CompareGrid
                  rows={compareRows}
                  rowOffset={compareRowOffset}
                  rowTotal={compareRowTotal}
                  filter={compareFilter}
                  busy={compareBusy || syncBusy}
                  folderTree={compareFolderTree}
                  pathPrefix={comparePathPrefix}
                  pathPrefixLabel={comparePathLabel}
                  rootLabel={treeRootLabel}
                  pairSourcePaths={pairSourcePaths}
                  pairRoots={pairRoots}
                  syncFailedRowIds={syncFailedRowIds}
                  hasSyncErrors={hasSyncErrors}
                  onFilterChange={onFilterChange}
                  onSelectFolder={onSelectFolder}
                  onRowsWindowChange={onRowsWindowChange}
                  onFolderAction={onFolderAction}
                  onOpenPath={onOpenPath}
                  onRevealPath={onRevealPath}
                  onToggleIncluded={onToggleIncluded}
                  onSelectRow={onSelectRow}
                  onRowDoubleClick={onSelectRow}
                  selectedRowId={selectedRow?.id ?? null}
                />

                {selectedRow ? (
                  <RowDetailPanel row={selectedRow} onClose={() => onSelectRow(null)} />
                ) : null}

                <div className="bm-run-bar">
                  <button
                    type="button"
                    className="button button-primary bm-run-btn"
                    disabled={compareBusy || syncBusy || noEnabledPairs}
                    title={noEnabledPairs ? 'Enable at least one folder pair' : 'Compare enabled folder pairs'}
                    onClick={onCompare}
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    className={`button button-primary ${syncQueued && compareBusy ? 'button-sync-queued' : ''}`}
                    disabled={syncDisabled}
                    title={syncTitle}
                    onClick={onSync}
                  >
                    {syncLabel}
                  </button>
                  <span className="bm-file-count">Files: {fileCount}</span>
                  <div className="bm-run-spacer" />
                  <button type="button" className="button" disabled={!compareBusy && !syncBusy} onClick={onCancel}>
                    Cancel
                  </button>
                </div>
            </div>
          )}

          {mainTab === 'compare' && (
            <JobSettingsPanel job={activeJob} locked={configLocked} onChange={onChangeJob} />
          )}

          {mainTab === 'filters' && (
            <div className="bm-filters-panel">
              <FilterManager
                title="Exclude from compare and sync"
                hint="All instances: !Thumbnails, *.tmp, **/.git/** — gitignore-style, relative to each pair root. This path: /!Thumbnails (root only) or models/!Thumbnails (that folder only). Pick This folder / This file to add a single instance."
                rules={activeJob.filters.exclude}
                pairRoots={activeJob.pairs.flatMap((p) => [p.left, p.right]).filter(Boolean)}
                disabled={configLocked}
                onChange={(exclude) => onChangeJob({ filters: { ...activeJob.filters, exclude } })}
              />
              <FilterManager
                title="Include only (optional)"
                hint="Leave empty to include everything except the exclude list. If you add include rules, only matching items are scanned."
                rules={activeJob.filters.include}
                pairRoots={activeJob.pairs.flatMap((p) => [p.left, p.right]).filter(Boolean)}
                disabled={configLocked}
                onChange={(include) => onChangeJob({ filters: { ...activeJob.filters, include } })}
              />
            </div>
          )}

          {mainTab === 'log' && (
            <div className="bm-log-panel">
              <ul className="run-log-list bm-log-list">
                {logs.length === 0 ? (
                  <li className="run-log-item settings-hint">No log entries yet.</li>
                ) : (
                  logs.map((entry) => (
                    <li key={entry.id} className={`run-log-item run-log-${entry.level}`}>
                      <span className="run-log-time">{entry.time}</span>
                      {entry.message}
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
