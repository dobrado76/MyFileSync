# Changelog

All notable changes to MyFileSync are documented here.

## [Unreleased]

### Changed

- **Licence (D32)** — **GPL-3.0-only**, plus trademark policy for the product name/logo. See [LICENSING.md](LICENSING.md), [TRADEMARK.md](TRADEMARK.md), [NOTICE](NOTICE).
- **CI** — tag `vX.Y.Z` builds the Windows installer and attaches it to a GitHub Release (same pattern as MyFileExplorer). See [docs/BUILD.md](docs/BUILD.md).

### Fixed

- Change-journal compare after a left-side move/rename now marks the **old** path dirty too (USN `RENAME_OLD_NAME`). Previously only the live FRN path was used, so the old folder was skipped, target leftovers never showed as Delete, and move detection fell back to Create.
- CI ADS integration tests — fixtures are gitignored; suite now creates them in `beforeAll`, and the workflow runs `create-fixtures.ps1` before `npm run check`.
- Tag CI: `electron-builder --publish never` so installers are attached only via `action-gh-release` (no `GH_TOKEN` required for the pack step).

## [0.2.0] — 2026-08-23

First full compare/sync release after v0.1. See [RELEASE_NOTES.md](RELEASE_NOTES.md).

### Added

- Jobs, compare engine, sync engine, compare grid, run log.
- ADS hash cache, fast folder compare, move/rename detection, verify-after-copy, archive-flag scan, hard links.
- Two-way sync (sync DB), versioning, batch JSON, headless CLI, folder watch.
- UNC ADS preflight, SFTP provider (primary stream only).
- Filter manager (gitignore-style patterns and relative paths).
- Custom app icon; compare status shows live item count and elapsed time.
- Settings modal, window restore, job toolbar.
- Job picker and **+ New** sit in the center of the title bar.
- Move/rename detection after compare: same size+mtime Create+Delete become Move (or Rename); sync renames on the target instead of copy+delete.
- Compare folder tree on the left of the change list (FreeFileSync-style). Click a folder to show that branch. After Compare, only the root is expanded.
- Tree context menu: exclude this folder or this name permanently (job filters), exclude from this compare only, or sync this folder now (then drop succeeded items from the tree).
- ADS sync: compare ignores excluded/`Zone.Identifier` and compare-cache streams; stream-only updates copy real ADS, delete extra dest streams on mirror, and restore host timestamps.
- Import FreeFileSync `.ffs_gui` / `.ffs_batch` (folder pairs, variant, Recycle Bin, include/exclude filters).
- Folder pairs stacked on the Options tab (all visible at once), FreeFileSync-style — not a dropdown. Drag the splitter under the list to show more or fewer pairs; the scrollbar appears only when they overflow.
- Each folder pair has a checkbox (`enabled` in the job file) so Compare and Sync run only the pairs you tick.
- Ctrl+S saves the current job.
- The folder-pair list splitter height is stored on the job and restored when you come back.
- Right-click a compare result or folder tree node to Open it (Windows default app) or Reveal it (`mfe://reveal`), on source and/or target.
- Search settings on the Compare tab and in the Settings modal — type to narrow the list, no Search button.
- Settings: hardware acceleration (GPU) toggle. Off uses software rendering; restart to apply.
- Each folder pair has an **ADS** checkbox (saved on the job, default on). Off skips alternate-stream compare and extra stream copy for that pair.
- Compare does not start if a source or target folder is missing or its drive is offline. One error instead of a fake full-tree Create list.
- Compare and Sync use a **progress panel** (counts, rates, graphs). Minimize it to the status-bar string; **Progress** on the status bar opens it again. The last choice is remembered.
- **Export…** writes the current job as a FreeFileSync `.ffs_gui` or `.ffs_batch` file (pairs, variant, compare method, Recycle Bin, filters).
- Confirm mirror deletes has **Don’t show again**. Turn the prompt back on in Settings.
- Compare can skip unchanged folders using the **NTFS change journal** (`compare.useUsnJournal`, default on). Cursor in AppData `compare-usn/pairs/` keyed by compare settings + left/right paths (shared across jobs). Falls back to a full walk when the journal cannot be used.
- Compare is two-phase: **Enumerating…** (exact item count) then **Comparing…** with a real progress total. Directory listings from the first pass are reused.
- Enumerate phase shows USN mode in the **window title** (`change journal` vs `full walk — reason`); file paths no longer overwrite that line.

