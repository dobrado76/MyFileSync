# Architecture

## Process model

```mermaid
flowchart TB
  subgraph renderer [Renderer React]
    UI[Compare grid Jobs Settings]
    Store[Zustand store]
  end
  subgraph preload [Preload]
    Bridge[Typed IPC bridge]
  end
  subgraph main [Electron main]
    Jobs[jobs/]
    Compare[compare/]
    Sync[sync/]
    ADS[ads/]
    Win32[win32/]
    DB[(SQLite userData)]
  end
  UI --> Store --> Bridge --> main
  Compare --> DB
  Sync --> ADS
  Sync --> Win32
```

| Process | Responsibility |
|---------|----------------|
| **Main** | All filesystem I/O, Win32 ADS, compare/sync engine, SQLite, job load/save |
| **Preload** | Expose typed `MyFileSyncApi`; no Node in renderer |
| **Renderer** | React UI, Zustand state, no direct `fs` |

## Main modules (planned)

```
src/main/
  index.ts              # App bootstrap, window, IPC register
  ipc/register.ts       # Zod-validated handlers
  jobs/
    store.ts            # Load/save job JSON
    importIni.ts        # BackupMirror INI → JSON
  compare/
    walk.ts             # Parallel directory traversal
    classify.ts         # Diff categories + ADS manifest diff
    plan.ts             # Action list builder
  sync/
    execute.ts          # Worker pool, progress, cancel
    copy.ts             # CopyFileEx + copyStreams fallback
    delete.ts           # Recycle Bin / permanent
    vss.ts              # Optional snapshot path (Phase 1.5)
    hardlink.ts         # Multi-root hard links (Phase 1.5)
  ads/
    list.ts             # BackupRead enumeration
    readWrite.ts        # Stream path I/O
    copyStreams.ts      # Alternate-only replication
    paths.ts            # buildStreamPath, validate name
  db/
    schema.ts           # Migrations
    syncState.ts        # Per-job change DB (Phase 2)
  win32/
    volume.ts           # pathIsNtfs, drive type, file IDs
    attrs.ts            # Read-only detection, ACL hints
  security/
    paths.ts            # requireAbsolute, normalize
```

```
src/shared/
  schemas/              # Zod: job, compare result, IPC
  ipc/                  # Contract + api types
  compare/              # Pure diff/rollup helpers (unit-tested)
  result.ts             # Result envelope

src/renderer/
  App.tsx
  components/           # CompareGrid, JobEditor, LogPanel
  store/                # Zustand
```

## Data flow: Compare → Sync

1. Renderer calls `compare.run({ jobId })`.
2. Main loads job JSON, probes volumes (`pathIsNtfs`, file ID support).
3. Parallel walk produces `FileRecord[]` per side with `$DATA` stats + ADS manifest.
4. `classify` merges into `CompareRow[]` with proposed `SyncAction`.
5. Renderer displays rows; user toggles includes.
6. Renderer calls `sync.run({ jobId, rowIds? })`.
7. Main executes actions via worker pool; reports progress events on `mfe-event` channel (or `sync:*` events).
8. Optional: update SQLite sync state (Phase 2).

## ADS integration point

All NTFS fidelity flows through `ads/` + `sync/copy.ts`:

- **Never** use Node `createReadStream`→`createWriteStream` alone for NTFS→NTFS file replication (drops ADS on large files — lesson from MyFileExplorer).
- Prefer **`CopyFileEx`** / **`CopyFileW`** for whole-file copy including alternates.
- Fallback: copy `$DATA` then `copyStreams`.

See [ADS_SYNC.md](ADS_SYNC.md).

## SQLite

| Database | Path | Phase |
|----------|------|-------|
| Sync state | `userData/sync-jobs/{jobId}.db` | 2 |
| Compare cache (optional) | Same DB or separate | 1.5 |

Schema details: [COMPARE_AND_SYNC.md](COMPARE_AND_SYNC.md), [PROJECT_FORMAT.md](PROJECT_FORMAT.md).

## IPC pattern

Same envelope as MyFileExplorer (conceptually reimplemented):

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; hint?: string } }
```

Full channel list: [IPC_CONTRACT.md](IPC_CONTRACT.md).

## Testing strategy

| Layer | Tests |
|-------|-------|
| `shared/compare/*` | Vitest pure functions |
| `ads/paths.ts` | Vitest without Win32 |
| Integration | Manual NTFS fixture folder; optional CI on Windows runner |
| INI import | Fixture INI files |

## Independence

No imports from `MyFileExplorer`. Reimplement ADS Win32 layer fresh (koffi + BackupRead parity with Trinet.Core.IO.Ntfs / MyFileExplorer `adsWin32.ts` behavior).
