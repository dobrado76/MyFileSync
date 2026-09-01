# Decisions

Locked product and technical decisions. Update this file when behavior changes.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | **Windows-only**; Electron + React + TypeScript | ADS/VSS/hard links are Win32-first |
| **D2** | **ADS stream-level sync is core**, not an optional plugin | Differentiator vs FreeFileSync |
| **D3** | NTFS→NTFS copy uses **`CopyFileEx`/`CopyFileW`** first; fallback **`copyStreams`** after `$DATA` | Node stream copy drops ADS on large files |
| **D4** | **Sync DB in `userData`** (SQLite) | Two-way sync and move detection |
| **D5** | **Job format JSON** (`format: myfilesync-job`) with export/import | Replace BackupMirror INI; versioned schema |
| **D6** | **Recycle Bin default** for sync deletes; confirm when delete count &gt; 0, with **Don’t show again** (`settings.confirmMirrorDeletes`, default on). Permanent delete still requires confirm | Explorer-like safety; the extra prompt is skippable after you have seen it |
| **D7** | **Standalone codebase** — no imports from other products | Clean license and dependency boundary |
| **D8** | **Directory ADS** — folders are sync hosts same as files | NTFS folders carry streams |
| **D9** | **Stream filters** per job: sync all (default), exclude list, optional exclude app-cache streams. **Compare ignores the same list as copy.** | Avoid surprise `Zone.Identifier` copies — and avoid a change list that can never go to zero |
| **D10** | **Compare review required**; Sync is always a separate click | Prevent destructive mirror mistakes |
| **D11** | **Plain-language errors** for permission denied and non-NTFS ADS target | Raw EPERM is unusable. Dest read-only is not an error (D22). |
| **D12** | UNC/network paths: **best-effort ADS** with preflight probe; warning when SMB rejects streams | Avoid silent metadata loss |
| **D13** | SFTP/FTPS: **primary stream only**; document ADS drop | Protocol cannot carry NTFS ADS |
| **D14** | Renderer has **no Node integration**; typed preload IPC + Zod | Isolated UI process |
| **D15** | Every new job preference in **`jobSchema`** (Zod) so export/import round-trips | Avoid parallel export allowlists |
| **D16** | Compare is a paired walk, `$DATA` then ADS, **one row per file and folder** (FreeFileSync). A folder missing on the other side still lists every nested item. JSONL change list; the UI holds only a **virtualized window** of rows; the folder tree is built from that list | Tree count and Sync progress must match the real work. Collapsing a missing folder to “1” hid hours of copy behind one item |
| **D18** | Compare **results tree** is built from the change list (not a browse of disk). Clicking a folder filters the grid by path prefix. After Compare, **only the root is expanded**. Exclude, Sync a folder, and filter refreshes **keep the current expansion**. Folders and pair roots with **no remaining diffs are omitted** | A fully expanded result tree is unusable on large jobs; collapsing after every tree update is worse — you lose your place |
| **D19** | **Cancel stops the next item**, not the current kernel call only after a batch. Yield between items so Cancel IPC runs; aborted copies are **not** failures. **When Sync ends (finish or cancel), drop succeeded items** from the change list so the next Sync is a resume. **Compare cancel keeps diffs already found** | An empty tree after Compare cancel is wrong; leaving finished Sync items in the list makes resume fail (create exists, rename source gone) |
| **D20** | After copy, **SetFileTime from source** (attributes-only). **Folder mtime is not a diff.** Folder Create is **mkdir only**; children are their own Create rows. Folder ADS update does not recopy children. CopyFileEx uses long paths, not `COPY_FILE_RESTARTABLE` | Otherwise every synced file still looks like Update, and one folder Update recopies the whole tree |
| **D21** | Compare bar has **no BackupMirror option checkboxes**. Move/rename detect is always on. VSS is unimplemented — not in Settings. Auto-backup, minimize refresh, fast compare, and archive-flag scan are not exposed | Those toggles were legacy chrome; they confused the main path |
| **D22** | Sync **never fails** because dest is `FILE_ATTRIBUTE_READONLY`. Clear dest RO, write or delete, then set dest RO to match the source | A sync must make dest match source, including the read-only bit. The flag is not a permission ACL. |
| **D23** | Folder pairs live in **one job**. Each pair has `enabled`; Compare and Sync run **only ticked pairs** | Users keep all pairs together but do not have to run every pair every time |
| **D24** | Pair-list splitter height is **per-job** (`ui.pairListHeight`) and written on drag end | Layout is part of how you work that job; resetting it on every tab switch is noise |
| **D25** | **Hardware acceleration** is an app setting (`settings.hardwareAcceleration`, default on). Disable runs `app.disableHardwareAcceleration()` **before** `ready`. A change takes effect on the **next launch** | Chromium cannot flip GPU compositing after the process is up; some GPUs need a software fallback |
| **D26** | Each folder pair has **`pairs[].ads`** (default on). Off skips ADS listing on Compare and extra stream copy on Sync for that pair | Many pairs are `$DATA` only; listing streams on every file is the slow part |
| **D27** | Compare may skip unchanged folders using the **NTFS USN change journal** (`compare.useUsnJournal`, default on). Cursor is stored in AppData under `compare-usn/pairs/` keyed by **compare settings + left/right paths** (SHA-256 filename) so the same folders in another job reuse it. Legacy per-job `compare-usn/{jobId}.json` is still read for migration. Cursor is **not** written to pair-folder ADS (that would add journal noise). After a completed Compare or Sync the saved cursor is the **live** next USN | Full tree walks dominate Compare time on cold archives. USN is a fast path, not the source of truth |
| **D28** | Compare and Sync show a **progress panel** (counts, rates, graphs). A minimize control collapses it to the status-bar string; a **Progress** button expands it again. Last choice is `settings.progressUiExpanded` (default on) | A one-line status is not enough for a multi-hour run; forcing the full panel every time is also wrong |
| **D29** | Compare (and Sync) **do not start** if an enabled local pair root is missing or its drive is offline. One error, no walk | A disconnected target must not become tens of thousands of Create rows |
| **D30** | Compare is **two-phase**: enumerate both sides (same filters, skips, USN) for an exact item count, then classify. Directory listings are reused so the extra pass is not a second disk walk (unless the tree is huge and the listing cache is dropped). Progress `total` is that count | A live percent and remaining count need a known total; guessing while walking is misleading |
| **D31** | **`behavior.touchTimeWhenSizeMatches`** (default off): when `$DATA` size and compared ADS already match but last-write time differs, Compare action is **TouchTime** and Sync runs **SetFileTime** from the source — no byte copy. Size/time compare rules are unchanged; this only affects what Sync does for that row | After a manual Explorer copy, bytes and streams may match while mod times do not; re-copying everything is wasteful |
| **D32** | **Licence: GPL-3.0-only.** Trademark policy for the MyFileSync name/logo: [TRADEMARK.md](../TRADEMARK.md). Overview: [LICENSING.md](../LICENSING.md). | Strong copyleft against proprietary closed forks; brand separate from code |

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
