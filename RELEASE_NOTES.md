# MyFileSync v0.1 — Release notes

**Release date:** 2026-08-13  
**Installer:** `MyFileSync-Setup-0.1.0.exe`

## Overview

First public build of **MyFileSync** — a Windows-first folder sync and backup app built around faithful **NTFS Alternate Data Stream (ADS)** replication.

This release delivers the Phase 0 foundation: a runnable Electron shell, ADS enumeration/copy spike, settings, and a local update workflow so you can drop new installers into a folder and upgrade without hunting for the setup file.

## Highlights

- **ADS spike (Windows / NTFS):** List alternate streams on a host file and copy streams to another host path, with manifest verification.
- **Modern stack:** Electron + React 19 + TypeScript (strict), Zustand, Zod, Vitest.
- **Local updates:** Point **Settings → Updates folder** at your release directory. The app scans for `MyFileSync-Setup-*.exe` files, compares versions, and shows an **Install update** banner when a newer build is available.
- **One-click upgrade:** The banner launches the NSIS installer and exits so setup can replace the installed app.

## Install

1. Run `MyFileSync-Setup-0.1.0.exe` from the `release` folder (or your copy of it).
2. Optional: in **Settings**, set **Updates folder** to the directory where you keep future installers.

## Build from source

```powershell
npm install
npm run check    # typecheck, lint, test
npm run dist     # → release\MyFileSync-Setup-{version}.exe  (you run this when ready)
```

## Known limitations (Phase 0)

- Compare grid and sync engine were added after 0.1.0 — see CHANGELOG `[Unreleased]`.
- Update check is **folder-based** (local/SMB path), not a remote feed or GitHub Releases API.
- ADS listing uses `FindFirstStreamW`.
- Windows-only for ADS features.

## Links

- [CHANGELOG.md](CHANGELOG.md)
- [docs/TESTING.md](docs/TESTING.md)
- [PLAN.md](PLAN.md)
