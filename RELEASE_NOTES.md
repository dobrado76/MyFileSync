# MyFileSync v0.1 — Release notes

**Release date:** 2026-08-13  
**Installer:** `MyFileSync-Setup-0.1.0.exe`

## Overview

First tagged build of **MyFileSync** — Windows folder sync and backup with faithful **NTFS Alternate Data Stream (ADS)** replication.

## Highlights

- **ADS on NTFS:** List alternate streams on a host file and copy them to another path, with manifest verification.
- **Stack:** Electron + React 19 + TypeScript, Zustand, Zod, Vitest.
- **Local updates:** Point **Settings → Updates folder** at your release directory. The app scans for `MyFileSync-Setup-*.exe`, compares versions, and shows **Install update** when a newer build is available.

## Install

1. Run `MyFileSync-Setup-0.1.0.exe` from the `release` folder.
2. Optional: in **Settings**, set **Updates folder** to the directory where you keep later installers.

## Build from source

```powershell
npm install
npm run check    # typecheck, lint, test
npm run dist     # → release\MyFileSync-Setup-{version}.exe
```

## Notes

- Compare grid, sync engine, and filters landed after this tag — see [CHANGELOG.md](CHANGELOG.md) `[Unreleased]`.
- Update check is **folder-based** (local/SMB path), not a remote feed.
- ADS features are Windows / NTFS.

## Links

- [CHANGELOG.md](CHANGELOG.md)
- [docs/TESTING.md](docs/TESTING.md)
- [README.md](README.md)
