# Troubleshooting

Use the least destructive check first. Nothing below tells you to delete your source tree.

## Symptom index

| Symptom | Start here |
| --- | --- |
| Installer or `npm run dist` says `EBUSY` on `app.asar` | Build lock |
| Window blank or flickering | GPU |
| **Sync** grey, status says there is work | Filter or stats |
| Tree mixes several disks into one root | Expected only for a single pair; multi-pair should group |
| Compare looks instant but missed edits | USN journal |
| Streams missing on target | Filesystem or ADS checkbox |
| “5 failed” and no reason | Failures dialog and Log |
| Clear read-only seems to do nothing | Watch the failure row banner (older builds had no banner) |
| Job dropdown jumped to the first job | `lastJobId` |
| Mirror deleted files you wanted | Variant, recycle, confirm setting |
| CLI exits 1 immediately | Usage line |

## Build: `EBUSY` … `app.asar`

**Symptom:** `electron-builder` cannot unlink `release\win-unpacked\resources\app.asar`.

**Causes:** A previous build’s `7za.exe` (shown in Windows as “7-Zip Standalone Console” even when you did not install 7-Zip), `release\win-unpacked\MyFileSync.exe` still running, or Explorer / an archiver browsing that folder.

**Checks:**

1. Task Manager: end `7za.exe`, `7z.exe`, and any `MyFileSync.exe` whose path is under this repo’s `release\`.
2. Close Explorer windows on `release\`.
3. Run `npm run dist` again. `prepare-dist` kills stale 7za and processes whose **executable path** is under `release\`, then deletes `win-unpacked` or renames it to `win-unpacked.stale-<time>`.

**Does not kill:** the installed app in `%LocalAppData%\Programs\MyFileSync` or `%APPDATA%`. Quit that yourself if you still have a lock you created by running the unpacked exe.

**Expect:** a new `release\MyFileSync-Setup-<version>.exe`. Old setup exes are deleted only after a successful build.

## Blank or flickering window

**Cause:** GPU compositing.

**Fix:** If you can open **Settings**, turn off **Use hardware acceleration (GPU)** and restart. If the window never paints, edit `%APPDATA%\myfilesync\settings.json` and set `"hardwareAcceleration": false`, then start again. You only lose GPU compositing, not jobs.

## Sync disabled but the status line shows work

**Checks:**

1. Is the **Show** filter **Errors** or a folder chip from an old run? Click **All** and clear the folder chip.
2. Start **Compare** again. Compare forces **All**.
3. **Sync** enables when compare stats `toSync` > 0, or while Compare is running (queue). If `toSync` is 0, there is nothing included to do.

## Create missing folders?

**Symptom:** Compare or Sync stops and asks **Create missing folders?**

**Cause:** A pair path is not on disk yet (new backup folder, typo, or unplugged drive that looks missing).

**Checks:** Read each line. **Source** vs **Target** is which side. If the path is a typo or the wrong disk, **Cancel** and fix the pair. **Create and continue** only creates those listed directories; it does not invent files.

## Compare result does not match the disks

**Checks:**

1. Pair checkbox ticked? **ADS** ticked if you expected streams?
2. Filters tab excluding the path?
3. **Use NTFS change journal** on, and the journal skipped a folder? Turn the journal option off, **Save**, Compare once for a full walk, then turn it back on if you want it.
4. Wrong job loaded? Header **Job** name.
5. Source and target swapped? **⇄** is easy to misread after a swap. **Save** is required if you want the swap kept.

## Alternate streams did not copy

**Causes:** Pair **ADS** off; **Sync all alternate data streams** off; target not NTFS; path is SFTP; stream name is excluded (`Zone.Identifier`, `MD5`, or a custom exclude still in the JSON); copy failed (see failures).

**Check:** After sync, Compare with **ADS ≠**. If the body is equal and streams differ, the row should appear there when ADS compare is on.

MyFileSync cannot invent NTFS streams on exFAT, FAT32, or a typical SFTP server.

## Sync failures dialog

**Symptom:** Status says some items failed.

**Steps:**

1. Read each row’s message and hint. The Log tab has the same text.
2. **Show in Explorer** only reveals the target. It does not fix or retry.
3. For read-only (`not-allowed` with a target path), **Clear read-only**. You should see **Clearing read-only…** and **Retrying sync…**. On success the row disappears.
4. **Retry failed** for the rest.
5. **Show in grid** and the **Errors** filter to see them in context.

If retry fails again, the new message replaces that row. Do not keep clicking Sync on the whole job until you know the first failure (disk full, permission, path too long, file in use).

## Permission denied / file in use

The app reports a plain-language message. Close the program using the file. VSS locked-file copy is **not** a finished feature; a sharing violation will not be solved by toggling a hidden VSS flag.

## Imported BackupMirror job deletes for real

**Symptom:** After **Import…** of a `.ini`, **Recycle Bin for deletes** is off.

**Cause:** The importer matches BackupMirror, which deleted permanently, and logs: “BackupMirror used permanent deletes — imported job has useRecycleBin=false.”

**Fix:** Turn **Recycle Bin for deletes** on and **Save** before Sync, unless you want permanent deletes.

## Mirror deleted too much

**Cause:** Variant **Mirror** removes target-only files. Queue-during-compare and the CLI do not ask.

**Recovery:** If **Recycle Bin for deletes** was on and the volume supports it, restore from the Recycle Bin. If recycle was off, or the target was a share that deleted permanently, MyFileSync has no undo. Restore from your own backup.

**Prevention:** Use **Update** when you must not delete extras. Leave **Confirm before deleting on the destination** on. Do not queue Sync during Compare unless you accept deletes.

## App opened the wrong job

**Cause:** Older builds always opened the first dropdown entry. Current builds store `lastJobId`.

**Fix:** Select the job once, quit, reopen. If that job was deleted, the first remaining job is used.

## Cannot change job or folders during a run

By design. Wait or **Cancel**. Cancel does not roll back copies already finished.

## CLI

```text
Usage: MyFileSync --run job.json [--compare-only]
       MyFileSync --batch batch.json [--compare-only]
```

The JSON must parse as a current job (old hash/verify fields are stripped, then validated). Zod errors print to the console; fix the file. A missing folder path fails during compare with the message returned by the engine (paths not set, no enabled pair, or an IO error).

## Compare list huge or memory

Filter with excludes. The grid only keeps a window of rows. The on-disk change list refuses to exceed about 4 GB; if you hit that, split the job into smaller pairs or exclude more.

## Reporting a bug

Issues: https://github.com/dobrado76/MyFileSync/issues

Include: app version from the header, Windows version, variant, whether **ADS** was on, the **exact** failure message, and whether source and target are local NTFS, UNC, or SFTP. Do not paste SFTP passwords, private keys, or full copies of personal trees. A relative path plus the error line is enough.
