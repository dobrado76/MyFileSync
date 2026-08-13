# Product specification

**MyFileSync** — Windows folder sync/backup with NTFS Alternate Data Stream fidelity.

## Personas

| Persona | Need |
|---------|------|
| **Power backup user** | Mirror large media/dev trees to second disk; wants exact NTFS metadata including ADS |
| **AI/media archivist** | PNG/JPEG with generation params in ADS or side streams; must not lose metadata on backup |
| **Legacy BackupMirror user** | Same mirror/update/auto workflows, modern UI, import old INI |

## Core user stories (v1 MVP)

### US-1 Configure a job

- Create a named job with one or more **folder pairs** (left → right paths).
- Choose variant: **Mirror**, **Update**, **Automatic** (BackupMirror Auto).
- Set compare method: size + time; optional content hash (MD5).
- Set ADS policy: sync all streams (default NTFS→NTFS); exclude list (e.g. `Zone.Identifier`).
- Optional: write compare cache to ADS (`MD5`, folder aggregates) — BackupMirror mode.
- Save job as JSON; export/import.

**Acceptance:** Job round-trips export/import without data loss.

### US-2 Compare folders

- Click **Compare** → parallel walk of enabled pairs.
- Grid shows: relative path, left size/time, right size/time, action, ADS badge (stream count diff).
- Color rows: equal (green), copy left→right (blue), copy right→left (teal), delete (red), conflict (yellow).
- Filter toolbar: show only differences, left-only, right-only, ADS-differ, errors.
- Expand row → stream manifest table (name, left size, right size).

**Acceptance:** Folder with only ADS difference (same `$DATA`) shows **Update** or **UpdateStreamsOnly**, not “equal”.

### US-3 Review and toggle actions

- Global checkboxes: enable/disable action types (create, update, delete, move).
- Per-row include/exclude (BackupMirror parity).
- Double-click row → detail dialog: attributes, stream list, single-run execute.

**Acceptance:** Excluded rows are not executed on sync.

### US-4 Synchronize

- Click **Sync** → execute planned actions with progress bar, file count, ETA, cancel.
- NTFS→NTFS: all configured ADS streams copied with primary `$DATA`.
- Deletes default to **Recycle Bin**; Shift or setting for permanent with confirm.
- Log panel captures errors with plain-language messages (read-only folder, permission denied).

**Acceptance:** After mirror sync, `BackupRead` stream list on destination matches source (minus excluded streams).

### US-5 Import BackupMirror INI

- File → Import → select `optionsBackup.ini`.
- Map directory lines and global flags to job JSON (see [BACKUPMIRROR_MIGRATION.md](BACKUPMIRROR_MIGRATION.md)).

**Acceptance:** Sample INI from BackupMirror `bin` imports with correct pairs and Mirror/Update/Auto variant.

## Feature matrix by phase

| Feature | Phase |
|---------|-------|
| Mirror, Update, Automatic | 1 |
| NTFS ADS sync | 1 |
| Side-by-side compare grid | 1 |
| Wildcard filters | 1 |
| Recycle Bin deletes | 1 |
| Job JSON + INI import | 1 |
| ADS MD5 cache + fast folder compare | 1.5 |
| Move/rename detection | 1.5 |
| VSS locked files | 1.5 |
| Hard links (multi-root) | 1.5 |
| Two-way + sync DB | 2 |
| Custom sync rules | 2 |
| Versioning folder | 2 |
| Batch / CLI | 2 |
| RealTimeSync companion | 2 |
| SFTP/FTPS | 3 |

## UI surfaces

| Surface | Purpose |
|---------|---------|
| **Jobs** | List/create/edit jobs and folder pairs |
| **Compare** | Diff grid and filters |
| **Run log** | History and export |
| **Settings** | Theme, defaults, parallelism, delete policy |

Details: [UI_DESIGN.md](UI_DESIGN.md).

## Out of scope (v1)

- Built-in cloud providers
- macOS/Linux builds
- Email notifications (FFS Donation Edition feature — consider Phase 2+)
- Deduplication / Borg-style archives

## Success metrics

- NTFS test corpus: 100% stream name/size match after mirror sync
- Compare 100k-file tree on SSD: completes with parallel walk (target &lt; FFS baseline + 20% ADS overhead)
- Zero dependency on MyFileExplorer codebase
