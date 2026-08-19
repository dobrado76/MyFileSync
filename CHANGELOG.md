# Changelog

All notable changes to MyFileSync are documented here.

## [Unreleased]

Work since **0.1.0** (not a new tagged release yet).

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

### Changed

- Windows installer builds skip Authenticode signing (`signExecutable: false`). Icon and version resources are still written.

### Fixed

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

[0.1.0]: https://github.com/your-org/myfilesync/releases/tag/v0.1.0
