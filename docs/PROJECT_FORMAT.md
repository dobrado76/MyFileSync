# Project format — jobs and userData

All app state lives under Electron **`userData`**. Job definitions are portable JSON files.

## Directory layout

```
userData/
  settings.json                 # App preferences (theme, window bounds, defaults)
  jobs/
    {uuid}.json                 # Job definitions
    index.json                  # Optional job ordering / last-open
  sync-jobs/
    {jobId}.db                  # SQLite sync state (two-way)
  logs/
    {timestamp}-{jobId}.jsonl   # Run logs (optional retention setting)
  window-state.json             # Main window geometry (excluded from settings export)
```

## Job file schema (`myfilesync-job` v1)

```json
{
  "format": "myfilesync-job",
  "version": 1,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Dev mirror",
  "pairs": [
    {
      "id": "pair-1",
      "left": "D:\\!Dev",
      "right": "W:\\!Backup\\!Dev",
      "enabled": true,
      "ads": true
    }
  ],
  "variant": "mirror",
  "compare": {
    "useUsnJournal": true
  },
  "ads": {
    "syncAllStreams": true,
    "excludeStreams": ["Zone.Identifier", "MD5"]
  },
  "filters": {
    "include": [],
    "exclude": ["thumbs.db", "desktop.ini", "*.tmp", "$RECYCLE.BIN", "RECYCLER"]
  },
  "delete": {
    "useRecycleBin": true,
    "confirmPermanentMulti": true
  },
  "vss": {
    "enabled": false
  },
  "behavior": {
    "archiveFlagScanOnly": false,
    "touchTimeWhenSizeMatches": false
  },
  "parallelism": {
    "compareWorkers": 4,
    "copyPerDevice": 6
  },
  "ui": {
    "pairListHeight": 200
  }
}
```

### Field reference

| Field | Values | Notes |
|-------|--------|-------|
| `pairs[].enabled` | boolean | Compare and Sync run only ticked pairs. Keep unused pairs in the same job. |
| `pairs[].ads` | boolean | Default true. Off skips ADS compare and extra stream copy for that pair. |
| `ui.pairListHeight` | number (px) | Folder-pair list splitter height. Written when you release the splitter. |
| `variant` | `mirror` \| `update` \| `twoWay` \| `automatic` | `twoWay` uses the sync DB |
| `compare.useUsnJournal` | boolean | Default true — skip unchanged folders via NTFS journal |
| `behavior.touchTimeWhenSizeMatches` | boolean | SetFileTime when size + ADS match but mtime differs |
| `ads.syncAllStreams` | boolean | Default true NTFS→NTFS |
| `filters.include` | glob[] | Empty = all (then exclude applied). Gitignore-style, relative to each pair root. |
| `filters.exclude` | glob[] | `!Thumbnails` any depth; `/!Thumbnails` or `dir/name` this instance only. |

## Settings schema (`settings.json`)

| Key | Type | Default |
|-----|------|---------|
| `theme` | `light` \| `dark` \| `system` | `system` |
| `defaultDeleteUseRecycleBin` | boolean | true |
| `defaultCompareWorkers` | number | 4 |
| `defaultCopyPerDevice` | number | 6 |
| `logRetentionDays` | number | 30 |
| `lastJobId` | string \| null | null |
| `updatesFolder` | string | `""` |
| `hardwareAcceleration` | boolean | `true` — Chromium GPU; off applies on next launch |
| `confirmMirrorDeletes` | boolean | `true` — ask before Sync removes dest files |
| `progressUiExpanded` | boolean | `true` — full progress panel; off is status-bar only |

Export/import settings strips `window-state.json`.

## SQLite sync DB

| Table | Purpose |
|-------|---------|
| `files` | `job_id`, `pair_id`, `rel_path`, `side`, `size`, `mtime`, `file_id`, `primary_hash`, `ads_manifest_json`, `last_sync_gen` |
| `runs` | `id`, `started_at`, `finished_at`, `actions_counts_json`, `error` |
| `moves` | Detected rename pairs for incremental sync |

## BackupMirror INI mapping

Field mapping for old `optionsBackup.ini` files: [BACKUPMIRROR_MIGRATION.md](BACKUPMIRROR_MIGRATION.md).

## FreeFileSync import

**Import…** on the job toolbar reads `.ffs_gui` and `.ffs_batch`:

| FFS | MyFileSync |
|-----|------------|
| Folder pairs | `pairs[]` |
| TimeAndSize / Content | size + date/time (content hash not supported) |
| Mirror / Update / Two-way (or Changes matrix) | `variant` |
| RecycleBin deletion policy | `delete.useRecycleBin` |
| Exclude `\folder\` and `*\name` | gitignore `/folder` and `name` |

Not imported: IgnoreTimeShift, size/time-span filters, post-sync command, email, FFS versioning-on-delete (warning). ADS compare stays on — FFS does not sync streams.

## FreeFileSync export

**Export…** writes `.ffs_gui` or `.ffs_batch` from the current job (pairs, variant, compare method, Recycle Bin / versioning folder, include/exclude). Automatic becomes Mirror. ADS, USN, SFTP, and per-pair enable ticks are not FreeFileSync features — notes are shown after export.

## Versioning

- Increment `version` in job JSON on breaking schema changes.
- Importer accepts older versions with migration functions in `jobs/migrate.ts`.
