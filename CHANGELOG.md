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
- Move/rename detection after compare: same size+mtime Create+Delete become Move (or Rename); sync renames on the target instead of copy+delete.
- Compare folder tree on the left of the change list (FreeFileSync-style). Click a folder to show that branch. After Compare, only the root is expanded.
- Tree context menu: exclude this folder or this name permanently (job filters), exclude from this compare only, or sync this folder now (then drop succeeded items from the tree).
- ADS sync: compare ignores excluded/`Zone.Identifier` and compare-cache streams; stream-only updates copy real ADS, delete extra dest streams on mirror, and restore host timestamps.

### Fixed

- Sync copies now stamp dest with source FILETIME so the next Compare does not treat just-copied files as Update. Folder mtime is ignored (copying into a folder must not recopy the whole tree). CopyFileEx uses long paths.
- Compare toolbar no longer shows Try to detect moved / Minimize Refresh / VSS / Auto Backup / Fast Compare / Use Archive Flag. Move detection is always on.

## [0.1.0] — 2026-08-13

### Added

- Initial release: Electron shell, ADS list/copy, settings, local update workflow.
- `npm run dist` → NSIS installer.

[0.1.0]: https://github.com/your-org/myfilesync/releases/tag/v0.1.0
