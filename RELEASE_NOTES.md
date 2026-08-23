# MyFileSync v0.2 — Release notes

**Release date:** 2026-08-23  
**Installer:** `MyFileSync-Setup-0.2.0.exe`

## Overview

**v0.2** is the first feature-complete compare/sync release after v0.1. It adds the full compare grid, sync engine, FreeFileSync import/export, folder tree, progress panel, parallel copies, and **NTFS change-journal** incremental compare.

## Highlights

### Compare & sync

- **Two-phase Compare** — enumerate for an exact item count, then classify (listings reused; ADS/hash only in pass two).
- **NTFS USN journal** (default on) — skip unchanged folders after the first completed Compare. Cursor stored in AppData per pair (shared across jobs with the same paths and filters).
- **Parallel sync copies** — `copyPerDevice` (default 6) is honored; moves/deletes stay serial.
- **Compare folder tree** — filter by branch, exclude folders, sync a subtree, move/rename detection.
- **Progress panel** — counts, rates, graphs; minimize to status bar; full absolute paths in progress text.
- **Window title** during enumerate shows **change journal** vs **full walk** and the exact reason when USN is skipped.

### Jobs & parity

- Multi-pair jobs with per-pair **enabled** and **ADS** ticks.
- Import/export **FreeFileSync** `.ffs_gui` / `.ffs_batch`.
- Filters (gitignore-style), Recycle Bin deletes, mirror delete confirm, settings search.

### ADS (unchanged differentiator)

- NTFS→NTFS stream manifests, stream-only updates, optional compare cache in ADS.

## Upgrade notes

1. Install `MyFileSync-Setup-0.2.0.exe` over v0.1 or replace the portable build.
2. After upgrade, run **Compare → Sync (complete) → Compare** once per heavy pair so USN cursors are written under `compare-usn/pairs/`.
3. If a pair still full-walks, read the **window title** — it names the reason (stale cursor, journal wrap, too many changes, etc.).

## Install

```powershell
# From release folder
.\MyFileSync-Setup-0.2.0.exe
```

Optional: **Settings → Updates folder** → point at your `release` directory for local update checks.

## Build from source

```powershell
npm install
npm run check
npm run dist:nobump   # → release\MyFileSync-Setup-0.2.0.exe
```

## Links

- [CHANGELOG.md](CHANGELOG.md)
- [docs/COMPARE_AND_SYNC.md](docs/COMPARE_AND_SYNC.md)
- [docs/BUILD.md](docs/BUILD.md)
