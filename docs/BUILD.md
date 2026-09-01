# Build and release

Local Windows installer via `npm run dist`.
## Prerequisites

- Node.js LTS (20+)
- Windows 10/11 x64

## Development

```bash
npm install
npm run dev          # electron-vite dev
npm run typecheck
npm run test
npm run lint
npm run check        # all of the above
```

## Production build

```bash
npm run build         # electron-vite → out/
npm run dist          # bump patch (X.Y.Z → X.Y.Z+1), then installer
npm run dist:nobump   # installer with the current package.json version
```

`npm run dist` writes:

| Output | Path |
|--------|------|
| NSIS installer | `release/MyFileSync-Setup-{version}.exe` |
| Unpacked app | `release/win-unpacked/` |

Example for v0.2: `release/MyFileSync-Setup-0.2.0.exe`

After a successful build, older `MyFileSync-Setup-*.exe` (and matching `.blockmap`) files in `release/` are deleted so only the current version remains. Cleanup does not run if the build fails.

`prepare-dist` does **not** stop an installed MyFileSync (AppData). It only stops 7-Zip tools and processes whose executable path is under `release/` (for example `win-unpacked`).

## Local updates workflow

1. Build a new installer with `npm run dist`.
2. In MyFileSync **Settings**, set **Updates folder** to your `release` directory (or any folder where you copy installers).
3. Click **Check for updates** in Settings when you want to scan for `MyFileSync-Setup-*.exe` and compare semver from the filename.
4. When a newer version exists, an **Install update** banner runs the setup and quits the app.

## CI

Workflow: [`.github/workflows/build-windows.yml`](../.github/workflows/build-windows.yml)

| Trigger | What runs |
|---------|-----------|
| Push / PR to `main` or `master` | `npm run check` on `windows-latest` |
| Tag `v*` (e.g. `v0.2.15`) | Check + build NSIS installer → attach to a **GitHub Release** |
| **Actions → Run workflow** | Check only (same as a main push) |

`package.json` must agree with the tag:

| Tag | Allowed `package.json` |
|-----|-------------------------|
| `v0.2.15` | exactly `0.2.15` |
| `v0.2` (short) | any `0.2.x` (e.g. `0.2.15`) — installer keeps the full package version |

Use `npm run dist:nobump` / `npm run build:win` so the tag build does **not** bump the patch.

```powershell
# Current package.json is 0.2.15 — either tag works:
git tag v0.2.15
# or short line tag:
git tag v0.2
git push origin v0.2
```

When the workflow finishes, download from:

`https://github.com/dobrado76/MyFileSync/releases/latest`

Installers are **not** stored as Actions artifacts (quota). They only appear on the GitHub Release.

## Versioning

Semantic versioning in `package.json`. `npm run dist` increments the patch (`Z`) before building so each installer is a new `MyFileSync-Setup-X.Y.Z.exe`. Use `npm run dist:nobump` to rebuild the same version. Display uses short form where patch is zero (for example `0.2.0` → **v0.2**). Job schema `version` field is independent of app semver.

Windows builds do **not** Authenticode-sign the exe or installer. `win.signExecutable` is false, `forceCodeSigning` is false, and `CSC_IDENTITY_AUTO_DISCOVERY` is turned off so electron-builder does not search for a certificate. Icon and version resources are still written.
