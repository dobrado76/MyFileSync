# MyFileSync

Windows-first **Electron + React** folder sync and backup. The product differentiator is **NTFS Alternate Data Stream (ADS)** compare and copy — not an optional extra.

Users configure **folder pairs**, **compare** (including per-stream manifests), **review** a color-coded action list, and **sync** (mirror / update / automatic / two-way).

## Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron + electron-vite |
| UI | React 19 + TypeScript (strict) |
| State | Zustand |
| Validation | Zod on IPC, settings, and job files |
| Tests | Vitest, ESLint, Prettier |
| Sync DB | sql.js under Electron `userData` |
| Win32 | koffi — FindFirstStreamW, CopyFileEx, attrs |
| Hash | Node `crypto` — MD5 / SHA-256 |

## Not in this product

- macOS / Linux as supported targets
- Google Drive / cloud SaaS backup
- Email run logs

## Docs

See [docs/README.md](docs/README.md). Product overview: [README.md](README.md).

## Versus other tools

| | FreeFileSync | BackupMirror | **MyFileSync** |
|---|--------------|--------------|----------------|
| ADS sync | No | Yes | **Yes (core)** |
| Side-by-side compare | Yes | Tree only | **Yes** |
| Scheduler / CLI | Yes | No | **Yes** |
| ADS compare cache on files | No | Yes | **Optional per job** |
