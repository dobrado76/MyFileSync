# FAQ

## Installation and updates

### 1. Where do I download MyFileSync?

https://github.com/dobrado76/MyFileSync/releases/latest — file name `MyFileSync-Setup-<version>.exe`. Windows 10/11 64-bit.

### 2. Does the installer need admin rights?

The NSIS installer can change the destination folder. Whether Windows asks for elevation depends on the folder you pick (Program Files versus a user folder). The app itself does not ship a separate “portable mode” switch.

### 3. How do I update?

Put a newer `MyFileSync-Setup-*.exe` in a folder, **Settings** → **Updates folder** → **Check for updates**, then install from the banner. The app does not contact GitHub by itself.

### 4. Will an update wipe my jobs?

Jobs and settings stay in `%APPDATA%\myfilesync`. Uninstalling might remove the program files only; do not delete that AppData folder if you want jobs kept. This document does not claim the uninstaller’s exact AppData behaviour beyond “data lives in userData, not in the install directory”.

### 5. The version in the title is shorter than the installer name. Which is real?

Both. `0.2.0` may display as **v0.2**. The installer uses the full `package.json` version (`MyFileSync-Setup-0.2.16.exe`).

## Jobs

### 6. How do I make a job?

**+ New**, fill source and target, choose a variant, **Save**.

### 7. Why can’t I switch jobs?

Compare or Sync is running, or a sync is queued in a way that still holds the busy flag. **Cancel** or wait. **+ New**, **Import…**, and **Delete job** use the same lock.

### 8. Does Delete job delete my files?

No. It removes the job definition from the app list. It does not delete the folders in the pair.

### 9. Where is the job file?

