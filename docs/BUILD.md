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

Example for v0.1: `release/MyFileSync-Setup-0.1.0.exe`

After a successful build, older `MyFileSync-Setup-*.exe` (and matching `.blockmap`) files in `release/` are deleted so only the current version remains. Cleanup does not run if the build fails.

## Local updates workflow

1. Build a new installer with `npm run dist`.
2. In MyFileSync **Settings**, set **Updates folder** to your `release` directory (or any folder where you copy installers).
3. Click **Check for updates** in Settings when you want to scan for `MyFileSync-Setup-*.exe` and compare semver from the filename.
4. When a newer version exists, an **Install update** banner runs the setup and quits the app.

## CI

GitHub Actions on `windows-latest` runs `npm run check`. Tag-push installer attach is optional.
## Versioning

Semantic versioning in `package.json`. `npm run dist` increments the patch (`Z`) before building so each installer is a new `MyFileSync-Setup-X.Y.Z.exe`. Use `npm run dist:nobump` to rebuild the same version. Display uses short form where patch is zero (for example `0.1.0` → **v0.1**). Job schema `version` field is independent of app semver.

Windows builds do **not** Authenticode-sign the exe or installer. `win.signExecutable` is false, `forceCodeSigning` is false, and `CSC_IDENTITY_AUTO_DISCOVERY` is turned off so electron-builder does not search for a certificate. Icon and version resources are still written.
