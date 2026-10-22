# Documentation

Product and technical docs for **MyFileSync**. Licence: [../LICENSING.md](../LICENSING.md) (**GPL-3.0-only**).

For day-to-day help, start with the repository-root [AI-SUPPORT.md](../AI-SUPPORT.md) (one file you can hand to an assistant). The articles below are the sources for that bundle plus older engineering notes.

## Support articles (bundled into AI-SUPPORT.md)

| Doc | Contents |
|-----|----------|
| [product.md](product.md) | Purpose, variants, non-goals |
| [getting-started.md](getting-started.md) | Install, first job, AppData |
| [user-guide.md](user-guide.md) | Window controls and workflows |
| [configuration.md](configuration.md) | settings.json and job JSON |
| [reference.md](reference.md) | Compare, sync order, limits |
| [troubleshooting.md](troubleshooting.md) | Symptom → checks |
| [FAQ.md](FAQ.md) | Common questions |
| [architecture.md](architecture.md) | What runs where, in user terms |
| [development.md](development.md) | Build, test, docs commands |
| [roadmap.md](roadmap.md) | Shipped vs schema-only vs out of scope |
| [support-evaluation.md](support-evaluation.md) | Maintainer Q&A cases (not bundled) |

Regenerate the bundle with `npm run docs:build`. Check it with `npm run docs:check`.

## Product

| Doc | Contents |
|-----|----------|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | User-visible behavior |
| [DECISIONS.md](DECISIONS.md) | Locked architecture and UX choices |
| [FREEFILESYNC_PARITY.md](FREEFILESYNC_PARITY.md) | Feature comparison vs FreeFileSync |
| [UI_DESIGN.md](UI_DESIGN.md) | Compare grid and chrome |

## Engine

| Doc | Contents |
|-----|----------|
| [ADS_SYNC.md](ADS_SYNC.md) | NTFS streams — compare, copy, filters |
| [COMPARE_AND_SYNC.md](COMPARE_AND_SYNC.md) | Variants, classify, sync actions |
| [PROJECT_FORMAT.md](PROJECT_FORMAT.md) | Job JSON and userData layout |

## App internals

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Main / renderer split |
| [IPC_CONTRACT.md](IPC_CONTRACT.md) | Typed preload API |
| [SECURITY.md](SECURITY.md) | Path validation and delete safety |
| [BUILD.md](BUILD.md) | Dev build and Windows installer |
| [TESTING.md](TESTING.md) | Automated and NTFS fixture tests |
| [BACKUPMIRROR_MIGRATION.md](BACKUPMIRROR_MIGRATION.md) | Legacy INI field mapping (not in the UI) |

## Also

| Doc | Location |
|-----|----------|
| README | [../README.md](../README.md) |
| Overview | [../PLAN.md](../PLAN.md) |
| Changelog | [../CHANGELOG.md](../CHANGELOG.md) |
| Licensing | [../LICENSING.md](../LICENSING.md) (**GPL-3.0-only**) |
| Trademark | [../TRADEMARK.md](../TRADEMARK.md) |
