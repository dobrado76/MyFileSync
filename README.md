# MyFileSync

[![Download Latest Release](https://img.shields.io/github/v/release/dobrado76/MyFileSync?label=Download%20Latest%20Installer)](https://github.com/dobrado76/MyFileSync/releases/latest)
[![License: GPL-3.0-only](https://img.shields.io/badge/License-GPL--3.0--only-blue.svg)](LICENSE)

MyFileSync is a Windows folder **sync and backup** workbench built for one problem most tools quietly get wrong: **NTFS Alternate Data Streams**.

Explorer shows one file size — the primary `$DATA` body. Notes, generation parameters, folder statistics, Mark-of-the-Web, edit history, and other named streams live beside that body on the same path. Robocopy (by default), zip tools, cloud sync, and even excellent sync apps like FreeFileSync copy the body and **drop the streams**. After a “successful” backup you still have the bytes — and none of the meaning that lived on the file.

MyFileSync compares **size + date/time and stream manifests**, shows stream diffs in a side-by-side change list, and copies streams on **NTFS→NTFS** with the same care as the file body. Jobs hold one or more folder pairs; you **Compare**, review, then **Sync** — never a blind overwrite without a change list.

It is FreeFileSync-familiar where that helps (mirror / update / two-way, filters, Recycle Bin deletes, `.ffs_gui` import/export), and deliberately **Windows-first** where Win32 and ADS matter. If you use **[MyFileExplorer](https://github.com/dobrado76/MyFileExplorer)** features that store notes, icons, folder stats, or metadata in ADS, this is the sync tool meant to keep that data alive on a second disk or NAS share that supports streams.

| | |
| --- | --- |
| **Platform** | Windows 10 / 11 x64 |
| **Stack** | Electron · React 19 · TypeScript · Zustand · Zod · sql.js · koffi (Win32) |
| **License** | **GPL-3.0-only** — [LICENSING.md](LICENSING.md) · [TRADEMARK.md](TRADEMARK.md) |

---

## Why not just FreeFileSync / robocopy / “any backup”?

Those tools are fine until the metadata that matters is not in `$DATA`.

| Gap | What happens |
| --- | --- |
| **Silent ADS loss** | Body matches; notes, prompts, folder stats, MotW, and other streams are gone on the destination |
| **“Equal” that isn’t** | Compare never looks at stream manifests, so ADS-only drift never appears |
| **Huge trees** | Full walks every time; no NTFS change-journal fast path for unchanged folders |
| **Blind sync** | Easy to run destructive mirror without a reviewed change list |

MyFileSync’s answer: **ADS is core** (not a plugin), Compare always surfaces stream diffs when a pair has ADS on, Sync uses `CopyFileEx` / stream copy on NTFS→NTFS, and Sync is always a **separate click** after Compare. Details: **[docs/ADS_SYNC.md](docs/ADS_SYNC.md)** · **[docs/FREEFILESYNC_PARITY.md](docs/FREEFILESYNC_PARITY.md)** · **[docs/COMPARE_AND_SYNC.md](docs/COMPARE_AND_SYNC.md)**.

---

## Highlights

**Jobs that match how you actually back up**
- Named jobs with **one or more folder pairs** (source → target); tick which pairs run Compare and Sync
- Per-pair **ADS** checkbox — off skips stream listing/copy for trees that are `$DATA` only
- Variants: **Mirror**, **Update**, **Automatic**, **Two-way** (sync DB under `%APPDATA%`)
- Save as versioned job JSON; **import / export FreeFileSync** `.ffs_gui` / `.ffs_batch`
- Gitignore-style **include / exclude** filters (`!Thumbnails`, `*.tmp`, `/this/path/only`) — [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md)

**Compare you can trust on large trees**
- Paired walk: size + mtime from the directory index, then **ADS manifests** when `$DATA` already matches
- **`$DATA` equal + streams differ** → **Update streams only** — not “equal”
- Two-phase Compare: enumerate for an exact item count, then classify (listings reused)
- **NTFS change journal** (default on) skips unchanged folders after a completed Compare; cursors live in AppData and are shared across jobs with the same paths + filters
- Virtualized change list + folder tree (millions of diffs stay usable)
- Move / rename detection (Create + Delete → Move/Rename; sync renames on the target when volumes match)
- Optional **touch time when size matches** — fix Explorer-copy timestamp drift without re-copying bytes

**Sync that is safe by default**
- Progress panel (counts, rates, graphs); minimize to the status bar
- **Cancel** stops the next item; finished Sync items drop so the next Sync is a resume
- Deletes default to the **Recycle Bin**; mirror with deletes asks once (Don’t show again in Settings)
- Dest **read-only** is cleared, written, then restored to match source — not treated as a hard failure
- Parallel copies per device; moves and deletes stay ordered
- Plain-language errors for permission denied and non-NTFS ADS targets
- UNC best-effort ADS with preflight probe; SFTP is **primary stream only**

**Built for the Windows power-user stack**
- Same `%APPDATA%\myfilesync` settings for `npm run dev` and installed builds
- CLI / batch unattended run and folder watch (RealTimeSync-style companion)
- Local updates folder: point Settings at your `release` directory and install newer `MyFileSync-Setup-*.exe`
- Dark / light / system theme; hardware-acceleration toggle when the GPU is busy elsewhere

---

## Quick start

```powershell
npm install
npm run dev          # HMR — same %APPDATA%\myfilesync as the installed app
npm run check        # typecheck + lint + tests
npm run dist         # bump patch, prune old Setup*.exe, build installer
npm run dist:nobump  # rebuild without bumping version
```

Requires **Node.js LTS (20+)** and **Windows 10/11 x64**. Settings and jobs live in `%APPDATA%\myfilesync` for both dev and installed builds. Details: [docs/BUILD.md](docs/BUILD.md).

---

## For friends trying the app

The installer is large; get it from a **GitHub Release** when one is published:

1. Open [Releases](https://github.com/dobrado76/MyFileSync/releases/latest) (or the download badge above).
2. Run `MyFileSync-Setup-x.y.z.exe`.
3. **New job** → add a folder pair (a small test tree is enough).
4. Leave **ADS** ticked on the pair. Set variant to **Mirror**.
5. Click **Compare** — you should see Creates / Updates, not a silent “all equal” when streams differ.
6. Expand a row with an ADS badge — stream names and sizes on left vs right.
7. Click **Sync**, watch the progress panel, then **Compare** again — destination stream list should match (minus excluded streams such as `Zone.Identifier` if you leave defaults).
8. Add an exclude like `!Thumbnails` or `*.tmp` on the Filters tab; Compare again and confirm those paths are gone from the change list.
9. On a large NTFS pair: finish one full Compare + Sync, then change a few files and Compare again — the window title should show **change journal** when the USN fast path applies.
10. Move a file on the source into another folder under the same pair; Compare — expect **Move** / **Rename** when size+mtime still match, not a lonely Create with the old path left on the target.
11. (Optional) Import a FreeFileSync `.ffs_gui` / `.ffs_batch` and confirm pairs + filters land in the job.
12. Settings → set **Updates folder** to a folder that holds newer installers → **Check for updates**.

Product notes: [RELEASE_NOTES.md](RELEASE_NOTES.md) · [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) · [docs/ADS_SYNC.md](docs/ADS_SYNC.md).

---

## Documentation

| Doc | What it’s for |
| --- | --- |
| **[docs/README.md](docs/README.md)** | Doc index & reading order |
| **[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)** | User-visible behavior and personas |
| **[docs/DECISIONS.md](docs/DECISIONS.md)** | Locked choices (D1–D32) |
| **[docs/ADS_SYNC.md](docs/ADS_SYNC.md)** | NTFS streams — compare, copy, filters |
| **[docs/COMPARE_AND_SYNC.md](docs/COMPARE_AND_SYNC.md)** | Variants, classify, USN, sync actions |
| **[docs/FREEFILESYNC_PARITY.md](docs/FREEFILESYNC_PARITY.md)** | Feature matrix vs FreeFileSync |
| **[docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md)** | Job JSON and `userData` layout |
| **[docs/UI_DESIGN.md](docs/UI_DESIGN.md)** | Compare grid, tree, chrome |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Main / renderer split |
| **[docs/IPC_CONTRACT.md](docs/IPC_CONTRACT.md)** | Typed preload API |
| **[docs/SECURITY.md](docs/SECURITY.md)** | Path validation and delete safety |
| **[docs/BUILD.md](docs/BUILD.md)** | Dev build and NSIS installer |
| **[docs/TESTING.md](docs/TESTING.md)** | Automated and NTFS fixture tests |
| **[docs/BACKUPMIRROR_MIGRATION.md](docs/BACKUPMIRROR_MIGRATION.md)** | Legacy BackupMirror INI field mapping |
| **[PLAN.md](PLAN.md)** | Product overview / stack |
| **[CHANGELOG.md](CHANGELOG.md)** | Full history |
| **[RELEASE_NOTES.md](RELEASE_NOTES.md)** | v0.2 product-release summary |

---

## Goals

- Make **ADS fidelity** the default on NTFS→NTFS, not an afterthought
- Feel familiar to FreeFileSync users without pretending to be a cross-platform clone
- Compare and Sync large trees with a reviewed change list, cancel, and resume
- Use the NTFS change journal to skip work that has not changed
- Keep job preferences round-trippable in one Zod schema (export/import)
- Stay a **standalone** codebase — no imports from other products

## Non-goals (still)

- macOS / Linux as supported targets
- Built-in cloud providers (Google Drive, etc.)
- Email run logs
- Content-hash compare / verify-after-copy (removed on purpose for multi-TB trees)
- Deduplication / Borg-style archives
- Full FreeFileSync parity on every filter rule and VSS batch mode

---

## Pairing with MyFileExplorer

**[MyFileExplorer](https://github.com/dobrado76/MyFileExplorer)** stores a lot of meaning **on the file itself** as NTFS Alternate Data Streams (notes, item icons, folder statistics / space maps, media metadata, and more). That data travels with the path on NTFS — and disappears under tools that only copy `$DATA`.

Use MyFileSync (or another ADS-aware tool) when backing up those drives or folder trees. The two apps share a Windows / Electron / ADS mindset; they are separate repositories and installers.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Electron + HMR |
| `npm run check` | typecheck + lint + test — same command CI runs |
| `npm run test` | Vitest |
| `npm run build` | Production electron-vite build |
| `npm run dist` | Bump patch, prune old Setup*.exe, build Windows installer |
| `npm run dist:nobump` | Installer without version bump |
| `npm run build:win` | Alias for `dist` |

Open **this folder** as the workspace. Everything needed to build and ship lives here.

---

## Contributing

Contributions are welcome. Bug reports, feature ideas, documentation fixes, and pull requests all help.

- Open an [issue](https://github.com/dobrado76/MyFileSync/issues) to report a problem or propose a change
- Prefer a focused pull request with a clear description of what changed and why
- Run `npm run check` before opening a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for licence terms and development notes. Product decisions live in [docs/DECISIONS.md](docs/DECISIONS.md).

## Licensing

MyFileSync is free software under the **GNU General Public License v3.0 only** ([LICENSE](LICENSE)). Commercial use and redistribution are allowed; distributed modifications must remain under GPLv3 with corresponding source. The **MyFileSync** name and logo are trademarks — see [TRADEMARK.md](TRADEMARK.md). Details: [LICENSING.md](LICENSING.md) · [NOTICE](NOTICE) · [AUTHORS](AUTHORS) · [CONTRIBUTING.md](CONTRIBUTING.md).
