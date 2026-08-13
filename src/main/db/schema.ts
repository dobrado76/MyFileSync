/** SQLite DDL for per-job sync state (Phase 2). See docs/COMPARE_AND_SYNC.md */

export const SCHEMA_VERSION = 1

export const CREATE_FILE_STATE = `
CREATE TABLE IF NOT EXISTS file_state (
  pair_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  size INTEGER NOT NULL,
  mtime_ms INTEGER NOT NULL,
  file_id TEXT,
  primary_hash TEXT,
  ads_manifest_json TEXT NOT NULL DEFAULT '[]',
  last_sync_generation INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pair_id, rel_path, side)
);
`

export const CREATE_SYNC_RUN = `
CREATE TABLE IF NOT EXISTS sync_run (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  generation INTEGER NOT NULL,
  actions_counts_json TEXT NOT NULL DEFAULT '{}',
  error TEXT
);
`

export const CREATE_FILE_STATE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_file_state_pair ON file_state (pair_id);
`

export const CREATE_META = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

export const ALL_DDL = [
  CREATE_META,
  CREATE_FILE_STATE,
  CREATE_SYNC_RUN,
  CREATE_FILE_STATE_INDEX,
] as const
