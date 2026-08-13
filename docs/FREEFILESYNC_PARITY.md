# FreeFileSync comparison

Reference: [FreeFileSync](https://freefilesync.org/) 14.x. MyFileSync matches core sync and **exceeds** FFS on NTFS ADS.

Legend: **Yes** / **Partial** / **No** / **Better** (MyFileSync does more)

## Core sync

| Feature | FFS | MyFileSync |
|---------|-----|------------|
| Mirror variant | Yes | Yes |
| Update variant | Yes (change-based DB) | Yes (difference compare; change-based via sync DB on two-way) |
| Two-way variant | Yes | Yes |
| Custom rules | Yes | Partial (schema; no editor yet) |
| Sync database | Yes | Yes (`userData/sync-jobs/*.db`) |
| Side-by-side compare view | Yes | Yes |
| Color-coded diff rows | Yes | Yes |
| Per-row include/exclude | Limited | Yes |
| Move/rename detection | Yes (DB + file IDs) | Yes (hash / ADS / DB) |
| Parallel copy per device | Yes | Yes |
| Parallel folder traversal | Yes | Yes |
| Compare: size + time | Yes | Yes |
| Compare: content hash | Yes | Yes (MD5 / SHA-256) |
| Filters include/exclude | Wildcards | Yes (gitignore-style) |
| Filters size/date/attrs | Yes | Partial (archive-flag scan; no size/date rules UI) |
| Versioning folder | Yes | Yes |
| Recycle Bin for deletes | Optional | Yes (default on) |
| Verify after copy | Yes | Yes |
| VSS / copy locked files | Batch | Partial (stub / hint) |
| Batch jobs | Yes | Yes |
| CLI unattended run | Yes | Yes |
| RealTimeSync companion | Yes | Yes (watch folders) |
| Email run logs | Donation Edition | No |
| SFTP / FTP / FTPS | Yes | Partial (SFTP, primary stream only) |
| Google Drive | Yes | No |
| Cross-platform (Linux/macOS) | Yes | No (Windows-only, D1) |

## ADS (MyFileSync advantage)

| Feature | FFS | MyFileSync |
|---------|-----|------------|
| Sync alternate data streams | **No** | **Better** — core |
| Compare stream manifests | No | **Better** |
| UpdateStreamsOnly action | No | **Better** |
| Directory ADS | No | **Better** |
| Optional MD5 cache in ADS | No | **Better** |
| Fast folder compare via ADS stats | No | **Better** |

## BackupMirror features not in FFS

| Feature | MyFileSync |
|---------|------------|
| Automatic (timestamp two-way) variant | Yes |
| Hard links across multiple backup roots | Yes |
| Archive-flag-only scan | Yes |

## UX

| Feature | FFS | MyFileSync |
|---------|-----|------------|
| Filter buttons (left only, right only, ADS ≠, …) | Yes | Yes |
| Statistics after compare | Yes | Yes |
| Progress during compare and sync | Yes | Yes |
| Error list / log | Yes | Yes |
| Multiple folder pairs per job | Yes | Yes |
| Import `.ffs_gui` / `.ffs_batch` | Yes | Yes |
| Dark theme | No official | Yes |

**Never** sacrifice ADS fidelity for FFS parity on NTFS local paths.
