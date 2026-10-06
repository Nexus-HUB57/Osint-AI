import 'server-only';
import type { DbAdapter } from './adapter';
import { createSqliteAdapter }   from './sqlite';
import { createPostgresAdapter } from './postgres';
import { createLibsqlAdapter }   from './libsql';

let _db: DbAdapter | null = null;
let _init: Promise<DbAdapter> | null = null;

type Detected = { kind: 'sqlite'; path: string } | { kind: 'postgres'; url: string } | { kind: 'libsql'; url: string };

function detect(): Detected {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) {
    if (raw.startsWith('postgres://') || raw.startsWith('postgresql://')) {
      return { kind: 'postgres', url: raw };
    }
    if (raw.startsWith('libsql://') || raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('file:')) {
      return { kind: 'libsql', url: raw };
    }
    if (raw.startsWith('sqlite:')) {
      const rest = raw.slice('sqlite:'.length);
      return { kind: 'sqlite', path: rest === ':memory:' ? ':memory:' : rest };
    }
  }
  return {
    kind: 'sqlite',
    path: process.env.DATABASE_PATH ?? './.data/osint-fusion.db',
  };
}

export async function getDb(): Promise<DbAdapter> {
  if (_db) return _db;
  if (_init) return _init;

  _init = (async () => {
    const d = detect();
    switch (d.kind) {
      case 'postgres': return createPostgresAdapter(d.url);
      case 'libsql':   return createLibsqlAdapter(d.url);
      case 'sqlite':   return createSqliteAdapter(d.path);
    }
  })();

  _db = await _init;
  return _db;
}

export async function closeDbForTests(): Promise<void> {
  const db = _db;
  _db = null;
  _init = null;
  if (db) await db.close();
}
🔒 Audit trail + WORM