`%APPDATA%\myfilesync\jobs\`. **Import…** loads FreeFileSync, BackupMirror INI, or MyFileSync JSON. **Export…** writes a FreeFileSync `.ffs_gui` or `.ffs_batch` (not a perfect dump of every MyFileSync field). **Export settings…** is app settings only, including the last job id, not the job bodies.

### 10. Which job opens at startup?

The last one you selected (`lastJobId`). If it is gone, the first job in the list.

### 11. How do I add a second folder pair?

**Options** → **+ Add folder pair**. Each pair has its own checkbox and **ADS** box. Several pairs show as separate branches in the compare tree.

### 12. What is the difference between Mirror and Update?

**Mirror** makes the target match the source and can delete target-only items. **Update** copies new/changed source items and leaves extra target files in place.

### 13. What is Auto vs Two-way?

**Auto** picks a direction from which side is present or newer. **Two-way** uses a database under `%APPDATA%\myfilesync\sync-jobs` so both sides can change over time. If you do not need history, prefer Mirror or Update; two-way state is per job id.

### 14. I swapped source and target by mistake. Can I undo?

Click **⇄** again before Sync, then **Save**. Sync already performed cannot be undone by the app, except Recycle Bin restores when deletes used the recycle bin.

## Compare

### 15. Does Compare change any files?

No. Only Sync writes (and **Clear read-only**, which changes attributes, and permanent excludes, which change the job).

### 16. Why is the list empty when the status says thousands of items?

The **Show** filter or a folder chip is hiding rows. Click **All** and clear the chip. A new Compare also forces **All**.

### 17. What does ADS ≠ mean?

The main file size/time match, but alternate stream manifests do not. That is intentional. Those rows are not “equal”.

### 18. What does Moved mean?

Compare decided a delete plus a create was a rename or move. Sync renames on the target when the volumes allow, instead of copying the bytes again and deleting the old path.

### 19. How do I sync one folder only?

Right-click that folder in the tree → **Sync this folder now**. If that folder’s action list includes deletes and confirm is on, you still get the delete warning (unless you queued a full sync during Compare).

### 20. How do I ignore a folder forever?

Right-click → **Exclude this folder permanently** or **Exclude folders named “…”**. That edits Filters and saves. **Exclude this folder from this compare** only drops it from the current result.

### 21. Why is the second Compare much faster?

**Use NTFS change journal** is on and the volume still has a valid journal cursor. If you need to be sure, turn it off for one full Compare.

### 22. Can I compare without ADS to go faster?

Untick **ADS** on that pair. Stream differences will not be detected or copied for that pair.

### 23. What are Compare workers?

**Options** → **Compare workers** (1–32, default 4). It does not change what is equal; it is a parallelism knob.

## Sync

### 24. Why is Sync grey?

Nothing to sync (`toSync` is 0) and Compare is not running. Or Sync itself is already running. Run Compare first after you change folders.

### 25. Can I queue Sync overnight while Compare runs?

Yes. Click **Sync** during Compare. The button shows **Queued**. It starts when Compare finishes and **does not ask** about mirror deletes. Click **Queued** again to cancel the queue.

### 26. What order do files sync?

Moves and renames, then timestamp touches and stream-only updates, then content updates (small first), then creates (shallow folders first, then small files), then deletes (deep paths first). The counter should climb before the largest copies. Deletes run after copies so a mirror can replace a file before removing extras.

### 27. How do I cancel?

**Cancel**. Work already finished stays done. Run Sync again to continue the remainder.

### 28. An item failed. Where is the reason?

The failures dialog and the **Log** tab. Use **Show in grid** for the **Errors** filter.

### 29. Clear read-only — did it work?

The row should highlight and the button/banner should say **Clearing read-only…** then **Retrying sync…**. Success removes the row and the status bar says it was fixed and synced. If the attribute clear fails, the status bar shows the error and the row stays.

### 30. Will deletes go to the Recycle Bin?

Yes when **Recycle Bin for deletes** is on and Windows can recycle that path. Network locations often cannot. Turn the option off only if you accept permanent deletes.

### 31. How do I stop the delete warning?

**Settings** → untick **Confirm before deleting on the destination**, or use the dialog’s don’t-show-again control. Queued sync and the CLI never show it.

### 32. Can I exclude one file from this sync only?

Untick its row. That does not change Filters. **Clear** drops the whole result list from the window; it does not write disks.

### 33. What is copy parallelism?

**Copy parallelism** (default 6, max 32): how many copies run at once per device. It does not parallelize the delete phase ahead of copies.

## Filters and streams

### 34. How do I exclude all Thumbs.db?

Filters → exclude → pattern `thumbs.db` (already in the default list). **Add pattern**.

### 35. How do I exclude one folder but not others with the same name?

Use a path rule (`/OnlyThis` or `parent/OnlyThis`) or **This folder…**. A bare name excludes every instance.

### 36. What is the difference between include and exclude?

Exclude always removes matches. Include, if non-empty, means **only** those matches are scanned (still minus excludes).

### 37. Which streams are skipped by default?

`Zone.Identifier` and `MD5`. `MD5` is a legacy cache name and is forced back onto the exclude list when a job loads. Other stream names sync when **ADS** and **Sync all alternate data streams** are on and the target is NTFS.

### 38. I turned off “Sync all alternate data streams”. What happens?

Stream copy/compare policy follows that job flag. Pair **ADS** off skips stream work for that pair even if the job flag is on. If you need streams, both must allow them.

### 39. Does SFTP keep ADS?

No. Primary file bytes only. Do not use SFTP if named streams are the point of the backup.

## Time, journal, watch

### 40. Explorer copy left the same size but a new timestamp. Must I recopy?

Turn on **Touch timestamps only when file size already matches**, Save, Compare, Sync. If streams also differ, this will not skip the stream update.

### 41. Change journal skipped a file I know changed.

Turn **Use NTFS change journal** off, Save, Compare. Journals can wrap or reset; non-NTFS paths always full-walk.

### 42. How does watch / auto-sync work?

**Watch folders and auto-sync (RealTimeSync)** on the job, then **Save**. The app watches enabled pair roots. After the debounce (default 2 seconds, `watch.debounceMs`), it runs compare and sync with no window prompts, including no mirror-delete question. Lines from that run go to the process console, not the in-app **Log**. Leave it off unless you accept unattended writes. A second burst while a run is in progress is queued once, not stacked.

### 42a. Compare says my folder does not exist. Can it create it?

Yes. **Create missing folders?** lists each missing source or target. **Create and continue** creates them and proceeds. **Cancel** does not create them and does not sync.

## CLI

### 43. How do I run a job from a script?

`MyFileSync --run C:\path\job.json`

Compare only: add `--compare-only`.

Several jobs: `--batch batch.json`.

### 44. What is a batch file?

JSON with `format` `myfilesync-batch`, `version` 1, and `jobs` (UUIDs of saved jobs or paths to job JSON). `continueOnError` defaults to false, so the first failure stops the batch.

### 45. Why did the CLI delete files with no prompt?

`--run` / watch use the headless path. Mirror deletes are not confirmed there. Use Update, or accept Mirror.

## Limits and other tools

### 46. Does it hash file contents?

No. Equality is size, date/time, and (when enabled) stream name/size. There is no MD5/SHA compare mode and no verify-after-copy in current builds.

### 47. Can it sync to Google Drive?

Not as a provider. If Drive is a normal NTFS folder on disk, it is just a folder pair — and the cloud client may strip streams after MyFileSync writes them. That stripping is the other product, not MyFileSync.

### 48. Is macOS supported?

No.

### 49. FreeFileSync import — what comes across?

Pairs and filters that the importer maps. It is not a guarantee of every FreeFileSync filter or batch option. Check the job after import before Sync. FreeFileSync’s own manual: https://freefilesync.org/manual.php

### 50. Where do I report a bug?

https://github.com/dobrado76/MyFileSync/issues — version, Windows version, variant, ADS on or off, exact error text, NTFS vs UNC vs SFTP. Omit passwords and private keys.
