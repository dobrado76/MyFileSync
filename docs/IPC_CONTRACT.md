# IPC contract

Typed preload bridge. Renderer has **no Node integration**.

## Envelope

```typescript
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrCode; message: string; hint?: string } }

type ErrCode = 'validation' | 'not-found' | 'io' | 'busy' | 'not-allowed' | 'cancelled' | 'conflict'
```

## Channel naming

Prefix: `sync:` for engine, `job:` for jobs, `app:` for shell.

## API surface (v1 sketch)

### App

| Channel | Request | Response |
|---------|---------|----------|
| `app:ready` | — | `{ platform, version }` |
| `app:pickFolder` | `{ title? }` | `{ path: string \| null }` |
| `app:showItemInFolder` | `{ path }` | `{ ok }` |

### Jobs

| Channel | Request | Response |
|---------|---------|----------|
| `job:list` | — | `{ jobs: JobSummary[] }` |
| `job:get` | `{ id }` | `{ job: JobFile }` |
| `job:save` | `{ job }` | `{ id }` |
| `job:delete` | `{ id }` | `{ ok }` |
| `job:export` | `{ id, path }` | `{ path }` |
| `job:importJson` | `{ path }` | `{ id }` |
| `job:importIni` | `{ path }` | `{ id, warnings: string[] }` |

### Compare

| Channel | Request | Response |
|---------|---------|----------|
| `compare:run` | `{ jobId, pairIds? }` | `{ runId, rowCount, stats }` |
| `compare:getRows` | `{ runId, offset, limit, filter? }` | `{ rows: CompareRow[], total }` |
| `compare:cancel` | `{ runId }` | `{ ok }` |
| `compare:setRowIncluded` | `{ runId, rowId, included }` | `{ ok }` |

### Sync

| Channel | Request | Response |
|---------|---------|----------|
| `sync:run` | `{ jobId, runId?, rowIds? }` | `{ syncRunId }` |
| `sync:cancel` | `{ syncRunId }` | `{ ok }` |
| `sync:getProgress` | `{ syncRunId }` | `SyncProgress` |

### Settings

| Channel | Request | Response |
|---------|---------|----------|
| `settings:get` | — | `Settings` |
| `settings:set` | `Partial<Settings>` | `Settings` |
| `settings:export` | `{ path }` | `{ ok }` |
| `settings:import` | `{ path }` | `Settings` |

## Events (main → renderer)

Channel: `sync:event`

```typescript
type SyncEvent =
  | { type: 'compare:progress'; runId; done; total; currentPath? }
  | { type: 'compare:done'; runId; stats }
  | { type: 'sync:progress'; syncRunId; SyncProgress }
  | { type: 'sync:itemDone'; syncRunId; rowId; ok; error? }
  | { type: 'sync:done'; syncRunId; summary }
```

## Shared types location

```
src/shared/
  ipc/contract.ts    # Channel name constants
  ipc/api.ts         # MyFileSyncApi type
  schemas/job.ts     # Zod job schema
  schemas/compare.ts # CompareRow, SyncAction
  schemas/ipc.ts     # Per-channel request/response Zod
```

## Validation

- Main: `handle(channel, schema, fn)` pattern (same as MyFileExplorer).
- Invalid payload → `{ ok: false, error: { code: 'validation', … } }`.

## Security

- All paths in requests → `requireAbsolute` in main.
- Job import paths user-selected via dialog only.

## Phase 2 additions

- `batch:run` — CLI-equivalent unattended job
- `watch:start` / `watch:stop` — RealTimeSync companion

## Related

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [PROJECT_FORMAT.md](PROJECT_FORMAT.md)
