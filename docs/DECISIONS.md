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
| **D11** | **Plain-language errors** for permission denied and non-NTFS ADS target | Raw EPERM is unusable. Dest read-only is not an error (D22). |
| **D12** | UNC/network paths: **best-effort ADS** with preflight probe; warning when SMB rejects streams | Avoid silent metadata loss |
| **D13** | SFTP/FTPS: **primary stream only**; document ADS drop | Protocol cannot carry NTFS ADS |
| **D14** | Renderer has **no Node integration**; typed preload IPC + Zod | Isolated UI process |
| **D15** | Every new job preference in **`jobSchema`** (Zod) so export/import round-trips | Avoid parallel export allowlists |
| **D16** | Compare is BackupMirror **`GetFiles`**: paired walk, `$DATA` then ADS, **collapsed missing trees**, JSONL change list. The UI holds only a **virtualized window** of rows; the folder tree is built from a slim path index | 75M-file trees cannot live as in-memory row objects or DOM nodes |
| **D18** | Compare **results tree** is built from the change list (not a browse of disk). Clicking a folder filters the grid by path prefix. After Compare, **only the root is expanded**. Folders and pair roots with **no remaining diffs are omitted** | A fully expanded result tree is unusable on large jobs; empty pair nodes are noise (FreeFileSync) |
| **D19** | **Cancel stops the next item**, not the current kernel call only after a batch. Yield between items so Cancel IPC runs; aborted copies are **not** failures. **When Sync ends (finish or cancel), drop succeeded items** from the change list so the next Sync is a resume. **Compare cancel keeps diffs already found** | An empty tree after Compare cancel is wrong; leaving finished Sync items in the list makes resume fail (create exists, rename source gone) |
| **D20** | After copy, **SetFileTime from source** (attributes-only). **Folder mtime is not a diff.** Folder Create copies the tree; folder ADS update does not recopy children. CopyFileEx uses long paths, not `COPY_FILE_RESTARTABLE` | Otherwise every synced file still looks like Update, and one folder Update recopies the whole tree |
| **D21** | Compare bar has **no BackupMirror option checkboxes**. Move/rename detect is always on. VSS is unimplemented — not in Settings. Auto-backup, minimize refresh, fast compare, and archive-flag scan are not exposed | Those toggles were legacy chrome; they confused the main path |
| **D22** | Sync **never fails** because dest is `FILE_ATTRIBUTE_READONLY`. Clear dest RO, write or delete, then set dest RO to match the source | A sync must make dest match source, including the read-only bit. The flag is not a permission ACL. |
| **D23** | Folder pairs live in **one job**. Each pair has `enabled`; Compare and Sync run **only ticked pairs** | Users keep all pairs together but do not have to run every pair every time |
| **D24** | Pair-list splitter height is **per-job** (`ui.pairListHeight`) and written on drag end | Layout is part of how you work that job; resetting it on every tab switch is noise |
| **D25** | **Hardware acceleration** is an app setting (`settings.hardwareAcceleration`, default on). Disable runs `app.disableHardwareAcceleration()` **before** `ready`. A change takes effect on the **next launch** | Chromium cannot flip GPU compositing after the process is up; some GPUs need a software fallback |

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
