# User guide

Labels below match the window. If a control is disabled, hover it: the tooltip explains the lock (usually Compare or Sync in progress).

## Header

| Control | What it does |
| --- | --- |
| **Job** dropdown | Switch saved jobs. Disabled during Compare/Sync. Restores the last job on next launch. |
| **+ New** | Creates an empty job and selects it. Disabled during Compare/Sync. |
| **Settings** | App settings (not the job’s Options). |

## Toolbar

| Control | What it does |
| --- | --- |
| **Name** | Job display name. **Save** to keep it. |
| **Import…** | FreeFileSync `.ffs_gui` / `.ffs_batch`, BackupMirror `.ini`, or MyFileSync job `.json`. Disabled during Compare/Sync. Review the job before Sync; import warnings are written to the **Log**. |
| **Export…** | Writes this job as a FreeFileSync `.ffs_gui` or `.ffs_batch`. This is not a full copy of every MyFileSync option. Warnings, if any, go to the **Log**. Disabled while the job config is locked. |
| **Save** | Writes the job to `%APPDATA%\myfilesync\jobs`. |
| **Delete job** | Removes the job from the list after you confirm. Does not delete your source or target folders. |
| **Clear** | Clears the compare result list in the window. Does not change disks. |

Tabs: **Options**, **Compare**, **Filters**, **Log**.

## Options — folder pairs

Each row is one pair.

| Control | Meaning |
| --- | --- |
| Pair checkbox | Include this pair in Compare and Sync |
| Left path | Source folder |
| **⇄** | Swap source and target |
| Right path | Target folder |
| **ADS** | Compare and copy alternate streams for this pair. Off skips stream work (faster, `$DATA` only). |
| **↑ / ↓** | Reorder pairs |
| **×** | Remove the pair (you cannot remove the last pair) |
| **+ Add folder pair** | Another source/target |
| Variant dropdown | **Mirror**, **Update**, **Auto**, **Two-way** |

**…** opens a folder picker.

While Compare or Sync runs, these controls are disabled so the running operation keeps the job you started with.

The folder list height can be dragged. That height is stored on the job (`ui.pairListHeight`) when you save.

## Options — job settings (searchable list)

A search box filters these rows. Changes are part of the job; click **Save** (Compare also saves first).

| Setting | Default | Effect |
| --- | --- | --- |
| **Use NTFS change journal (skip unchanged folders)** | On | After a finished Compare, the next Compare can skip folders the USN journal says did not change. Full walk if the journal wrapped, was recreated, is missing, or the path is not local NTFS. |
| **Touch timestamps only when file size already matches** | Off | If size and streams match but date/time differs, Sync updates timestamps instead of copying bytes. |
| **Sync all alternate data streams** | On | When off, stream sync is suppressed even if the pair **ADS** box is on. |
| **Recycle Bin for deletes** | On | Deletes go to the Recycle Bin when Windows allows it. |
| **Watch folders and auto-sync (RealTimeSync)** | Off | When on, folder changes can trigger an unattended compare+sync for that job. Debounce default is 2000 ms (in the job file, not a separate visible number field). |
| **Compare workers** | 4 | Integer 1–32. |
| **Copy parallelism** | 6 | Parallel copies per device, 1–32. Moves and deletes stay ordered relative to the sync plan. |

Hint under ADS: each pair’s **ADS** checkbox is the per-pair switch. The “sync all streams” checkbox is the job-wide policy.

## Compare results

**Compare** scans enabled pairs. A progress panel shows the current path, item counts, and (for Sync) byte rate and an estimate. **Minimize** (chevron on that panel) collapses it to the status bar; the last choice is remembered. The window title names the pair and whether this pass used the **change journal** or a **full walk**, including a short reason when the journal was not used.

If a source or target folder is missing, **Create missing folders?** lists each path as **Source** or **Target**. **Create and continue** creates those directories and carries on. **Cancel** stops that Compare or Sync.

The status bar then shows a summary such as compared items and how many are to sync.

**Sync**

- During Compare you may click **Sync** to queue it. The button label becomes **Queued**. Click again to cancel the queue.
- When Compare finishes, a queued sync starts. That path does not stop for **Confirm mirror deletes**.
- A normal **Sync** (Compare idle) with deletes and **Confirm before deleting on the destination** on shows **Confirm mirror deletes**, the count, **Sync anyway**, **Cancel**, and **Don't show again**. **Sync this folder now** uses the same dialog when that folder has deletes.
- If Compare is idle and there is nothing to sync, **Sync** is disabled.
- **Cancel** is enabled only while Compare or Sync is running. Cancel stops further work; items already finished stay finished. The next Sync continues from what is still in the change list.

### Show filters

