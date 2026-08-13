# MyFileSync — project plan

**This file is the canonical plan for this repo.** Open `F:\Sites\MyFileSync` as its own workspace. Do not depend on MyFileExplorer or external chat plans.

**Status:** Early development — **v0.1.0** released (Phase 0). Compare/sync and later phases are in `[Unreleased]` until you cut a version.

---

## What we are building

A **Windows-first Electron + React** application for **folder synchronization and backup** with **NTFS Alternate Data Stream (ADS) fidelity** as the primary differentiator vs FreeFileSync and most robocopy-style tools.

Users configure **folder pairs** (left/right), **compare** differences (including per-stream ADS manifests), **review** a color-coded action list, and **run** mirror/update/two-way sync with optional VSS, hard-link awareness, and parallel I/O.

Legacy behavioral reference: **BackupMirror** / DoubleChecker (C# WinForms, 2013) at `E:\Dev\Projects\!CPP\MyExplorer\MyExplorer\BackupMirror`.

## Stack (locked)

| Layer | Choice |
|-------|--------|
| Shell | Electron + electron-vite |
| UI | React 19 + TypeScript (strict, `noUncheckedIndexedAccess`) |
| State (renderer) | Zustand |
| Validation | Zod on IPC / settings / job files |
| Tests | Vitest, ESLint, Prettier |
| Sync DB | sql.js under Electron `userData` |
| Win32 | koffi — FindFirstStreamW, CopyFileEx, attrs |
| Hash | Node `crypto` — MD5 / SHA-256 selectable |

## Non-goals (v1)

- macOS / Linux as primary targets
- Google Drive / cloud SaaS backup platform
- Email run logs (FreeFileSync donation feature)

## Doc map

See [docs/README.md](docs/README.md) for the full index.

## Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Specs + electron-vite scaffold + ADS spike | Released (0.1.0) |
| **1** | Mirror/Update, NTFS→NTFS ADS copy, compare grid, job JSON, INI import | In progress |
| **1.5** | ADS MD5 cache, fast folder compare, move/rename, VSS stub, hard links, verify | In progress |
| **2** | Two-way + sync DB, versioning, batch/CLI, RealTimeSync watch | In progress |
| **3** | SFTP provider + UNC ADS preflight (SFTP compare wiring partial) | In progress |

Details: [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Agent rules

See [.cursor/rules/project.mdc](.cursor/rules/project.mdc).

## Competitive summary

| | FreeFileSync | BackupMirror | **MyFileSync** |
|---|--------------|--------------|----------------|
| ADS sync | No | Yes | **Yes (core)** |
| Side-by-side UI | Yes | Tree only | **Yes** |
| Scheduler / CLI | Yes | No | **Yes** |
| ADS compare cache on files | No | Yes | **Optional per job** |

Full checklist: [docs/FREEFILESYNC_PARITY.md](docs/FREEFILESYNC_PARITY.md).
