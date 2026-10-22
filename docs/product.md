# Product

**MyFileSync** is a Windows desktop app for comparing and syncing folders, with **NTFS Alternate Data Streams (ADS)** treated as part of the file — not an optional extra.

Documented application version: **0.2.16** (from `package.json` at the time this knowledge base was generated). Behaviour below is the shipped app, not a plan.

## Who it is for

- People who mirror or update large trees (media, projects, archives) onto another disk or an NTFS-capable share.
- People whose files carry meaning in named streams (notes, generation parameters, folder stats, Mark of the Web, and similar), and who have lost that data with tools that copy only the primary `$DATA` stream.

## What it does

1. You keep **jobs**. A job has a name, a sync **variant**, and one or more **folder pairs** (source → target).
2. You click **Compare**. The app walks enabled pairs and builds a change list.
3. You review the list (filters, folder tree, include/exclude rows).
4. You click **Sync**. Included actions run. Sync is a separate click; Compare never writes the destination by itself.

## Variants

| UI label | Stored value | Effect |
| --- | --- | --- |
| Mirror | `mirror` | Make the target match the source, including deletes of target-only items |
| Update | `update` | Copy new and newer source items; do not delete extras on the target |
| Auto | `automatic` | Direction follows which side is newer / present |
| Two-way | `twoWay` | Both sides can contribute; a per-job SQLite database under AppData remembers prior state |

Exact classification lives in the compare engine. If a row’s action is not what you expected, filter the grid and read the row action rather than assuming a variant name implies every edge case.

## What it does not do

- It is not a supported macOS or Linux app.
- It does not sync Google Drive, OneDrive, Dropbox, or other cloud providers as built-in destinations.
- It does not email logs.
- It does not content-hash every file or verify-after-copy. Those options were removed so multi-terabyte trees stay practical. Compare is **size + date/time**, plus ADS manifests when the pair’s **ADS** checkbox is on.
- It does not implement Borg-style deduplicated archives.
- SFTP copies the **primary stream only**. Named NTFS streams are not stored on SFTP.
- Volume Shadow Copy (VSS) for locked files is not a finished copy path. The job schema still has a `vss.enabled` flag; do not treat that as a working locked-file feature.
- A custom sync-rules editor is not in the UI. The job JSON may contain `syncRules`; the visible filters are the Filters tab.

## Relationship to other tools

| Tool | Boundary |
| --- | --- |
| FreeFileSync | MyFileSync can import `.ffs_gui` / `.ffs_batch`. It is not FreeFileSync and does not claim full filter or VSS parity. |
| BackupMirror | **Import…** can load a `.ini`. Mapping is best-effort; review the job before Sync. Recycle Bin may be off after that import to match the old app. |
| Robocopy / Explorer copy | Those copy `$DATA` (and sometimes timestamps). They are not a substitute for ADS-aware sync. |
| 7-Zip | Used only inside the Windows **build** (electron-builder’s `7za.exe`). The running app does not require 7-Zip. |

Official FreeFileSync documentation: https://freefilesync.org/manual.php

## Design rules that affect daily use

- **Save** writes the job. Editing paths or options in the window is not durable until you save (the app also saves before Compare).
- While **Compare** or **Sync** is running, job switching, **+ New**, **Import…**, **Delete job**, pair edits, and job settings are locked.
- Starting **Compare** resets the result filter to **All**.
- The app reopens the **last job** you had selected (`lastJobId` in settings).
- Deletes default to the **Recycle Bin**. Mirror deletes ask for confirmation unless you turned that off in Settings.
- Sync runs cheaper work first: moves and renames, then timestamp touches and stream-only updates, then updates (smaller files first), then creates (shallower paths first, then smaller files), then deletes (deeper paths first). Large copies come later.
- If a pair’s source or target folder does not exist yet, Compare or Sync asks **Create missing folders?** before continuing. **Cancel** leaves the disks alone.
