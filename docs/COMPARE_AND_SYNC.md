# Compare and sync engine

## Sync variants

| Variant | Config | Behavior |
|---------|--------|----------|
| **Mirror** | `mirror` | Left is source of truth. Create/update/delete on right until exact match (including ADS manifests). |
| **Update** | `update` | Copy new/changed left → right. **No deletes** on right from source deletions. |
| **TwoWay** | `twoWay` | Uses sync DB; propagate creates/updates/deletes by rules; newer mtime wins for conflicts. |
| **Automatic** | `automatic` | BackupMirror Auto: newer timestamp wins; items only on right copied to left; merge ADS both ways. |

### FreeFileSync “changes” vs “differences”

**Update** uses **difference compare** (BackupMirror-style): left/right presence and metadata. Two-way jobs also use the sync DB for change-based compare (create vs delete on source).

## Compare pipeline

BackupMirror `GetFiles`: one source folder against the matching target folder, for each **enabled** pair (`pairs[].enabled`). Unticked pairs stay in the job but are skipped. Compare `$DATA`, then ADS if size and time already match, then the next file. Recurse. No two-tree merge.

```mermaid
flowchart TD
  loadJob[Load job JSON]
  probe[Volume probe NTFS file IDs]
  visit[Visit folder pair]
  dirs[Compare subdirs then recurse]
  files[Compare files size time then ADS]
  rightOnly[Target-only names if not Update]
  classify[Classify diffs only]
  loadJob --> probe --> visit
  visit --> dirs --> files --> rightOnly --> classify
```

### Walk (`src/main/compare/getFiles.ts`)

- Input: pair roots, filters (include/exclude globs).
- Output: **diff** rows streamed to a JSONL store (never a giant in-memory array). Equals are counted only.
- A folder missing on the other side is **one** Create or Delete. Children are not listed; sync copies or removes the tree (filters applied during copy).
- File-level diffs are one row each. The grid is **virtualized**: only the visible window is fetched from disk and mounted in the DOM (millions of changes do not become millions of UI rows).
- After compare, a **folder tree** is built from a slim path/action index (not by parsing every JSONL row into memory). Clicking a folder filters the grid to that path prefix (`compare:getRows` `pathPrefix`).
- **Cancel** stops the next item. Compare cancel keeps diffs already found. Sync cancel **drops items that already succeeded** so the next Sync is a resume. Move/rename pairing runs only if Compare finishes.
- Per folder: **FindFirstFile** on source and target (size + mtime from the directory index — files are not opened). Then ADS only if `$DATA` size and time already match. **Folders that exist on both sides compare ADS only** — directory mtime is ignored (adding a file updates the folder clock and must not recopy the tree).
- Skip: `$…` segments and `RECYCLER` (BackupMirror `\$` / `RECYCLER`).
- Symlinks: not followed. Junctions are followed (with a cycle guard).

### SideRecord

```typescript
type SideRecord = {
  relPath: string
  isDir: boolean
  dataSize: number
  mtimeMs: number
  primaryHash?: string
  adsManifest: AdsManifest
  fileId?: string  // BY_HANDLE_FILE_INFORMATION when available
}
```

### Classification categories

| Category | Meaning |
|----------|---------|
| `equal` | No sync needed |
| `leftOnly` | Create on right (mirror/update) |
| `rightOnly` | Delete on right (mirror) or create on left (automatic) |
| `leftNewer` | Copy left → right |
| `rightNewer` | Copy right → left (automatic / two-way) |
| `contentDiff` | Hash differs |
| `adsDiff` | `$DATA` equal, manifests differ |
| `moveCandidate` | Pair with remove+add same hash/size/manifest |

### SyncAction types

| Action | Description |
|--------|-------------|
| `Create` | New file/dir on target |
| `Update` | Replace `$DATA` + sync ADS |
| `UpdateStreamsOnly` | Patch ADS only |
| `Delete` | Remove on target |
| `Move` | Same volume rename on target |
| `Rename` | Path change detected |
| `Link` | Create hard link (multi-root jobs) |
| `Skip` | User excluded or filtered |

## Move/rename detection

Enabled after the paired walk:

1. Pair `Delete` + `Create` **already in the change list** with the same size and mtime (NTFS `Move` preserves both). Same name → **Move**; same parent folder → **Rename**.
2. Whole folders that were collapsed to one Create/Delete are paired the same way when the folder name matches, then sync uses `Directory.Move`.
3. Files inside a **new collapsed folder** are not listed, so they are not paired as individual moves (re-walking those trees after compare was a second crawl).
4. Sync runs moves first, then copies, then deletes. Copy skips a destination that already matches size+time.

