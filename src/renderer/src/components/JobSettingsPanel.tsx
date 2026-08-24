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

      id: 'usn-journal',

      keywords: 'usn change journal ntfs incremental skip unchanged folders faster compare',

      node: (

        <>

          <label className="check-row">

            <input

              type="checkbox"

              disabled={locked}

              checked={job.compare.useUsnJournal}

              onChange={(e) =>

                onChange({ compare: { ...job.compare, useUsnJournal: e.target.checked } })

              }

            />

            Use NTFS change journal (skip unchanged folders)

          </label>

          <p className="settings-hint">

            After a completed Compare, the next run only re-checks folders the journal says changed

            (plus leftovers you have not synced yet). If the journal wrapped, was recreated, is

            missing on that volume, or the path is not local NTFS, Compare does a full walk.

          </p>

        </>

      ),

    },

    {

      id: 'touch-time',

      keywords: 'timestamp date time touch size match setfiletime metadata only explorer copy',

      node: (

        <>

          <label className="check-row">

            <input

              type="checkbox"

              disabled={locked}

              checked={job.behavior.touchTimeWhenSizeMatches}

              onChange={(e) =>

                onChange({

                  behavior: { ...job.behavior, touchTimeWhenSizeMatches: e.target.checked },

                })

              }

            />

            Touch timestamps only when file size already matches

          </label>

          <p className="settings-hint">

            When size and alternate streams match but date/time differs, Sync copies timestamps from

            the source instead of re-copying file bytes. Off by default — use after a manual copy

            that left different mod times.

          </p>

        </>

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

      id: 'ads-pair',

      keywords: 'pair ads checkbox skip streams faster compare sync',

      node: (

        <p className="settings-hint">

          Each folder pair has its own <strong>ADS</strong> checkbox on Options. Untick it when that

          pair does not need alternate streams — Compare and Sync skip stream work for that pair.

        </p>

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

    {

      id: 'copy-parallel',

      keywords: 'copy parallelism workers threads performance speed usb sync',

      node: (

        <label className="settings-label">

          Copy parallelism

          <input

            type="number"

            min={1}

            max={32}

            className="settings-input"

            disabled={locked}

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


