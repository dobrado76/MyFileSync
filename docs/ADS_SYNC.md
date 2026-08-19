# NTFS Alternate Data Stream sync

MyFileSync’s primary differentiator: compare and copy **NTFS Alternate Data Streams**, not just `$DATA`.

## Concepts

On NTFS, every file and directory has a primary data stream (`::$DATA`) plus zero or more **named alternate streams**. Explorer shows one file size ( `$DATA` only). Tools that copy `$DATA` via simple byte streams **silently drop** alternates.

Examples users care about:

| Stream | Typical content |
|--------|-----------------|
| `Zone.Identifier` | Mark-of-the-web |
| `parameters` | A1111 / Forge generation text (often in PNG tEXt on other platforms; ADS on some workflows) |
| `VER_1`…`VER_4` | Image edit history (named streams) |
| `FileCount`, `TotalSize`, … | Folder statistics caches |
| `MD5` | BackupMirror compare cache |

## Host record model

One **host path** (file or directory) = one sync entity:

```
Host: D:\Photos\img.png
├── ::$DATA           size, mtime, hash
├── Zone.Identifier   size (optional sync)
├── parameters        size
└── MD5               size (optional cache stream)
```

**ADS manifest** (compare unit):

```typescript
type AdsManifestEntry = { name: string; size: number; hash?: string }
type AdsManifest = AdsManifestEntry[]  // sorted by name, excludes ::$DATA
```

## Win32 implementation (main process)

Win32 listing and copy (koffi + stream paths):

| Operation | Mechanism |
|-----------|-----------|
| List | `GetFileInformationByHandleEx(FileStreamInfo)` after `CreateFile` with **FILE_READ_ATTRIBUTES** only (never `FILE_READ_DATA` / `$DATA`) |
| Exists | `GetFileAttributesW` on `path:streamName:$DATA` |
| Read/write/delete | Node `fs` on stream path or `DeleteFileW` |
| Path form | `buildStreamPath(base, name)` → `\\?\` prefix when long |

Pure helpers in `shared/ads/paths.ts` (unit-tested, no koffi).

### Text stream conventions (interoperability)

When reading/writing text streams matching legacy ADS.cs / BackupMirror:

- Read: UTF-8, trim trailing CR/LF/NUL, cut at first NUL.
- Write: `value + '\0\r\n'` payload for text streams (matches BackupMirror Save).

Binary streams: raw bytes over `readBytes`/`writeBytes` IPC for the stream preview UI.

### Host timestamp preservation

After stream-only writes, restore host **atime/mtime** so compare-by-time does not false-positive (folder statistics pattern).

## Compare

Per side, per host:

1. Size + mtime of `$DATA` from **FindFirstFile** (directory index — the file is not opened).
2. `listStreams(host)` → manifest (name + size) via MFT `FileStreamInfo`. Does not read `$DATA`. Named ADS are tiny (integers / short text) and are only opened if a cache/preview path reads that stream.
3. Classify:
   - **Equal** — `$DATA` equal per job rules AND manifests equal (sizes; optional per-stream hash).
   - **Update** — `$DATA` differs OR manifest differs.
   - **UpdateStreamsOnly** — `$DATA` equal but manifest differs (common ADS-only drift).

Fast compare (optional, BackupMirror):

- Read folder aggregate streams (`FileCount`, `FileSize`, …) from ADS.
- If left/right aggregates match, skip deep subtree walk (configurable).

Optional compare cache (job `ads.writeCacheToAds`):

- After hashing `$DATA`, write `MD5` stream as `v1|{hash}|{size}|{mtimeMs}` and restore host timestamps.
- Next compare: skip re-hash **only** if cached size and mtime still match `$DATA`. Hash-only (legacy) streams are ignored.

## Copy matrix

| Source → Dest | Primary `$DATA` | Alternate streams | Notes |
|---------------|-----------------|-------------------|-------|
| **NTFS → NTFS** | `CopyFileEx` / `CopyFileW` | Included in kernel copy OR explicit `copyStreams` fallback | **Default path — full fidelity** |
| **NTFS → FAT/exFAT** | Copy file body | **Dropped** (warn); sidecar policy is designed, not shipped | Job setting `ads.nonNtfsPolicy` |
| **NTFS → SMB UNC** | Same as NTFS if probe succeeds | Best-effort; preflight test write | EPERM → user message |
| **SFTP** | Upload `$DATA` only | **Not supported** | Document in job UI |

### NTFS → NTFS algorithm

```
1. Ensure parent directory exists on dest
2. Try CopyFileEx(src, dest, COPY_FILE_RESTARTABLE)
   - On success: verify manifest if job.verifyAfterCopy
