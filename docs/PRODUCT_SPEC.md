# Product specification

**MyFileSync** — Windows folder sync/backup with NTFS Alternate Data Stream fidelity.

## Personas

| Persona | Need |
|---------|------|
| **Power backup user** | Mirror large media/dev trees to a second disk; exact NTFS metadata including ADS |
| **AI/media archivist** | PNG/JPEG with generation params in ADS; must not lose metadata on backup |

## User stories

### Configure a job

- Create a named job with one or more **folder pairs** (left → right paths).
- Choose variant: **Mirror**, **Update**, **Automatic**, or **Two-way**.
- Set compare method: size + time, or content hash (MD5 / SHA-256).
- Set ADS policy: sync all streams (default NTFS→NTFS); optional exclude list (e.g. `Zone.Identifier`).
- Optional: write compare cache to ADS (`MD5`, folder aggregates).
- Save job as JSON; export/import.

**Acceptance:** Job round-trips export/import without data loss.

### Compare folders

- Click **Compare** → paired walk of each enabled folder pair (BackupMirror `GetFiles`).
- Grid shows: relative path, left size/time, right size/time, action, ADS badge (stream count diff).
- Color rows: equal (green), copy left→right (blue), copy right→left (teal), delete (red), conflict (yellow).
- Filter toolbar: all, differences, source only, target only, deleted, ADS ≠.
- Expand row → stream manifest table (name, left size, right size).

**Acceptance:** Folder with only ADS difference (same `$DATA`) shows **Update streams only**, not “equal”.

### Review and toggle actions

- Per-row include/exclude.
- Detail panel: attributes, stream list.

**Acceptance:** Excluded rows are not executed on sync.

### Synchronize

- Click **Sync** → execute included actions with progress, cancel.
- NTFS→NTFS: configured ADS streams copied with primary `$DATA`.
- Deletes default to **Recycle Bin**; confirm when mirror delete count &gt; 0 (Don’t show again is in Settings).
- Log panel captures errors in plain language (read-only folder, permission denied).

**Acceptance:** After mirror sync, destination stream list matches source (minus excluded streams).

## Features

| Feature | Status |
|---------|--------|
| Mirror, Update, Automatic, Two-way | Shipped |
| NTFS ADS compare and sync | Shipped |
| Side-by-side compare grid | Shipped |
| Gitignore-style filters | Shipped |
| Recycle Bin deletes | Shipped |
| Job JSON export/import | Shipped |
| ADS hash cache + fast folder compare | Shipped |
| Move/rename detection | Shipped |
| Verify after copy | Shipped |
| Archive-flag-only scan | Shipped |
| Batch / CLI | Shipped |
| Folder watch (RealTimeSync) | Shipped |
| UNC ADS preflight | Shipped |
| SFTP (primary stream only) | Partial |
| VSS locked-file copy | Stub / hint |
| Custom sync-rules editor | Schema only |
| Size / date filter rules | Not shipped |
| Email notifications | Out of scope |
| Cloud providers | Out of scope |
| macOS / Linux | Out of scope |

## UI surfaces

| Surface | Purpose |
|---------|---------|
| **Jobs** | List/create/edit jobs and folder pairs |
| **Compare** | Folder tree + two-pane change list |
| **Filters** | Exclude / include rules |
| **Log** | Run messages |
| **Settings** | Updates folder, export/import |

Details: [UI_DESIGN.md](UI_DESIGN.md).

## Out of scope

- Built-in cloud providers
- macOS / Linux builds
- Email notifications
- Deduplication / Borg-style archives

## Success metrics

- NTFS test corpus: stream name/size match after mirror sync
- Compare large trees on SSD with BackupMirror-style paired walk (ADS listing when `$DATA` size and time already match)
