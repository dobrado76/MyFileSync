# Development

For people changing the program. End users can ignore this.

## Commands

```powershell
npm install
npm run dev          # electron-vite
npm run check        # typecheck, lint, unit tests
npm run test         # vitest
npm run dist         # bump patch, then installer
npm run dist:nobump  # installer, no version bump
npm run docs:build   # regenerate AI-SUPPORT.md
npm run docs:check   # fail if AI-SUPPORT.md is stale
```

Node 20+; CI uses Node 22 on `windows-latest`.

NTFS fixture setup used in CI: `scripts\create-fixtures.ps1` before `npm run check`.

## Layout

| Path | Role |
| --- | --- |
| `src/main` | Compare, sync, Win32, jobs, CLI |
| `src/renderer` | React UI |
| `src/shared` | Zod schemas, filter and sync-order helpers, tested with Vitest |
| `src/preload` | Typed IPC |
| `docs/` | Product and support articles |
| `AI-SUPPORT.md` | Generated bundle. Do not hand-edit. |

Job fields must be added to `jobSchema` so import/export round-trips. Do not add a second allowlist.

Win32 ADS tests are Windows-only. Pure logic belongs in `src/shared` with unit tests.

## Installer

`electron-builder` writes `release\`. `scripts/prepare-dist.mjs` clears `release\win-unpacked` after stopping stale `7za.exe` and processes launched from `release\`. It does not kill the installed AppData copy.

The exe is not Authenticode-signed (`signExecutable` false).

## Docs rule

Behaviour changes update the matching article under `docs/` (`user-guide.md`, `configuration.md`, `troubleshooting.md`, `FAQ.md`, and others) in the same change, then `npm run docs:build`. CI runs `npm run docs:check` so the bundle cannot drift.

## License

GPL-3.0-only. See `LICENSING.md` and `LICENSE` in the repository.