## Fast folder compare

Not in the UI. If a job JSON still has `compare.fastFolderCompare` and `ads.writeCacheToAds`:

1. Read folder aggregate ADS on left/right directory hosts.
2. If `FileCount`, `FolderCount`, `FileSize`, … all match, skip recursion (BackupMirror `GetFilesFast`).
3. On mismatch, full walk subtree.

Aggregate stream names (BackupMirror parity):

- `FileCount`, `FolderCount`, `FileTotCount`, `FolderTotCount`, `FileSize`, `FolderSize`

## Execute pipeline

```mermaid
flowchart LR
  queue[Action queue]
  pool[Worker pool]
  copy[copy.ts]
  del[delete.ts]
  ads[ads/copyStreams]
  queue --> pool --> copy
  pool --> del
  copy --> ads
```

- Order: **moves, then creates/updates, then deletes**. A detected move is `rename` on the target (copy+delete only if the volumes differ).
- After each file copy, dest last-write time is set from source with **SetFileTime** (not Node `utimes`). CopyFileEx uses `\\?\` long paths.
- Folder **Create** copies the tree. Folder **Update** / ADS-only never recopies children.
- `parallelism.copyPerDevice`: max concurrent copies per volume root (FFS-style).
- Progress: `{ phase, done, total, currentPath, bytes, etaMs }` events.
- Cancel: abort flag is set immediately (CopyFileEx `pbCancel`). The sync loop yields between items so Cancel IPC is not blocked; in-flight items are not counted as failed. When the run ends, succeeded items are removed from the change list (same as a finished Sync) so you can click Sync again without redo/errors.

### VSS

When copy fails with sharing violation and `vss.enabled`:

1. Snapshot source volume via VSS API.
2. Copy from shadow path with `CopyFileEx`.
3. Release snapshot.

Port concept from BackupMirror AlphaVSS usage.

### Verify

When `behavior.verifyAfterCopy`:

- Re-hash `$DATA` on dest; compare manifests (sizes; optional stream hashes).

## SQLite sync database

Path: `userData/sync-jobs/{jobId}.db`

### Table `file_state`

| Column | Type | Notes |
|--------|------|-------|
| `pair_id` | TEXT | Folder pair |
| `rel_path` | TEXT | Normalized relative path |
| `side` | TEXT | `left` \| `right` |
| `size` | INTEGER | `$DATA` size |
| `mtime_ms` | INTEGER | |
| `file_id` | TEXT | Nullable |
| `primary_hash` | TEXT | Nullable |
| `ads_manifest_json` | TEXT | |
| `last_sync_generation` | INTEGER | Increment each successful sync |

### Table `sync_run`

Run metadata for logs and incremental compare.

Enables:

- Two-way change detection
- Move detection without hash pairing
- “What changed since last run” report

## Filters

| Type | Behavior |
|------|----------|
| Exclude glob | `*.tmp`, `thumbs.db`, `!Thumbnails` (any depth relative to the pair root; `!` is literal) |
| Exclude this path | `/!Thumbnails` (root instance only) or `models/!Thumbnails` (that relative path only) |
| Include glob | Optional allow-list |

BackupMirror used **exact** filename/path only; MyFileSync uses **minimatch** or equivalent for globs.

## Error handling

Map to `AppError` with codes:

| Code | Example |
|------|---------|
| `io` | Generic failure |
| `not-allowed` | Permission denied (ACL). Dest read-only is cleared and does not fail the sync (D22). |
| `busy` | File locked |
| `validation` | Invalid job |
| `cancelled` | User cancel |

Plain-language messages per D11 — no raw `EPERM` to users.

## Performance targets

| Scenario | Target |
|----------|--------|
| 100k files, no ADS | Within 120% of FreeFileSync compare (local SSD) |
| ADS manifest | Always listed and compared (name + size), independent of size/time |
| Parallel copy | Saturate network card on LAN/NAS when `copyPerDevice` tuned |

## Related

- [ADS_SYNC.md](ADS_SYNC.md)
- [PROJECT_FORMAT.md](PROJECT_FORMAT.md)
- [FREEFILESYNC_PARITY.md](FREEFILESYNC_PARITY.md)
