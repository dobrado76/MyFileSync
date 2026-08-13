# BackupMirror / DoubleChecker migration

Legacy app: **BackupMirror** (assembly product name **DoubleChecker**, v1.0.0.0, 2013) at:

`E:\Dev\Projects\!CPP\MyExplorer\MyExplorer\BackupMirror`

Config format: **`optionsBackup.ini`** next to the EXE.

MyFileSync replaces INI with **JSON jobs** but provides **Import INI** (Phase 1).

## INI structure

### Global section (key = value)

| INI key | Example | JSON mapping |
|---------|---------|--------------|
| `MinimizeRefresh` | `True` | `behavior.minimizeRefresh` (UI throttle — default true) |
| `DetectMoved` | `True` | `behavior.detectMovedRenamed` |
| `AutoExpand` | `True` | `behavior.autoExpandCompareTree` |
| `UseVolumeShadowCopy` | `True` | `vss.enabled` |
| `AutoBackup` | `False` | `behavior.autoSyncAfterCompare` |
| `FastCompare` | `True` | `compare.fastFolderCompare` |
| `UseArchiveFlag` | `False` | `behavior.archiveFlagScanOnly` (Phase 1.5) |
| `PosX`, `PosY`, `Width`, `Height` | integers | `window-state.json` (not in job JSON) |
| `LastFolder` | path | `settings.lastBrowsePath` |

### Directory pairs

```
Directory = <source> --> <target> [Mirror|Update|Auto] + (True|False)
```

| INI | JSON |
|-----|------|
| Source path | `pairs[].left` |
| Target path | `pairs[].right` |
| `[Mirror]` | `variant: "mirror"` |
| `[Update]` | `variant: "update"` |
| `[Auto]` | `variant: "automatic"` |
| `+ (True)` | `pairs[].enabled: true` |
| `+ (False)` | `pairs[].enabled: false` |

Arrow separator: ` --> ` (space-hyphen-hyphen-greater space) — exact BackupMirror format.

### Filters

```
FileFilter = thumbs.db
FolderFilter = D:\path\to\skip
```

| INI | JSON |
|-----|------|
| `FileFilter` lines | append to `filters.exclude` (exact name in BM; import as exact + warn if no wildcard) |
| `FolderFilter` lines | append to `filters.exclude` as full path or convert to glob under pair root |

## Default JSON after import

Importer sets sensible defaults for fields BackupMirror had implicitly:

```json
{
  "compare": { "method": "sizeAndTime", "contentHash": "md5", "useAdsCache": true, "fastFolderCompare": true },
  "ads": { "syncAllStreams": true, "excludeStreams": [], "writeCacheToAds": true },
  "delete": { "useRecycleBin": false }
}
```

**Note:** BackupMirror used **permanent delete** — importer sets `useRecycleBin: false` to match legacy behavior but shows one-time dialog: “Switch to Recycle Bin deletes (recommended)?”

## Behavior parity notes

| BackupMirror | MyFileSync |
|--------------|------------|
| WinForms action tree | Side-by-side grid + detail dialog |
| `GetFiles` / `GetFilesFast` | `compare/walk.ts` + fast folder ADS |
| `CloneFile` / `CloneDirectory` | `sync/copy.ts` + `ads/copyStreams.ts` |
| MD5 in ADS stream | `ads.writeCacheToAds` + stream name `MD5` |
| Folder stats ADS | Same stream names as optional cache |
| Hard link siblings | Phase 1.5 `sync/hardlink.ts` |
| AlphaVSS | Phase 1.5 `sync/vss.ts` |
| Single-threaded + `DoEvents` | Worker pool + async IPC progress |
| Exact filter match only | Wildcard filters (superset) |

## Import algorithm (Phase 1)

```
1. Read INI as UTF-8 (fallback Latin-1)
2. Parse key=value globals
3. Parse Directory lines with regex:
   ^Directory\s*=\s*(.+?)\s*-->\s*(.+?)\s*\[(Mirror|Update|Auto)\]\s*\+\s*\((True|False)\)\s*$
4. Collect FileFilter / FolderFilter lines
5. Build myfilesync-job JSON v1
6. Assign new UUID job id
7. Save to userData/jobs/{id}.json
8. Return summary: N pairs, variant counts, warnings
```

## Sample INI (from BackupMirror bin)

```ini
MinimizeRefresh = True
DetectMoved = True
AutoExpand = True
UseVolumeShadowCopy = False
AutoBackup = False
FastCompare = True
UseArchiveFlag = False
Directory = D:\!Dev --> W:\!Backup\!Dev [Mirror] + (True)
FileFilter = thumbs.db
FileFilter = desktop.ini
```

## What we do not import

- Window position → app window state only
- Embedded icon resources
- AlphaVSS DLL bitness paths

## Validation after import

User should:

1. Open imported job in Jobs editor — verify paths exist.
2. Run **Compare** on one pair — spot-check ADS badge column.
3. Run **Sync** on test folder before production mirror.

## Related

- [PROJECT_FORMAT.md](PROJECT_FORMAT.md)
- [COMPARE_AND_SYNC.md](COMPARE_AND_SYNC.md)
- [ADS_SYNC.md](ADS_SYNC.md)
