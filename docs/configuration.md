# Configuration

Two layers: **app settings** (`settings.json`) and **job files**.

## App settings

File: `%APPDATA%\myfilesync\settings.json`

| Key | Type | Default | UI |
| --- | --- | --- | --- |
| `updatesFolder` | string | `""` | **Updates folder** |
| `lastJobId` | string, optional | unset | Written when you select a job. Not shown as a field. |
| `hardwareAcceleration` | boolean | `true` | **Use hardware acceleration (GPU)**. Applied on next launch. |
| `confirmMirrorDeletes` | boolean | `true` | **Confirm before deleting on the destination** |
| `progressUiExpanded` | boolean | `true` | Last progress panel open/collapsed choice |
| `progressPanelWidth` | integer 180–1200 | `300` | Drag width of the progress sidebar |

Unknown keys are dropped by the schema. Partial updates merge onto the current file.

**Export settings…** writes JSON:

```json
{ "format": "myfilesync-settings", "version": 1, "settings": { } }
```

`settings` is the whole settings object, including `lastJobId` when set. It does **not** include jobs, compare databases, or `window-state.json`. **Import settings…** replaces app settings with that file. A plain settings object without the envelope is also accepted. Unsupported `version` is rejected.

## Job file

`format`: `myfilesync-job`  
`version`: `1` (schema version, not the app version)  
`id`: UUID

Saved under `%APPDATA%\myfilesync\jobs\`. **Import…** of `.json` loads a job into that store.

### Pairs

| Field | Meaning |
| --- | --- |
| `left` / `right` | Folder paths |
| `enabled` | Pair checkbox |
| `ads` | Pair **ADS** checkbox. Default `true`. |
| `leftType` / `rightType` | Optional `local` or `sftp` |
| `leftSftp` / `rightSftp` | `{ host, username, password or privateKeyPath, optional port }` |

SFTP requires a password or `privateKeyPath`. Streams are not copied over SFTP.

### Compare and ADS

| Field | Default | UI |
| --- | --- | --- |
| `compare.useUsnJournal` | `true` | **Use NTFS change journal** |
| `ads.syncAllStreams` | `true` | **Sync all alternate data streams** |
| `ads.excludeStreams` | `Zone.Identifier`, `MD5` | Not a grid of names in the current Options list. Legacy jobs that listed other excludes keep them. `MD5` is always added on load so an old BackupMirror cache stream is not synced. |

Removed compare fields (`method`, `contentHash`, `useAdsCache`, `writeCacheToAds`, `verifyAfterCopy`, and similar) are stripped when an old job is opened. Do not put them back; they are ignored.

### Other job fields

| Field | Default |
| --- | --- |
| `variant` | `mirror` (`update`, `automatic`, `twoWay`) |
| `filters.include` | `[]` |
| `filters.exclude` | `thumbs.db`, `desktop.ini`, `*.tmp`, `$RECYCLE.BIN`, `RECYCLER` |
| `delete.useRecycleBin` | `true` |
| `delete.confirmPermanentMulti` | `true` (schema; the visible confirm switch is app setting `confirmMirrorDeletes`) |
| `vss.enabled` | `false` — not a working locked-file feature |
| `behavior.archiveFlagScanOnly` | `false` |
| `behavior.touchTimeWhenSizeMatches` | `false` |
| `parallelism.compareWorkers` | `4` (1–32) |
| `parallelism.copyPerDevice` | `6` (1–32) |
| `versioning.enabled` | `false` |
| `versioning.folder` | `.myfilesync-versions` |
| `versioning.keepCount` | `5` |
| `watch.enabled` | `false` |
| `watch.debounceMs` | `2000` (minimum 100) |
| `syncRules` | `[]` — no UI editor |
| `ui.pairListHeight` | optional integer |

Versioning, when enabled in JSON, keeps prior copies before overwrite/delete under the versioning folder, capped by `keepCount`. If you do not see a checkbox, the feature is data-only in that build — confirm the Options list before assuming you can turn it on from the UI.

## Filter syntax

Relative to the pair root. Slashes are normalized.

- No slash (or a pattern without a path): any depth (`*.tmp`, `thumbs.db`).
- Leading slash or a relative path: that instance only (`/folder`, `models/cache`).
- `**/…` is a pattern, not a single path.

**This folder…** / **This file…** refuse paths outside the source and target roots.

## Batch file

```json
{
  "format": "myfilesync-batch",
  "version": 1,
  "jobs": ["<job-uuid-or-path-to-json>"],
  "continueOnError": false
}
```

A JSON array of strings is treated as `jobs` with `continueOnError: false`.

## What is not configuration

- Theme follows the system light/dark preference (CSS), not a saved theme name in `settings.json`.
- There is no environment-variable catalog for end users. Build machines may set Electron/electron-builder variables; those are developer concerns.
- Content hash algorithm is not a user setting in current jobs.
