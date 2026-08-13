# Decisions

Locked product and technical decisions. Update this file when behavior changes.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | **Windows-only**; Electron + React + TypeScript | ADS/VSS/hard links are Win32-first |
| **D2** | **ADS stream-level sync is core**, not an optional plugin | Differentiator vs FreeFileSync |
| **D3** | NTFS→NTFS copy uses **`CopyFileEx`/`CopyFileW`** first; fallback **`copyStreams`** after `$DATA` | Node stream copy drops ADS on large files |
| **D4** | **Sync DB in `userData`** (SQLite); **optional ADS compare cache on user files** per job (`MD5`, folder aggregates) | DB for two-way / moves; optional on-file cache for fast compare |
| **D5** | **Job format JSON** (`format: myfilesync-job`) with export/import | Replace BackupMirror INI; versioned schema |
| **D6** | **Recycle Bin default** for sync deletes; permanent delete requires confirm | Explorer-like safety |
| **D7** | **Standalone codebase** — no imports from other products | Clean license and dependency boundary |
| **D8** | **Directory ADS** — folders are sync hosts same as files | NTFS folders carry streams |
| **D9** | **Stream filters** per job: sync all (default), exclude list, optional exclude app-cache streams. **Compare ignores the same list as copy.** | Avoid surprise `Zone.Identifier` copies — and avoid a change list that can never go to zero |
| **D10** | **Compare review required**; Sync is always a separate click | Prevent destructive mirror mistakes |
| **D11** | **Plain-language errors** for read-only folders, permission denied, non-NTFS ADS target | Raw EPERM is unusable |
| **D12** | UNC/network paths: **best-effort ADS** with preflight probe; warning when SMB rejects streams | Avoid silent metadata loss |
| **D13** | SFTP/FTPS: **primary stream only**; document ADS drop | Protocol cannot carry NTFS ADS |
| **D14** | Renderer has **no Node integration**; typed preload IPC + Zod | Isolated UI process |
| **D15** | Every new job preference in **`jobSchema`** (Zod) so export/import round-trips | Avoid parallel export allowlists |
| **D16** | Compare is BackupMirror **`GetFiles`**: paired walk, `$DATA` then ADS, **collapsed missing trees**, JSONL change list | 75M-file trees cannot live as in-memory row objects |
| **D18** | Compare **results tree** is built from the change list (not a browse of disk). Clicking a folder filters the grid by path prefix. After Compare, **only the root is expanded** | A fully expanded result tree is unusable on large jobs |
| **D19** | **Cancel stops the next item**, not the current kernel call only after a batch. Yield between items so Cancel IPC runs; aborted copies are **not** failures; skip the JSONL rewrite on cancel | “Cancelling…” for seconds and hundreds of post-cancel failures is wrong |
| **D20** | After copy, **SetFileTime from source** (attributes-only). **Folder mtime is not a diff.** Folder Create copies the tree; folder ADS update does not recopy children. CopyFileEx uses long paths, not `COPY_FILE_RESTARTABLE` | Otherwise every synced file still looks like Update, and one folder Update recopies the whole tree |
| **D21** | Compare bar has **no BackupMirror option checkboxes**. Move/rename detect is always on. VSS is unimplemented — not in Settings. Auto-backup, minimize refresh, fast compare, and archive-flag scan are not exposed | Those toggles were legacy chrome; they confused the main path |

## Open follow-ups

| Topic | Notes |
|-------|--------|
| VSS | koffi can load `vssapi.dll`; full snapshot lifecycle is still a stub. Prefer a thin `win32/vss.ts` over a third-party addon. |
| SQLite driver | sql.js today; better-sqlite3 later if a native module is worth it |
| Sidecar ADS on non-NTFS | See below |

### Sidecar ADS on non-NTFS

When the destination volume is not NTFS (FAT32, exFAT, SFTP, or SMB without stream support), NTFS alternate data streams cannot be stored natively. **Default:** copy the primary `$DATA` stream only and **drop** ADS with a per-run warning — no silent loss.

**Optional later:** write sidecar files next to the host (`filename.ext:StreamName` or a configurable suffix) so metadata can round-trip to NTFS. Sidecars would be excluded from normal file compare via job filters. SFTP and FTPS stay **primary-stream-only** (D13). Job setting `ads.nonNtfsPolicy`: `drop` (default) | `sidecar` when sidecar mode ships.

## Supersedes

- BackupMirror INI as primary config format (import only)
- BackupMirror product name “DoubleChecker” (historical reference only)
