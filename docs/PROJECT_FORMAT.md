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
    {jobId}.db                  # SQLite sync state (Phase 2+)
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
      "enabled": true
    }
  ],
  "variant": "mirror",
  "compare": {
    "method": "sizeAndTime",
    "contentHash": "md5",
    "hashWhenSizeOrTimeDiffers": true,
    "useAdsCache": true,
    "fastFolderCompare": true
  },
  "ads": {
    "syncAllStreams": true,
    "excludeStreams": ["Zone.Identifier"],
    "writeCacheToAds": true,
    "cacheStreamNames": {
      "fileHash": "MD5",
      "folderStats": ["FileCount", "FolderCount", "FileTotCount", "FolderTotCount", "FileSize", "FolderSize"]
    }
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
    "detectMovedRenamed": true,
    "autoSyncAfterCompare": false,
    "autoExpandCompareTree": true,
    "verifyAfterCopy": false
  },
  "parallelism": {
    "compareWorkers": 4,
    "copyPerDevice": 6
  }
}
```

### Field reference

| Field | Values | Notes |
|-------|--------|-------|
| `variant` | `mirror` \| `update` \| `twoWay` \| `automatic` | `twoWay` requires sync DB (Phase 2) |
| `compare.method` | `sizeAndTime` \| `content` | Content uses `contentHash` |
| `compare.contentHash` | `md5` \| `sha256` \| `none` | |
| `ads.syncAllStreams` | boolean | Default true NTFS→NTFS |
| `ads.writeCacheToAds` | boolean | BackupMirror-style MD5/folder stats on files |
| `filters.include` | glob[] | Empty = all (then exclude applied) |
| `filters.exclude` | glob[] | Wildcards supported (Phase 1) |

## Settings schema (`settings.json`)

| Key | Type | Default |
|-----|------|---------|
| `theme` | `light` \| `dark` \| `system` | `system` |
| `defaultDeleteUseRecycleBin` | boolean | true |
| `defaultCompareWorkers` | number | 4 |
| `defaultCopyPerDevice` | number | 6 |
| `logRetentionDays` | number | 30 |
| `lastJobId` | string \| null | null |

Export/import settings strips `window-state.json` (D15 pattern from MyFileExplorer).

## SQLite sync DB (Phase 2)

Table sketch — finalize in implementation:

| Table | Purpose |
|-------|---------|
| `files` | `job_id`, `pair_id`, `rel_path`, `side`, `size`, `mtime`, `file_id`, `primary_hash`, `ads_manifest_json`, `last_sync_gen` |
| `runs` | `id`, `started_at`, `finished_at`, `actions_counts_json`, `error` |
| `moves` | Detected rename pairs for incremental sync |

## BackupMirror INI mapping

See [BACKUPMIRROR_MIGRATION.md](BACKUPMIRROR_MIGRATION.md).

## Versioning

- Increment `version` in job JSON on breaking schema changes.
- Importer accepts older versions with migration functions in `jobs/migrate.ts`.
