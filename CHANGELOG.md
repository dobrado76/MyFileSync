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

## [0.1.0] — 2026-08-13

### Added

- Initial release: Electron shell, ADS list/copy, settings, local update workflow.
- `npm run dist` → NSIS installer.

[0.1.0]: https://github.com/your-org/myfilesync/releases/tag/v0.1.0