| Button | Shows |
| --- | --- |
| **All** | Every compared item, including matches |
| **Differences** | Anything that would create, update, delete, or move |
| **← Source only** | On the source, not on the target |
| **Target only →** | On the target, not on the source |
| **Deleted** | Target items that Sync would delete. Untick a row to keep it. |
| **Moved** | Renames/moves detected so Sync can rename on the target instead of copy+delete |
| **ADS ≠** | Primary file matches but stream manifests differ |
| **Errors** | Rows that failed on the last sync. Disabled when there are no failures. |

A new **Compare** always returns the filter to **All**. Switching jobs also resets the filter to **All** and clears the failure list.

### Folder tree

- One pair: a single tree (root label is the source folder name, or **All folders**).
- Several pairs: **All folders**, then one branch per source pair (the folder’s last path segment). Hover a pair node for the full source path.
- Click a folder to filter the grid. The chip shows the folder; **×** clears it.
- Right-click: **Exclude this folder permanently**, **Exclude folders named “…” permanently**, exclude from this compare only, **Sync this folder now** / **Sync now**.

Permanent exclude adds a filter rule and saves the job. “From this compare” only drops rows from the current result.

### Grid

Rows are virtualized. Checkbox includes or excludes that row from Sync. Excluded rows are not executed.

Select a row for the detail panel: relative path, action, category, and a stream table (**Stream**, **Left**, **Right**). You can preview a stream’s text; long text is marked truncated. **Close** hides the panel. There is no control here to override the action type.

The row context menu has **Open source**, **Reveal source**, **Open target**, and **Reveal target**. A side that does not exist is disabled, with a tooltip that the item is not on that side. **Open** launches the file; **Reveal** shows it in Explorer.

Row colors distinguish equal, copy direction, move, ADS difference, excluded, and sync error. Trust the **action** text on the row if color alone is unclear.

## Filters tab

Two lists:

- **Exclude from compare and sync**
- **Include only (optional)** — empty means “everything except excludes”. If you add include rules, only matches are scanned.

Rule style (gitignore-like, relative to each pair root):

- `*.tmp`, `thumbs.db` — name pattern, any depth
- `!Thumbnails` — folder name
- `/!Thumbnails` or `models/!Thumbnails` — one path instance
- **This folder…** / **This file…** picks a path under a pair root and stores a relative rule

Default excludes on a new job include `thumbs.db`, `desktop.ini`, `*.tmp`, `$RECYCLE.BIN`, `RECYCLER`.

**Add pattern** or Enter adds the draft. **Remove** deletes one rule.

## Log tab

Timestamped lines for compare/sync results and failures. This is not a file log you can mail; it is the in-app list for this session.

## Sync failures

If some items fail, a dialog lists them with a plain-language message and hint.

| Button | Effect |
| --- | --- |
| **Show in Explorer** | Opens the target path. Does not retry. |
| **Clear read-only** | Clears the read-only attribute on the target, then retries that row. The row and a banner show **Clearing read-only…** then **Retrying sync…**. |
| **Retry failed** | Retries every failed row. |
| **Show in grid** | Closes toward the grid with the **Errors** filter. |
| **Close** | Dismisses the dialog. Failures remain until a later full sync or a successful retry. |

Other fix actions that change the file should be followed by a retry of that item; **Show in Explorer** does not sync.

## Settings (app)

| Setting | Default | Notes |
| --- | --- | --- |
| **Updates folder** | empty | Scan only when you click **Check for updates** |
| **Use hardware acceleration (GPU)** | On | Restart the app after changing. Turn off if the window is blank or flickers. |
| **Confirm before deleting on the destination** | On | Mirror-delete warning. Untick if you chose not to show it again. |
| **Export settings…** / **Import settings…** | | `myfilesync-settings` JSON. Does **not** include window geometry or your jobs. |

Progress panel width and whether the progress UI is expanded are remembered (`progressPanelWidth` default 300, `progressUiExpanded` default true).

## CLI (installed or unpacked exe)

No extra console app is shipped as a separate product name. The same executable accepts:

```text
MyFileSync --run job.json [--compare-only]
MyFileSync --batch batch.json [--compare-only]
```

- `--run` — path to a job JSON file (`format` must be `myfilesync-job`).
- `--compare-only` — compare and print counts; do not sync.
- `--batch` — a batch file (`format`: `myfilesync-batch`, `version`: 1, `jobs`: array of job UUIDs or JSON paths, optional `continueOnError`). A bare JSON array of refs is also accepted.

Exit code 0 means success. Exit code 1 means usage error, compare/sync failure, or a failed batch item.

Headless sync does not show the mirror-delete dialog. Do not point `--run` at a Mirror job unless you intend deletes.

Watch/auto-sync uses the same headless compare+sync path when **Watch folders and auto-sync** is enabled on the job.
