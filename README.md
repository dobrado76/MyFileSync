# MyFileSync

Windows folder **sync and backup** with **NTFS Alternate Data Stream (ADS)** fidelity.

Most sync tools copy the file body only. Alternate streams — Mark-of-the-Web, generation parameters, folder stats, compare caches — are dropped. MyFileSync compares and copies them on NTFS→NTFS, then shows stream diffs in the compare grid.

## What it does

- **Jobs** with one or more folder pairs (source / target). Tick which pairs run Compare and Sync. Import FreeFileSync `.ffs_gui` files.
- **Variants:** Mirror, Update, Automatic, Two-way
- **Compare** by size + date/time, or MD5 / SHA-256 content hash
- **ADS manifests** always listed and compared (name + size), even when `$DATA` matches
- **Filters** — gitignore-style patterns (`!Thumbnails`, `*.tmp`) or a single relative path
- **Sync** with Recycle Bin deletes (default), confirm when mirror would delete
- **CLI** unattended run and folder watch (RealTimeSync)

## Run

```powershell
npm install
npm run dev
```

Build the Windows installer:

```powershell
npm run dist
```

Requires Node.js LTS and Windows 10/11 x64. Details: [docs/BUILD.md](docs/BUILD.md).

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/README.md](docs/README.md) | Full index |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Product behavior |
| [docs/ADS_SYNC.md](docs/ADS_SYNC.md) | NTFS streams — compare and copy |
| [docs/COMPARE_AND_SYNC.md](docs/COMPARE_AND_SYNC.md) | Engine: variants, classify, sync |
| [docs/PROJECT_FORMAT.md](docs/PROJECT_FORMAT.md) | Job JSON and `userData` layout |
| [docs/UI_DESIGN.md](docs/UI_DESIGN.md) | Compare grid and chrome |
| [docs/BUILD.md](docs/BUILD.md) | Dev build and NSIS installer |

## License

MIT
