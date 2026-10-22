# Getting started

## Install the app (normal use)

1. Open https://github.com/dobrado76/MyFileSync/releases/latest
2. Download `MyFileSync-Setup-x.y.z.exe` (NSIS installer, Windows 10/11 x64).
3. Run the installer. You can change the install folder (it is not one-click-only).
4. Start **MyFileSync**.

The window title area shows **MyFileSync** and a short version (for example `v0.2` when the patch is zero, otherwise the full `x.y.z`).

There is no account and no license key. Settings and jobs are files under your Windows user profile.

## First job

1. Click **+ New** in the header (or use **Import…** for a FreeFileSync `.ffs_gui` / `.ffs_batch` or a MyFileSync `.json` job).
2. Set **Name**.
3. On the **Options** tab, set the source folder (left) and target folder (right). Use **…** to browse.
4. Leave the pair checkbox ticked so the pair is included.
5. Leave **ADS** ticked if both sides are NTFS and you care about alternate streams. Untick it for a faster `$DATA`-only pair.
6. Choose **Mirror**, **Update**, **Auto**, or **Two-way**.
7. Click **Save**.
8. Click **Compare**.
9. When the status bar shows a compared count, review the list, then click **Sync**.

Expected result: the status bar reports how many items were compared and how many are to sync. The folder tree and grid fill. **Sync** stays disabled when the compare stats say there is nothing to sync (`toSync` is 0) and Compare is not running.

## Where files live

Electron `userData` for this app is:

`%APPDATA%\myfilesync`

That folder is the same for `npm run dev` and the installed app.

| Path under userData | Contents |
| --- | --- |
| `settings.json` | Updates folder, last job, GPU, mirror-delete confirm, progress panel size |
| `jobs\` | Saved job JSON |
| `window-state.json` | Window position (not included in settings export) |
| `sync-jobs\` | SQLite state used by two-way |
| `compare\` | Temporary compare row store for the current run |
| `compare-usn\` | NTFS change-journal cursors |

Job JSON you export yourself can live anywhere. The in-app list is the copies under `jobs\`.

## Developers running from source

Prerequisites: **Node.js 20+** (CI uses 22), **Windows 10/11 x64**, git.

```powershell
npm install
npm run dev
```

`npm run dev` opens the same AppData store as the installed build. Do not point a test job at a folder you cannot afford to mirror.

Installer (bumps the patch number in `package.json`, then builds):

```powershell
npm run dist
```

Same installer **without** bumping the version:

```powershell
npm run dist:nobump
```

Output: `release\MyFileSync-Setup-<version>.exe` and `release\win-unpacked\`.

Before packaging, `scripts/prepare-dist.mjs` stops stale `7za.exe` / `7z.exe` left by a crashed electron-builder run and processes whose executable path is under this repo’s `release\`. It does **not** stop an installed MyFileSync under `AppData`. Close the installed app yourself if a file in `release` stays locked.

## Updates

The app does not phone home for updates.

1. **Settings** → **Updates folder** → folder that contains `MyFileSync-Setup-*.exe`.
2. **Check for updates**.
3. If a newer filename version is found, use the install banner. The installer runs and the app quits.

## Verify a small ADS test

1. On an NTFS disk, create a small folder and a file.
2. Optional: attach a named stream with PowerShell, for example  
   `Set-Content -Path .\file.txt -Stream MyNote -Value 'hello'`
3. Mirror that folder to an empty NTFS folder.
4. Compare: you should see a create (and stream work if **ADS** is on).
5. Sync, then Compare again. Matching items should not remain as differences, except streams you excluded (default excludes include `Zone.Identifier` and legacy `MD5`).

If the target is not NTFS (exFAT, FAT, many NAS filesystems, SFTP), streams cannot be stored. The body may copy; the streams will not match. That is a filesystem limit, not a silent success of ADS sync.
