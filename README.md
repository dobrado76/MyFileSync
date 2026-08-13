# MyFileSync

Windows-first **folder synchronization and backup** built with **Electron + React**. The headline capability is **faithful NTFS Alternate Data Stream (ADS) replication** — something [FreeFileSync](https://freefilesync.org/) does not offer and your legacy **BackupMirror** (DoubleChecker) pioneered in C#.

## Why this exists

- **FreeFileSync** is excellent for mirror/update/two-way sync, scheduling, and parallel I/O — but copies the primary file body only; alternate streams are lost on many copy paths.
- **BackupMirror** (2013 WinForms) already compared and synced ADS, cached MD5 in streams, detected moves by stream manifests, and used VSS for locked files — but lacks a modern UI, CLI, scheduler, and wildcard filters.
- **MyFileSync** combines FFS-style review UX with BackupMirror-grade ADS fidelity in a maintainable Electron codebase.

## Status

**Phase 1** — Compare, sync, jobs, INI import. Run `npm install && npm run dev`. Build with `npm run dist`.

## Reading order

| Doc | Purpose |
|-----|---------|
| [PLAN.md](PLAN.md) | Canonical project plan |
| [docs/README.md](docs/README.md) | Full doc index |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | What the product must do |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Locked decisions (D1–D7) |
| [docs/ADS_SYNC.md](docs/ADS_SYNC.md) | NTFS stream model and copy matrix |
| [docs/COMPARE_AND_SYNC.md](docs/COMPARE_AND_SYNC.md) | Engine: modes, DB, algorithms |
| [docs/FREEFILESYNC_PARITY.md](docs/FREEFILESYNC_PARITY.md) | Feature checklist vs FFS 14.x |
| [docs/BACKUPMIRROR_MIGRATION.md](docs/BACKUPMIRROR_MIGRATION.md) | Legacy INI → JSON import |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process model and modules |
| [docs/UI_DESIGN.md](docs/UI_DESIGN.md) | Compare grid and chrome |
| [docs/IPC_CONTRACT.md](docs/IPC_CONTRACT.md) | Main ↔ renderer API |
| [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) | Job JSON + userData layout |
| [docs/SECURITY.md](docs/SECURITY.md) | Path guards and delete safety |
| [docs/BUILD.md](docs/BUILD.md) | Build and release (future) |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Phased delivery |

## Independence

This repository is **standalone**. It must not import, copy from, or depend on [MyFileExplorer](F:\Sites\MyFileExplorer) or any other project. Conceptual patterns from BackupMirror and MyFileExplorer ADS work may be **reimplemented** here.

## License

TBD at first code commit (recommend MIT to match sibling tools).
