# FreeFileSync parity checklist

Reference: [FreeFileSync](https://freefilesync.org/) 14.x manual and release notes. MyFileSync aims to **match or exceed** FFS for core sync while **beating** it on NTFS ADS.

Legend: **Must** (Phase 1–2), **Should**, **Won’t**, **MyFileSync+** (we do better)

## Core sync

| Feature | FFS | MyFileSync | Phase |
|---------|-----|------------|-------|
| Mirror variant | Yes | **Must** | 1 |
| Update variant | Yes (change-based DB) | **Must** (diff-based v1; change-based v2) | 1 / 2 |
| Two-way variant | Yes | **Must** | 2 |
| Custom rules | Yes | **Should** | 2 |
| Sync database (`sync.ffs_db`) | Yes | **Must** (`userData/sync-jobs/*.db`) | 2 |
| Side-by-side compare view | Yes | **Must** | 1 |
| Color-coded diff rows | Yes | **Must** | 1 |
| Per-row action override | Limited | **Must** (BackupMirror include/exclude) | 1 |
| Move/rename detection | Yes (DB + file IDs) | **Must** (DB + hash/ADS fallback) | 1.5 / 2 |
| Parallel copy per device | Yes | **Must** | 1 |
| Parallel folder traversal | Yes | **Must** | 1 |
| Compare: size + time | Yes | **Must** | 1 |
| Compare: content hash | Yes | **Must** (MD5/SHA-256) | 1 |
| Filters include/exclude | Wildcards | **Must** | 1 |
| Filters size/date/attrs | Yes | **Should** | 2 |
| Versioning folder | Yes | **Should** | 2 |
| Recycle Bin for deletes | Optional | **Must** (default on) | 1 |
| Verify after copy | Yes | **Should** | 1.5 |
| VSS / copy locked files | Batch | **Should** | 1.5 |
| Batch jobs (`.ffs_batch`) | Yes | **Must** (`.mfs_batch` JSON) | 2 |
| CLI unattended run | Yes | **Must** | 2 |
| RealTimeSync companion | Yes | **Should** | 2 |
| Email run logs | Donation Edition | **Won’t** v1 | — |
| SFTP / FTP / FTPS | Yes | **Should** | 3 |
| Google Drive | Yes | **Won’t** v1 | — |
| Cross-platform (Linux/macOS) | Yes | **Won’t** v1 (D1) | — |

## ADS (MyFileSync+)

| Feature | FFS | MyFileSync |
|---------|-----|------------|
| Sync alternate data streams | **No** | **MyFileSync+** core |
| Compare stream manifests | No | **MyFileSync+** |
| UpdateStreamsOnly action | No | **MyFileSync+** |
| Directory ADS | No | **MyFileSync+** |
| Optional MD5 cache in ADS | No | **MyFileSync+** (BackupMirror) |
| Fast folder compare via ADS stats | No | **MyFileSync+** |

## BackupMirror features not in FFS

| Feature | MyFileSync |
|---------|------------|
| Automatic (timestamp two-way) variant | Phase 1 |
| Hard links across multiple backup roots | Phase 1.5 |
| Archive-flag-only scan | Phase 1.5 |
| INI import | Phase 1 |

## UX parity

| Feature | FFS | MyFileSync |
|---------|-----|------------|
| Filter buttons (left only, right only, …) | Yes | Phase 1 |
| Statistics after compare | Yes | Phase 1 |
| Progress during sync | Yes | Phase 1 |
| Error list / log | Yes | Phase 1 |
| Multiple folder pairs per config | Yes | Phase 1 |
| Dark theme | No official | Phase 1 |

## Priority guidance

**Phase 1 MVP** must satisfy: Mirror, Update, compare grid, ADS sync, filters, job save, Recycle Bin deletes.

**Phase 2** closes FFS gap: two-way, DB, batch/CLI, RealTimeSync, versioning.

**Never** sacrifice ADS fidelity for FFS parity on NTFS local paths.
