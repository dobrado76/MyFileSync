import { useState, type ReactNode } from 'react'
import type { JobFile } from '@shared/schemas/job'
import { settingsMatch } from '@shared/settings/search'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { SettingsSearchField } from './SettingsSearchField'

type JobSettingsPanelProps = {
  job: JobFile
  locked: boolean
  onChange: (patch: Partial<JobFile>) => void
}

type SettingRow = {
  id: string
  keywords: string
  node: ReactNode
}

export function JobSettingsPanel({ job, locked, onChange }: JobSettingsPanelProps) {
  const [rawQuery, setRawQuery] = useState('')
  const query = useDebouncedValue(rawQuery, 160)

  const rows: SettingRow[] = [
    {
      id: 'method',
      keywords:
        'compare method size date time fast md5 sha-256 sha256 content hash bytes ads cache stale',
      node: (
        <>
          <label className="settings-label">
            Compare method
            <select
              className="settings-input"
              disabled={locked}
              value={
                job.compare.method === 'content' ? `content:${job.compare.contentHash}` : 'sizeAndTime'
              }
              onChange={(e) => {
                const value = e.target.value
                if (value === 'sizeAndTime') {
                  onChange({
                    compare: { ...job.compare, method: 'sizeAndTime' },
                  })
                  return
                }
                onChange({
                  compare: {
                    ...job.compare,
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
        </>
      ),
    },
    {
      id: 'read-ads-cache',
      keywords: 'read ads hash cache size date time match md5',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.compare.useAdsCache}
            onChange={(e) => onChange({ compare: { ...job.compare, useAdsCache: e.target.checked } })}
          />
          Read ADS hash cache only if size + date/time still match
        </label>
      ),
    },
    {
      id: 'write-ads-cache',
      keywords: 'write hash cache ads md5 size date time restore timestamps',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.ads.writeCacheToAds}
            onChange={(e) => onChange({ ads: { ...job.ads, writeCacheToAds: e.target.checked } })}
          />
          Write hash cache to ADS (hash + size + date/time; restore timestamps)
        </label>
      ),
    },
    {
      id: 'hash-when-differs',
      keywords: 'hash content only when size date time already differs',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.compare.hashWhenSizeOrTimeDiffers}
            onChange={(e) =>
              onChange({
                compare: { ...job.compare, hashWhenSizeOrTimeDiffers: e.target.checked },
              })
            }
          />
          Hash content only when size or date/time already differs
        </label>
      ),
    },
    {
      id: 'verify',
      keywords: 'verify after copy checksum confirm',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.behavior.verifyAfterCopy}
            onChange={(e) =>
              onChange({ behavior: { ...job.behavior, verifyAfterCopy: e.target.checked } })
            }
          />
          Verify after copy
        </label>
      ),
    },
    {
      id: 'ads-all',
      keywords: 'sync all alternate data streams ads ntfs zone identifier',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.ads.syncAllStreams}
            onChange={(e) => onChange({ ads: { ...job.ads, syncAllStreams: e.target.checked } })}
          />
          Sync all alternate data streams
        </label>
      ),
    },
    {
      id: 'recycle',
      keywords: 'recycle bin deletes trash recyclebin safety',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.delete.useRecycleBin}
            onChange={(e) =>
              onChange({ delete: { ...job.delete, useRecycleBin: e.target.checked } })
            }
          />
          Recycle Bin for deletes
        </label>
      ),
    },
    {
      id: 'watch',
      keywords: 'watch folders auto-sync realtime realtimesync folder watch',
      node: (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={locked}
            checked={job.watch.enabled}
            onChange={(e) => onChange({ watch: { ...job.watch, enabled: e.target.checked } })}
          />
          Watch folders and auto-sync (RealTimeSync)
        </label>
      ),
    },
    {
      id: 'workers',
      keywords: 'compare workers parallelism threads performance speed',
      node: (
        <label className="settings-label">
          Compare workers
          <input
            type="number"
            min={1}
            max={32}
            className="settings-input"
            disabled={locked}
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
      ),
    },
  ]

  const visible = rows.filter((row) => settingsMatch(query, row.keywords, row.id))

  return (
    <div className="bm-filters-panel">
      <SettingsSearchField value={rawQuery} onChange={setRawQuery} />
      {visible.length === 0 ? (
        <p className="settings-hint">No settings match “{query.trim()}”.</p>
      ) : (
        visible.map((row) => (
          <div key={row.id} className="settings-search-hit">
            {row.node}
          </div>
        ))
      )}
    </div>
  )
}
