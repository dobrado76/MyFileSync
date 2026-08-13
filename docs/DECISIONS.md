# Decisions

Locked product and technical decisions. Update this file when behavior changes.

| ID | Decision | Rationale |
|----|----------|-----------|
| **D1** | **Windows-only v1**; Electron + React + TypeScript | ADS/VSS/hard links are Win32-first; ship where differentiation matters |
| **D2** | **ADS stream-level sync is core**, not an optional plugin | Primary product differentiator vs FreeFileSync |
| **D3** | NTFS→NTFS copy uses **`CopyFileEx`/`CopyFileW`** first; fallback **`copyStreams`** after `$DATA` | Node stream copy drops ADS on large files |
| **D4** | **Sync DB in `userData`** (SQLite); **optional ADS compare cache on user files** per job (`MD5`, folder aggregates — BackupMirror mode) | DB for move detection; optional on-file cache for fast compare without re-hashing |
| **D5** | **Job format JSON** (`format: myfilesync-job`) with export/import | Replace BackupMirror INI; versioned schema |
| **D6** | **Recycle Bin default** for sync deletes; permanent delete requires confirm or Shift | Explorer-like safety |
| **D7** | **Standalone repo** — no imports from MyFileExplorer or BackupMirror code | Clean license and dependency boundary |
| **D8** | **Directory ADS** — folders are sync hosts same as files | BackupMirror + NTFS reality (folder stats, etc.) |
| **D9** | **Stream filters** per job: sync all (default), exclude list, optional exclude app-cache streams when not writing cache | User control; avoid surprise `Zone.Identifier` copies if desired |
| **D10** | **Compare review required by default**; optional “auto sync after compare” (BackupMirror `AutoBackup`) | Prevent destructive mirror mistakes |
| **D11** | **Plain-language errors** for read-only folders, permission denied, non-NTFS ADS target | EPERM alone is unusable for most users |
| **D12** | UNC/network paths: **best-effort ADS** with preflight probe; clear warning when SMB rejects streams | Avoid silent metadata loss |
| **D13** | SFTP/FTPS (Phase 3): **primary stream only**; document ADS drop | Protocol cannot carry NTFS ADS |
| **D14** | Renderer has **no Node integration**; typed preload IPC + Zod | Same security model as MyFileExplorer |
| **D15** | Every new job preference in **`jobSchema`** (Zod) so export/import round-trips automatically | Avoid parallel export allowlists |

## Deferred (not decided)

| Topic | Options | Target phase |
|-------|---------|--------------|
| VSS library | **Spike note (Phase 0):** koffi can load `vssapi.dll` / `vss_uuid.lib` bindings but snapshot lifecycle (IVssBackupComponents) is non-trivial; prefer koffi direct in main with a thin `win32/vss.ts` module rather than a third-party addon until Phase 1.5 | 1.5 |
| SQLite driver | better-sqlite3 vs sql.js — defer until Phase 2 sync DB; no native module in Phase 0 | 2 |
| Sidecar ADS on non-NTFS | See design note below | 3 |

### Sidecar ADS on non-NTFS (design note, Phase 3)

When the destination volume is not NTFS (FAT32, exFAT, SFTP, or SMB without stream support), NTFS alternate data streams cannot be stored natively. **Default policy:** copy the primary `$DATA` stream only and **drop** ADS with a per-run warning in the compare/sync log — no silent loss. **Optional future policy (not implemented in v1):** write sidecar files next to the host using the BackupMirror-style pattern `filename.ext:StreamName` (or a configurable suffix) so metadata can round-trip to NTFS later; sidecars would be excluded from normal file compare via job filters. SFTP and FTPS remain **primary-stream-only** permanently (D13). User-facing job setting `ads.nonNtfsPolicy`: `drop` (default) | `sidecar` when sidecar mode ships.

## Supersedes

- BackupMirror INI as primary config format (import only)
- BackupMirror product name “DoubleChecker” (historical reference only)
