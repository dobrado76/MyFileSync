import type { JobFile } from '@shared/schemas/job'
import { useState } from 'react'

type Tab = 'pairs' | 'variant' | 'compare' | 'ads' | 'filters' | 'advanced'

type JobEditorProps = {
  job: JobFile
  open: boolean
  onClose: () => void
  onSave: () => void
  onChange: (patch: Partial<JobFile>) => void
  onBrowse: (pairId: string, side: 'left' | 'right') => void
}

export function JobEditor({ job, open, onClose, onSave, onChange, onBrowse }: JobEditorProps) {
  const [tab, setTab] = useState<Tab>('pairs')
  if (!open) return null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pairs', label: 'Pairs' },
    { id: 'variant', label: 'Variant' },
    { id: 'compare', label: 'Compare' },
    { id: 'ads', label: 'ADS' },
    { id: 'filters', label: 'Filters' },
    { id: 'advanced', label: 'Advanced' },
  ]

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Edit job</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="tab-bar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'tab-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          <label className="settings-label">
            Name
            <input
              className="settings-input"
              value={job.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </label>

          {tab === 'pairs' &&
            job.pairs.map((pair) => (
              <div key={pair.id} className="pair-block">
                <label className="settings-label">
                  Left ({pair.leftType ?? 'local'})
                  <div className="settings-row">
                    <input
                      className="settings-input"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={pair.left}
                      placeholder="Source folder"
                      onChange={(e) =>
                        onChange({
                          pairs: job.pairs.map((p) =>
                            p.id === pair.id ? { ...p, left: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <button type="button" className="button" onClick={() => onBrowse(pair.id, 'left')}>
                      Browse
                    </button>
                  </div>
                </label>
                <label className="settings-label">
                  Right ({pair.rightType ?? 'local'})
                  <div className="settings-row">
                    <input
                      className="settings-input"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={pair.right}
                      placeholder="Target folder"
                      onChange={(e) =>
                        onChange({
                          pairs: job.pairs.map((p) =>
                            p.id === pair.id ? { ...p, right: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <button type="button" className="button" onClick={() => onBrowse(pair.id, 'right')}>
                      Browse
                    </button>
                  </div>
                </label>
              </div>
            ))}

          {tab === 'variant' && (
            <label className="settings-label">
              Sync variant
              <select
                className="settings-input"
                value={job.variant}
                onChange={(e) => onChange({ variant: e.target.value as JobFile['variant'] })}
              >
                <option value="mirror">Mirror</option>
                <option value="update">Update</option>
                <option value="automatic">Automatic</option>
                <option value="twoWay">Two-way (sync DB)</option>
              </select>
            </label>
          )}

          {tab === 'compare' && (
            <>
              <label className="settings-label">
                Compare method
                <select
                  className="settings-input"
                  value={job.compare.method}
                  onChange={(e) =>
                    onChange({
                      compare: {
                        ...job.compare,
                        method: e.target.value as JobFile['compare']['method'],
                      },
                    })
                  }
                >
                  <option value="sizeAndTime">Size + time</option>
                  <option value="content">Content hash</option>
                </select>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={job.behavior.verifyAfterCopy}
                  onChange={(e) =>
                    onChange({ behavior: { ...job.behavior, verifyAfterCopy: e.target.checked } })
                  }
                />
                Verify after copy
              </label>
            </>
          )}

          {tab === 'ads' && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={job.ads.syncAllStreams}
                  onChange={(e) => onChange({ ads: { ...job.ads, syncAllStreams: e.target.checked } })}
                />
                Sync all alternate streams
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={job.ads.writeCacheToAds}
                  onChange={(e) => onChange({ ads: { ...job.ads, writeCacheToAds: e.target.checked } })}
                />
                Write compare cache to ADS (MD5 / folder stats)
              </label>
            </>
          )}

          {tab === 'filters' && (
            <label className="settings-label">
              Exclude patterns (one per line)
              <textarea
                className="settings-input settings-textarea"
                value={job.filters.exclude.join('\n')}
                onChange={(e) =>
                  onChange({
                    filters: {
                      ...job.filters,
                      exclude: e.target.value.split(/\r?\n/).filter(Boolean),
                    },
                  })
                }
              />
            </label>
          )}

          {tab === 'advanced' && (
            <>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={job.versioning.enabled}
                  onChange={(e) =>
                    onChange({ versioning: { ...job.versioning, enabled: e.target.checked } })
                  }
                />
                Versioning before overwrite
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={job.watch.enabled}
                  onChange={(e) => onChange({ watch: { ...job.watch, enabled: e.target.checked } })}
                />
                RealTimeSync watch (debounced)
              </label>
              <label className="settings-label">
                Compare workers
                <input
                  type="number"
                  min={1}
                  max={32}
                  className="settings-input"
                  value={job.parallelism.compareWorkers}
                  onChange={(e) =>
                    onChange({
                      parallelism: {
                        ...job.parallelism,
                        compareWorkers: parseInt(e.target.value, 10) || 4,
                      },
                    })
                  }
                />
              </label>
              <label className="settings-label">
                Copy parallelism
                <input
                  type="number"
                  min={1}
                  max={32}
                  className="settings-input"
                  value={job.parallelism.copyPerDevice}
                  onChange={(e) =>
                    onChange({
                      parallelism: {
                        ...job.parallelism,
                        copyPerDevice: parseInt(e.target.value, 10) || 6,
                      },
                    })
                  }
                />
              </label>
            </>
          )}
        </div>

        <footer className="modal-footer">
          <button type="button" className="button button-primary" onClick={onSave}>
            Save job
          </button>
        </footer>
      </div>
    </div>
  )
}
