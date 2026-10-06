import 'server-only';
import type Database from 'better-sqlite3';

export const SQLITE_DDL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  organization  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  disabled_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  subject          TEXT NOT NULL,
  issued_at        INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  revoked_at       INTEGER,
  ip               TEXT,
  user_agent       TEXT,
  refresh_chain_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_chain   ON sessions(refresh_chain_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  chain_id    TEXT NOT NULL,
  parent_id   TEXT,
  issued_at   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER,
  revoked_at  INTEGER,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_chain   ON refresh_tokens(chain_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL UNIQUE,
  prev_hash  TEXT,
  hash       TEXT NOT NULL,
  event      TEXT NOT NULL,
  actor      TEXT,
  subject    TEXT,
  ip         TEXT,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_event   ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only (no UPDATE)'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only (no DELETE)'); END;

CREATE TABLE IF NOT EXISTS worm_exports (
  id           TEXT PRIMARY KEY,
  seq_start    INTEGER NOT NULL,
  seq_end      INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  s3_key       TEXT NOT NULL UNIQUE,
  sha256       TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  retain_until INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS worm_exports_no_update
BEFORE UPDATE ON worm_exports
BEGIN SELECT RAISE(ABORT, 'worm_exports is append-only (no UPDATE)'); END;

CREATE TRIGGER IF NOT EXISTS worm_exports_no_delete
BEFORE DELETE ON worm_exports
BEGIN SELECT RAISE(ABORT, 'worm_exports is append-only (no DELETE)'); END;

CREATE TABLE IF NOT EXISTS worm_export_state (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO worm_export_state (id, last_seq, updated_at) VALUES (1, 0, 0);

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function ensureColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some((r) => r.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