### Changed

- Compare lists every file and folder when a tree is missing on one side (FreeFileSync). The tree count and Sync progress are that full set — not one collapsed folder that then copies for hours.
- Windows installer builds skip Authenticode signing. The dist script does not search for a certificate. Icon and version resources are still written.

### Fixed

- `npm run dist` no longer kills a running installed MyFileSync. Only build lockers under `release/` are stopped.
- After Compare or Sync, the USN cursor is saved at the **current** journal head. Dest copies and listing closes no longer make the next Compare look like a full walk.
- Ticking a second folder pair no longer invalidates every pair’s change-journal cursor.
- USN cursor stored in AppData (`compare-usn/pairs/`), not on pair-folder ADS (writing ADS poisoned the journal).
- **Sync always refreshes** the USN cursor for enabled pairs at completion (no prior cursor file required; never re-saves a stale cursor if live snapshot fails).
- USN load matches pair paths with `\\?\` normalization; filter keys ignore include/exclude order; legacy cursors match by folder paths not only pair id.
- USN skip reasons in the window title are specific (e.g. cursor USN vs journal `firstUsn`, filter field diffs) instead of generic “settings changed”.
- Sync ignored **Copy parallelism** and copied one file at a time. It now runs that many copies at once (default 6). Create no longer lstats the source (that opens `$DATA` and wakes antivirus).
- Progress graphs dropped the start of a long run (they kept only the last ~minute of samples). They now keep the whole run and coarsen older points, never below **one sample per physical plot pixel**. Coming back from minimize records the current totals so the gap is not a blank. Compare starts a new graph at Comparing (X axis begins at enumerate elapsed) so the hour of enumerating is not an empty left side.
- Enumerating, Comparing, and Syncing show the **full absolute path** in the progress panel and status bar (not a relative path under the pair).
- The compare folder tree no longer collapses after Exclude or Sync a folder. Only a new Compare starts with just the root open.
- Compare was still walking unticked folder pairs. It now saves the current ticks first and compares only those pairs.
- Cancelling Compare keeps the diffs already found. The tree and Sync use that partial list instead of going empty.
- Cancelling Sync removes items that already succeeded. The tree shows what is left so the next Sync is a resume, not a redo.
- Window position, size, and maximized state are written immediately and restored after show, so the next launch comes back where you left it.
- Path fields (source/target, updates folder) are normal text: type, copy, and paste work. Right-click on a text field shows Cut / Copy / Paste / Select All.
- Sync copies now stamp dest with source FILETIME so the next Compare does not treat just-copied files as Update. Folder mtime is ignored (copying into a folder must not recopy the whole tree). CopyFileEx uses long paths.
- Compare toolbar no longer shows Try to detect moved / Minimize Refresh / VSS / Auto Backup / Fast Compare / Use Archive Flag. Move detection is always on.
- Compare tree omits folders and pair roots with no remaining diffs. After Sync this folder now, an emptied folder disappears.
- Compare folder tree uses classic tree chrome (dotted guides, folder icons, boxed +/−).
- Compare grid is virtualized and the folder tree is built from a slim index, so hundreds of thousands of diffs do not load a giant list into the UI.
- Sync no longer fails because the destination is read-only. Dest read-only is cleared for the write or delete, then dest matches the source.

## [0.1.0] — 2026-08-13

### Added

- Initial release: Electron shell, ADS list/copy, settings, local update workflow.
- `npm run dist` → NSIS installer.

[0.2.0]: https://github.com/your-org/myfilesync/releases/tag/v0.2.0
[0.1.0]: https://github.com/your-org/myfilesync/releases/tag/v0.1.0
