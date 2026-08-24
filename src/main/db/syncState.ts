import { app } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { AdsManifest } from '@shared/ads/paths'
import type { SideRecord } from '@shared/schemas/compare'
import { ALL_DDL, SCHEMA_VERSION } from './schema'

const require = createRequire(import.meta.url)

export type FileStateSide = 'left' | 'right'

export type FileState = {
  pairId: string
  relPath: string
  side: FileStateSide
  size: number
  mtimeMs: number
  fileId: string | null
  primaryHash: string | null
  adsManifest: AdsManifest
  lastSyncGeneration: number
}

export type PairFileStates = Map<string, { left?: FileState; right?: FileState }>

export type SyncRunRecord = {
  id: string
  startedAt: number
  finishedAt: number | null
  generation: number
  actionsCounts: Record<string, number>
  error: string | null
}

export type SyncDb = {
  db: Database
  jobId: string
  dbPath: string
  generation: number
  close: () => Promise<void>
}

let sqlPromise: Promise<SqlJsStatic> | null = null

function syncJobsDir(): string {
  return path.join(app.getPath('userData'), 'sync-jobs')
}

function dbPathForJob(jobId: string): string {
  return path.join(syncJobsDir(), `${jobId}.db`)
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    sqlPromise = initSqlJs({
      locateFile: () => wasmPath,
    })
  }
  return sqlPromise
}

function manifestToJson(manifest: AdsManifest): string {
  return JSON.stringify(manifest)
}

function parseManifest(json: string): AdsManifest {
  try {
    const parsed: unknown = JSON.parse(json)
    if (Array.isArray(parsed)) return parsed as AdsManifest
  } catch {
    /* fall through */
  }
  return []
}

function rowToFileState(row: Record<string, unknown>): FileState {
  return {
    pairId: String(row['pair_id']),
    relPath: String(row['rel_path']),
    side: row['side'] === 'right' ? 'right' : 'left',
    size: Number(row['size']),
    mtimeMs: Number(row['mtime_ms']),
    fileId: row['file_id'] != null ? String(row['file_id']) : null,
    primaryHash: row['primary_hash'] != null ? String(row['primary_hash']) : null,
    adsManifest: parseManifest(String(row['ads_manifest_json'] ?? '[]')),
    lastSyncGeneration: Number(row['last_sync_generation'] ?? 0),
  }
}

function initSchema(db: Database): void {
  for (const ddl of ALL_DDL) {
    db.run(ddl)
  }
  db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)`, [
    String(SCHEMA_VERSION),
  ])
}

function readGeneration(db: Database): number {
  const result = db.exec(`SELECT value FROM meta WHERE key = 'current_generation'`)
  const value = result[0]?.values[0]?.[0]
  return value != null ? Number(value) : 0
}

function writeGeneration(db: Database, generation: number): void {
  db.run(`INSERT OR REPLACE INTO meta (key, value) VALUES ('current_generation', ?)`, [
    String(generation),
  ])
}

async function persistDb(db: Database, dbPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dbPath), { recursive: true })
  const data = db.export()
  await fs.writeFile(dbPath, Buffer.from(data))
}

export async function openDb(jobId: string): Promise<SyncDb> {
  const SQL = await getSql()
  const dbPath = dbPathForJob(jobId)
  await fs.mkdir(syncJobsDir(), { recursive: true })

  let db: Database
  try {
    const buf = await fs.readFile(dbPath)
    db = new SQL.Database(buf)
  } catch {
    db = new SQL.Database()
    initSchema(db)
    writeGeneration(db, 0)
    await persistDb(db, dbPath)
  }

  initSchema(db)
  const generation = readGeneration(db)

  return {
    db,
    jobId,
    dbPath,
    generation,
    close: async () => {
      await persistDb(db, dbPath)
      db.close()
    },
  }
}

export function upsertFileState(syncDb: SyncDb, state: FileState): void {
  syncDb.db.run(
    `INSERT INTO file_state (
      pair_id, rel_path, side, size, mtime_ms, file_id, primary_hash,
      ads_manifest_json, last_sync_generation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(pair_id, rel_path, side) DO UPDATE SET
      size = excluded.size,
      mtime_ms = excluded.mtime_ms,
      file_id = excluded.file_id,
      primary_hash = excluded.primary_hash,
      ads_manifest_json = excluded.ads_manifest_json,
      last_sync_generation = excluded.last_sync_generation`,
    [
      state.pairId,
      state.relPath,
      state.side,
      state.size,
      state.mtimeMs,
      state.fileId,
      state.primaryHash,
      manifestToJson(state.adsManifest),
      state.lastSyncGeneration,
    ],
  )
}

export function deleteFileState(
  syncDb: SyncDb,
  pairId: string,
  relPath: string,
  side: FileStateSide,
): void {
  syncDb.db.run(`DELETE FROM file_state WHERE pair_id = ? AND rel_path = ? AND side = ?`, [
    pairId,
    relPath,
    side,
  ])
}

export function getFileState(
  syncDb: SyncDb,
  pairId: string,
  relPath: string,
  side: FileStateSide,
): FileState | undefined {
  const stmt = syncDb.db.prepare(
    `SELECT pair_id, rel_path, side, size, mtime_ms, file_id, primary_hash,
            ads_manifest_json, last_sync_generation
     FROM file_state WHERE pair_id = ? AND rel_path = ? AND side = ?`,
  )
  stmt.bind([pairId, relPath, side])
  if (!stmt.step()) {
    stmt.free()
    return undefined
  }
  const row = stmt.getAsObject()
  stmt.free()
  return rowToFileState(row)
}

export function loadStatesForPair(syncDb: SyncDb, pairId: string): PairFileStates {
  const map: PairFileStates = new Map()
  const stmt = syncDb.db.prepare(
    `SELECT pair_id, rel_path, side, size, mtime_ms, file_id, primary_hash,
            ads_manifest_json, last_sync_generation
     FROM file_state WHERE pair_id = ?`,
  )
  stmt.bind([pairId])
  while (stmt.step()) {
    const state = rowToFileState(stmt.getAsObject())
    const entry = map.get(state.relPath) ?? {}
    if (state.side === 'left') entry.left = state
    else entry.right = state
    map.set(state.relPath, entry)
  }
  stmt.free()
  return map
}

export function recordRun(syncDb: SyncDb, run: SyncRunRecord): number {
  syncDb.db.run(
    `INSERT INTO sync_run (id, started_at, finished_at, generation, actions_counts_json, error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      run.id,
      run.startedAt,
      run.finishedAt,
      run.generation,
      JSON.stringify(run.actionsCounts),
      run.error,
    ],
  )
  writeGeneration(syncDb.db, run.generation)
  syncDb.generation = run.generation
  return run.generation
}

export function sideRecordToFileState(
  pairId: string,
  side: FileStateSide,
  record: SideRecord,
  generation: number,
): FileState {
  return {
    pairId,
    relPath: record.relPath,
    side,
    size: record.dataSize,
    mtimeMs: record.mtimeMs,
    fileId: null,
    primaryHash: null,
    adsManifest: record.adsManifest,
    lastSyncGeneration: generation,
  }
}

export async function persistSyncDb(syncDb: SyncDb): Promise<void> {
  await persistDb(syncDb.db, syncDb.dbPath)
}
