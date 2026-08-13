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
npm run build        # electron-vite → out/
npm run dist         # build + electron-builder NSIS installer
```

`npm run dist` writes:

| Output | Path |
|--------|------|
| NSIS installer | `release/MyFileSync-Setup-{version}.exe` |
| Unpacked app | `release/win-unpacked/` |

Example for v0.1: `release/MyFileSync-Setup-0.1.0.exe`

## Local updates workflow

1. Build a new installer with `npm run dist`.
2. In MyFileSync **Settings**, set **Updates folder** to your `release` directory (or any folder where you copy installers).
3. Click **Check for updates** in Settings when you want to scan for `MyFileSync-Setup-*.exe` and compare semver from the filename.
4. When a newer version exists, an **Install update** banner runs the setup and quits the app.

## CI

GitHub Actions on `windows-latest` runs `npm run check`. Tag-push installer attach is optional.
## Versioning

Semantic versioning in `package.json`. Display uses short form where patch is zero (for example `0.1.0` → **v0.1**). Job schema `version` field is independent of app semver.

## Code signing

Recommended for Windows SmartScreen; document in release checklist when applicable.
