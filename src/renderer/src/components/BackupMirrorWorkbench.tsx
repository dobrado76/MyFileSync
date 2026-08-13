import type { JobFile, JobSummary } from '@shared/schemas/job'
import type { CompareFilter, CompareRow, CompareStats } from '@shared/schemas/compare'
import { CompareGrid } from './CompareGrid'
import { FilterManager } from './FilterManager'
import { RowDetailPanel } from './RowDetailPanel'
import type { LogEntry } from '../store/workbenchStore'

export type MainTab = 'options' | 'compare' | 'filters' | 'log'

type BackupMirrorWorkbenchProps = {
  jobs: JobSummary[]
  activeJob: JobFile | null
  activePairIndex: number
  mainTab: MainTab
  compareRows: CompareRow[]
  compareFilter: CompareFilter
  compareBusy: boolean
  compareStats: CompareStats | null
  syncBusy: boolean
  selectedRow: CompareRow | null
  logs: LogEntry[]
  busy: boolean
  onMainTabChange: (tab: MainTab) => void
  onSelectJob: (id: string) => void
  onNewJob: () => void
  onChangeJob: (patch: Partial<JobFile>) => void
  onBrowsePath: (side: 'left' | 'right') => void
  onVariantChange: (variant: JobFile['variant']) => void
  onAddPair: () => void
  onRemovePair: () => void
  onMovePairUp: () => void
  onMovePairDown: () => void
  onFlipPair: () => void
  onClearList: () => void
  onSaveJob: () => void
  onDeleteJob: () => void
  onCompare: () => void
  onSync: () => void
  onCancel: () => void
  onFilterChange: (filter: CompareFilter) => void
  onToggleIncluded: (rowId: string, included: boolean) => void
  onSelectRow: (row: CompareRow | null) => void
  onPairIndexChange: (index: number) => void
}

