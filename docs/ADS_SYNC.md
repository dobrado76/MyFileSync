# NTFS Alternate Data Stream sync

**Status:** Specification for Phase 1 engine. MyFileSync’s primary differentiator.

## Concepts

On NTFS, every file and directory has a primary data stream (`::$DATA`) plus zero or more **named alternate streams**. Explorer shows one file size ( `$DATA` only). Tools that copy `$DATA` via simple byte streams **silently drop** alternates.

Examples users care about:

| Stream | Typical content |
|--------|-----------------|
| `Zone.Identifier` | Mark-of-the-web |
| `parameters` | A1111 / Forge generation text (often in PNG tEXt on other platforms; ADS on some workflows) |
| `VER_1`…`VER_4` | Image edit history (MyFileExplorer pattern) |
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

Reimplement (do not import) patterns equivalent to Trinet.Core.IO.Ntfs / MyFileExplorer `adsWin32.ts`:

| Operation | Mechanism |
|-----------|-----------|
| List | `CreateFileW` + `FILE_FLAG_BACKUP_SEMANTICS` + `BackupRead` / `BackupSeek` |
| Exists | `GetFileAttributesW` on `path:streamName:$DATA` |
| Read/write/delete | Node `fs` on stream path or `DeleteFileW` |
| Path form | `buildStreamPath(base, name)` → `\\?\` prefix when long |

Pure helpers in `shared/ads/paths.ts` (unit-tested, no koffi).

### Text stream conventions (interoperability)

When reading/writing text streams matching legacy ADS.cs / BackupMirror:

- Read: UTF-8, trim trailing CR/LF/NUL, cut at first NUL.
- Write: `value + '\0\r\n'` payload for text streams (matches BackupMirror Save).

Binary streams: raw bytes over `readBytes`/`writeBytes` IPC for manager UI (Phase 1.5+).

### Host timestamp preservation

After stream-only writes, restore host **atime/mtime** so compare-by-time does not false-positive (folder statistics pattern).

## Compare

Per side, per host:

1. Stat `$DATA`: size, mtime, optional hash.
2. `listStreams(host)` → manifest (name + size).
3. Classify:
   - **Equal** — `$DATA` equal per job rules AND manifests equal (sizes; optional per-stream hash).
   - **Update** — `$DATA` differs OR manifest differs.
   - **UpdateStreamsOnly** — `$DATA` equal but manifest differs (common ADS-only drift).

Fast compare (optional, BackupMirror):

- Read folder aggregate streams (`FileCount`, `FileSize`, …) from ADS.
- If left/right aggregates match, skip deep subtree walk (configurable).

Optional compare cache (job `ads.writeCacheToAds`):

- After hashing `$DATA`, write `MD5` stream on source (BackupMirror behavior).
- Next compare: skip re-hash if size/time unchanged and cached MD5 present.

## Copy matrix

| Source → Dest | Primary `$DATA` | Alternate streams | Notes |
|---------------|-----------------|-------------------|-------|
| **NTFS → NTFS** | `CopyFileEx` / `CopyFileW` | Included in kernel copy OR explicit `copyStreams` fallback | **Default path — full fidelity** |
| **NTFS → FAT/exFAT** | Copy file body | **Dropped** (warn) or sidecar policy (Phase 3 doc) | Job setting `ads.nonNtfsPolicy` |
| **NTFS → SMB UNC** | Same as NTFS if probe succeeds | Best-effort; preflight test write | EPERM → user message |
| **SFTP (Phase 3)** | Upload `$DATA` only | **Not supported** | Document in job UI |

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

When `writeCacheToAds` is false, optionally **exclude** known cache stream names from sync (so app does not propagate compare metadata unless user wants it).

## Directory hosts

Folders may carry ADS (folder statistics, etc.). Same manifest compare and `copyStreams` after directory create.

**Read-only folder:** `FILE_ATTRIBUTE_READONLY` blocks stream writes on the directory object while children may still sync — detect and show plain error (see SECURITY.md / D11).

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