3. On failure (locked file + VSS enabled):
   - Snapshot volume → copy from shadow path
4. Fallback:
   - copyFile $DATA
   - copyStreams(src, dest, ignoreFilters)
5. Preserve timestamps + ACLs (BackupMirror CloneFile parity)
6. Restore host times if only streams were patched
```

**Never** use Node `createReadStream`→`createWriteStream` as the sole NTFS→NTFS path for large files (drops ADS).

### Merge mode (Automatic / two-way stream union)

When both sides have streams the other lacks:

- Copy missing streams from source → dest after primary sync direction resolved.
- Union manifests; do not delete streams unless mirror delete policy applies to whole host.

## Stream filters (job `ads` section)

| Filter | Default |
|--------|---------|
| `syncAllStreams` | `true` |
| `excludeStreams` | `["Zone.Identifier"]` optional user list |
| `writeCacheToAds` | `false` (opt-in BackupMirror mode) |
| `cacheStreamNames.fileHash` | `"MD5"` |
| `cacheStreamNames.folderStats` | BackupMirror set |

**Compare and sync use the same ignore list.** Excluded streams (and compare-cache streams when `writeCacheToAds` is false) are not counted as adsDiff and are not copied or deleted. Otherwise a default `Zone.Identifier` exclude would leave every downloaded file “different” forever.

When `writeCacheToAds` is false, known cache stream names are ignored so leftover BackupMirror `MD5` / folder-stat streams do not fill the change list.

### NTFS → NTFS stream-only update (`UpdateStreamsOnly`)

1. Copy each non-ignored source stream onto dest.
2. **Mirror:** delete dest streams that are not on the source (ignored names are left alone).
3. Restore dest host atime/mtime so size+time compare does not false-positive.
4. Verify non-ignored manifests match.

## Directory hosts

Folders may carry ADS (folder statistics, etc.). Same manifest compare and `copyStreams` after directory create.

**Read-only dest:** `FILE_ATTRIBUTE_READONLY` on the destination is cleared for the write, then dest is set to match the source (D22). It does not abort the sync.

## Preflight probe

Before long sync to a pair, optional probe:

1. Write/delete test stream `:MyFileSyncProbe:$DATA` on dest root (or use empty temp file stream).
2. On EPERM / read-only → abort with actionable message before destructive mirror deletes.

## UI surfacing

- Compare grid: **ADS** column — badge `+2 / -1` stream diff count.
- Row expand: table of stream names with left/right sizes.
- Detail dialog: hex/text preview for selected stream (size cap 64 KiB for text preview).

## Testing corpus

Maintain fixture tree under `test/fixtures/ntfs/` (manual / CI Windows):

- File with `Zone.Identifier` + custom text stream
- Directory with `FileCount` stream
- Large file (&gt;8 MiB) with ADS — verify CopyFileEx path preserves streams

## Related docs

- [COMPARE_AND_SYNC.md](COMPARE_AND_SYNC.md) — action types including `UpdateStreamsOnly`
- [DECISIONS.md](DECISIONS.md) — D2, D3, D8, D9, D12