export function BackupMirrorWorkbench(props: BackupMirrorWorkbenchProps) {
  const {
    jobs,
    activeJob,
    activePairIndex,
    mainTab,
    compareRows,
    compareFilter,
    compareBusy,
    compareStats,
    syncBusy,
    selectedRow,
    logs,
    busy,
    onMainTabChange,
    onSelectJob,
    onNewJob,
    onChangeJob,
    onBrowsePath,
    onVariantChange,
    onAddPair,
    onRemovePair,
    onMovePairUp,
    onMovePairDown,
    onFlipPair,
    onClearList,
    onSaveJob,
    onDeleteJob,
    onCompare,
    onSync,
    onCancel,
    onFilterChange,
    onToggleIncluded,
    onSelectRow,
    onPairIndexChange,
  } = props

  const pair = activeJob?.pairs[activePairIndex]
  const fileCount = compareStats?.total ?? compareRows.length

  return (
    <div className="bm-workbench">
      <div className="bm-toolbar">
        <div className="bm-toolbar-left">
          <label className="bm-field" htmlFor="job-select">
            <span className="bm-label">Job</span>
            <select
              id="job-select"
              className="bm-control bm-job-dropdown"
              value={activeJob?.id ?? ''}
              onChange={(e) => onSelectJob(e.target.value)}
              title="Switch between saved jobs"
            >
              {jobs.length === 0 ? <option value="">No jobs</option> : null}
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>

          {activeJob ? (
            <label className="bm-field" htmlFor="job-name">
              <span className="bm-label">Name</span>
              <input
                id="job-name"
                className="bm-control bm-name-input"
                value={activeJob.name}
                onChange={(e) => onChangeJob({ name: e.target.value })}
                placeholder="Job name"
                title="Rename this job — click Save to keep the change"
              />
            </label>
          ) : null}

          <button type="button" className="button button-sm" onClick={onNewJob} title="Create a new empty job">
            + New
          </button>

          {activeJob ? (
            <>
              <button
                type="button"
                className="button button-sm button-primary"
                disabled={busy}
                onClick={onSaveJob}
                title="Save the current job to disk"
              >
                Save
              </button>
              <button
                type="button"
                className="button button-sm button-danger"
                disabled={busy}
                onClick={onDeleteJob}
                title="Delete this job from the list permanently"
              >
                Delete job
              </button>

              <span className="bm-toolbar-divider" aria-hidden="true" />

              <div className="bm-toolbar-actions">
                <button
                  type="button"
                  className="button button-sm"
                  title="Add another source/target folder pair"
                  onClick={onAddPair}
                >
                  + Add
                </button>
                <button type="button" className="button button-sm" title="Move pair up" onClick={onMovePairUp}>
                  ↑
                </button>
                <button type="button" className="button button-sm" title="Move pair down" onClick={onMovePairDown}>
                  ↓
                </button>
                <button
                  type="button"
                  className="button button-sm"
                  title="Swap source and target folders for this pair"
                  onClick={onFlipPair}
                >
                  ⇄ Flip
                </button>
                <button
                  type="button"
                  className="button button-sm"
                  title="Remove the current folder pair"
                  onClick={onRemovePair}
                >
                  Del pair
                </button>
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
            Click <strong>+ New</strong> to create a job, then set source and target folders.
          </p>
        </div>
      ) : (
        <>
          {mainTab === 'options' && (
            <div className="bm-main-column">
                <div className="bm-path-bar">
                  <label className="bm-path-field">
                    <span className="bm-label">Source folder</span>
                    <div className="bm-path-row">
                      <input className="settings-input" readOnly value={pair?.left ?? ''} />
                      <button type="button" className="button" disabled={busy} onClick={() => onBrowsePath('left')}>
                        …
                      </button>
                    </div>
                  </label>

                  <div className="bm-path-middle">
                    {activeJob.pairs.length > 1 ? (
                      <select
                        className="bm-control bm-pair-select"
                        value={activePairIndex}
                        onChange={(e) => onPairIndexChange(Number(e.target.value))}
                        title="Folder pair"
                      >
                        {activeJob.pairs.map((p, i) => (
                          <option key={p.id} value={i}>
                            Pair {i + 1}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <select
                      className="bm-control bm-variant-select"
                      value={activeJob.variant}
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

                  <label className="bm-path-field">
                    <span className="bm-label">Target folder</span>
                    <div className="bm-path-row">
                      <input className="settings-input" readOnly value={pair?.right ?? ''} />
                      <button type="button" className="button" disabled={busy} onClick={() => onBrowsePath('right')}>
                        …
                      </button>
                    </div>
                  </label>
                </div>

                <CompareGrid
                  rows={compareRows}
                  filter={compareFilter}
                  busy={compareBusy || syncBusy}
                  onFilterChange={onFilterChange}
                  onToggleIncluded={onToggleIncluded}
                  onSelectRow={onSelectRow}
                  onRowDoubleClick={onSelectRow}
                  selectedRowId={selectedRow?.id ?? null}
                />

                {selectedRow ? (
                  <RowDetailPanel row={selectedRow} onClose={() => onSelectRow(null)} />
                ) : null}

                <div className="bm-options-bar">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.behavior.detectMovedRenamed}
                      onChange={(e) =>
                        onChangeJob({ behavior: { ...activeJob.behavior, detectMovedRenamed: e.target.checked } })
                      }
                    />
                    Try to detect moved
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.behavior.minimizeRefresh ?? true}
                      onChange={(e) =>
                        onChangeJob({ behavior: { ...activeJob.behavior, minimizeRefresh: e.target.checked } })
                      }
                    />
                    Minimize Refresh
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.behavior.autoExpandCompareTree}
                      onChange={(e) =>
                        onChangeJob({ behavior: { ...activeJob.behavior, autoExpandCompareTree: e.target.checked } })
                      }
                    />
                    Auto Expand tree
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.vss.enabled}
                      onChange={(e) => onChangeJob({ vss: { enabled: e.target.checked } })}
                    />
                    Use Volume Shadow Copy
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.behavior.autoSyncAfterCompare}
                      onChange={(e) =>
                        onChangeJob({ behavior: { ...activeJob.behavior, autoSyncAfterCompare: e.target.checked } })
                      }
                    />
                    Auto Backup
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.compare.fastFolderCompare}
                      onChange={(e) =>
                        onChangeJob({ compare: { ...activeJob.compare, fastFolderCompare: e.target.checked } })
                      }
                    />
                    Fast Compare
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={activeJob.behavior.archiveFlagScanOnly}
                      onChange={(e) =>
                        onChangeJob({ behavior: { ...activeJob.behavior, archiveFlagScanOnly: e.target.checked } })
                      }
                    />
                    Use Archive Flag
                  </label>
                </div>

                <div className="bm-run-bar">
                  <button
                    type="button"
                    className="button button-primary bm-run-btn"
                    disabled={compareBusy || syncBusy}
                    onClick={onCompare}
                  >
                    Compare
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={compareBusy || syncBusy || compareRows.length === 0}
                    onClick={onSync}
                  >
                    Sync
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
            <div className="bm-filters-panel">
              <label className="settings-label">
                Compare method
                <select
                  className="settings-input"
                  value={
                    activeJob.compare.method === 'content'
                      ? `content:${activeJob.compare.contentHash}`
                      : 'sizeAndTime'
                  }
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'sizeAndTime') {
                      onChangeJob({
                        compare: { ...activeJob.compare, method: 'sizeAndTime' },
                      })
                      return
                    }
                    onChangeJob({
                      compare: {
                        ...activeJob.compare,
                        method: 'content',
                        contentHash: value === 'content:sha256' ? 'sha256' : 'md5',
                      },
                    })
                  }}
                >
                  <option value="sizeAndTime">Size + date/time (fast)</option>
                  <option value="content:md5">Content hash — MD5</option>
                  <option value="content:sha256">Content hash — SHA-256</option>
                </select>
              </label>
              <p className="settings-hint">
                <strong>Size + date/time</strong> does not hash. <strong>MD5 / SHA-256 content</strong> hashes
                each file&apos;s bytes. An MD5 stored in ADS is only reused when the cache also recorded
                that file&apos;s size and date/time and they still match — a hash stream by itself is
                ignored as stale.
              </p>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.compare.useAdsCache}
                  onChange={(e) =>
                    onChangeJob({ compare: { ...activeJob.compare, useAdsCache: e.target.checked } })
                  }
                />
                Read ADS hash cache only if size + date/time still match
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.ads.writeCacheToAds}
                  onChange={(e) =>
                    onChangeJob({ ads: { ...activeJob.ads, writeCacheToAds: e.target.checked } })
                  }
                />
                Write hash cache to ADS (hash + size + date/time; restore timestamps)
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.compare.hashWhenSizeOrTimeDiffers}
                  onChange={(e) =>
                    onChangeJob({
                      compare: { ...activeJob.compare, hashWhenSizeOrTimeDiffers: e.target.checked },
                    })
                  }
                />
                Hash content only when size or date/time already differs
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.compare.fastFolderCompare}
                  onChange={(e) =>
                    onChangeJob({
                      compare: { ...activeJob.compare, fastFolderCompare: e.target.checked },
                    })
                  }
                />
                Fast folder compare (skip subtree when ADS folder stats match)
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.behavior.verifyAfterCopy}
                  onChange={(e) =>
                    onChangeJob({ behavior: { ...activeJob.behavior, verifyAfterCopy: e.target.checked } })
                  }
                />
                Verify after copy
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.ads.syncAllStreams}
                  onChange={(e) => onChangeJob({ ads: { ...activeJob.ads, syncAllStreams: e.target.checked } })}
                />
                Sync all alternate data streams
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.delete.useRecycleBin}
                  onChange={(e) =>
                    onChangeJob({ delete: { ...activeJob.delete, useRecycleBin: e.target.checked } })
                  }
                />
                Recycle Bin for deletes
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={activeJob.watch.enabled}
                  onChange={(e) => onChangeJob({ watch: { ...activeJob.watch, enabled: e.target.checked } })}
                />
                Watch folders and auto-sync (RealTimeSync)
              </label>
              <label className="settings-label">
                Compare workers
                <input
                  type="number"
                  min={1}
                  max={32}
                  className="settings-input"
                  value={activeJob.parallelism.compareWorkers}
                  onChange={(e) =>
                    onChangeJob({
                      parallelism: {
                        ...activeJob.parallelism,
                        compareWorkers: parseInt(e.target.value, 10) || 4,
                      },
                    })
                  }
                />
              </label>
            </div>
          )}

          {mainTab === 'filters' && (
            <div className="bm-filters-panel">
              <FilterManager
                title="Exclude from compare and sync"
                hint="All instances: !Thumbnails, *.tmp, **/.git/** — gitignore-style, relative to each pair root. This path: /!Thumbnails (root only) or models/!Thumbnails (that folder only). Pick This folder / This file to add a single instance."
                rules={activeJob.filters.exclude}
                pairRoots={activeJob.pairs.flatMap((p) => [p.left, p.right]).filter(Boolean)}
                onChange={(exclude) => onChangeJob({ filters: { ...activeJob.filters, exclude } })}
              />
              <FilterManager
                title="Include only (optional)"
                hint="Leave empty to include everything except the exclude list. If you add include rules, only matching items are scanned."
                rules={activeJob.filters.include}
                pairRoots={activeJob.pairs.flatMap((p) => [p.left, p.right]).filter(Boolean)}
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
