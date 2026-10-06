import 'server-only';

export const POSTGRES_DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  organization  TEXT NOT NULL,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  disabled_at   BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  subject          TEXT NOT NULL,
  issued_at        BIGINT NOT NULL,
  expires_at       BIGINT NOT NULL,
  revoked_at       BIGINT,
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
  issued_at   BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  consumed_at BIGINT,
  revoked_at  BIGINT,
  ip          TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_refresh_user    ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_chain   ON refresh_tokens(chain_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

CREATE TABLE IF NOT EXISTS audit_log (
  seq        BIGSERIAL PRIMARY KEY,
  id         TEXT NOT NULL UNIQUE,
  prev_hash  TEXT,
  hash       TEXT NOT NULL,
  event      TEXT NOT NULL,
  actor      TEXT,
  subject    TEXT,
  ip         TEXT,
  payload    TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_event   ON audit_log(event);
CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_log(subject);

CREATE OR REPLACE FUNCTION audit_log_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (no % allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();

CREATE TABLE IF NOT EXISTS worm_exports (
  id           TEXT PRIMARY KEY,
  seq_start    BIGINT NOT NULL,
  seq_end      BIGINT NOT NULL,
  count        INTEGER NOT NULL,
  s3_key       TEXT NOT NULL UNIQUE,
  sha256       TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  retain_until BIGINT NOT NULL,
  created_at   BIGINT NOT NULL
);

CREATE OR REPLACE FUNCTION worm_exports_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'worm_exports is append-only (no % allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS worm_exports_no_update ON worm_exports;
CREATE TRIGGER worm_exports_no_update
BEFORE UPDATE OR DELETE ON worm_exports
FOR EACH ROW EXECUTE FUNCTION worm_exports_block_mutation();

CREATE TABLE IF NOT EXISTS worm_export_state (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  last_seq   BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
);
INSERT INTO worm_export_state (id, last_seq, updated_at) VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
