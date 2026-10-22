# Architecture (support view)

This section explains behaviour you can observe. It is not an internal design dump.

## Processes

- **Main process (Electron):** compare, sync, Win32 copy, ADS listing, job files, settings, SQLite, CLI.
- **Window (React):** buttons, grids, dialogs. It cannot read the disk itself. It calls the main process and receives progress events.

If the window is closed, a GUI compare/sync stops with the app. A CLI `--run` has no window.

## Data you can back up yourself

Copy `%APPDATA%\myfilesync` while the app is **not** running if you want a snapshot of jobs, settings, two-way databases, and USN cursors. Restoring that folder onto another PC restores definitions, not the files inside your source/target trees. USN cursors from another machine are meaningless; the next Compare should fall back to a full walk if the journal id does not match.

Do not edit `compare\` JSONL by hand.

## External components

| Area | MyFileSync | Outside |
| --- | --- | --- |
| Install | Documents the NSIS exe and `npm run dist` | Windows Installer UI, SmartScreen |
| NTFS streams | Lists and copies them on NTFS→NTFS via Win32 | The filesystem. exFAT cannot store ADS. |
| Recycle Bin | Asks the shell to recycle when the option is on | Explorer’s Recycle Bin |
| SFTP | Connects with host, user, password or key path (ssh2) | The SSH server’s own accounts, chroot, and disk |
| USN journal | Reads cursors to skip unchanged folders | NTFS journal size and wrap policy |
| FreeFileSync files | Imports `.ffs_gui` / `.ffs_batch` into a job | FreeFileSync itself |
| Updates | Compares installer file names in a folder you choose | You supply the exe |
| 7-Zip | Not used at runtime | electron-builder’s `7za.exe` during `npm run dist` only |

## Sync safety boundary

The app will delete or overwrite target files when the variant and the included rows say so. The safety tools are: the change list, row checkboxes, **Update** vs **Mirror**, the confirm dialog (GUI, not CLI, not queued-during-compare), and the Recycle Bin option. There is no second hidden backup unless `versioning.enabled` is true in that job’s JSON.
