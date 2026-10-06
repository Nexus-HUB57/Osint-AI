import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DbAdapter, ExecuteResult } from './adapter';
import { toPositionalQuestion } from './adapter';
import { SQLITE_DDL, ensureColumnIfMissing } from './sql/sqlite';

export async function createSqliteAdapter(pathOrMemory: string): Promise<DbAdapter> {
  if (pathOrMemory !== ':memory:') mkdirSync(dirname(pathOrMemory), { recursive: true });

  const db = new Database(pathOrMemory);
  db.exec(SQLITE_DDL);
  ensureColumnIfMissing(db, 'sessions', 'refresh_chain_id', 'TEXT');

  // Serializa transações no processo para evitar BEGIN dentro de BEGIN.
  let txChain: Promise<unknown> = Promise.resolve();

  const base: Omit<DbAdapter, 'transaction' | 'close' | 'healthCheck'> = {
    dialect: 'sqlite',
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      return db.prepare(toPositionalQuestion(sql)).all(...(params as unknown[])) as T[];
    },
    async queryOne<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      return (db.prepare(toPositionalQuestion(sql)).get(...(params as unknown[])) ?? null) as T | null;
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<ExecuteResult> {
      const r = db.prepare(toPositionalQuestion(sql)).run(...(params as unknown[]));
      return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
    },
  };

  const adapter: DbAdapter = {
    ...base,
    async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
      const run = async (): Promise<T> => {
        db.exec('BEGIN IMMEDIATE');
        try {
          const r = await fn(adapter);
          db.exec('COMMIT');
          return r;
        } catch (e) {
          try { db.exec('ROLLBACK'); } catch { /* já rollbackado */ }
          throw e;
        }
      };
      const next = txChain.then(run, run);
      txChain = next.catch(() => undefined);
      return next;
    },
    async close() { db.close(); },
    async healthCheck() {
      const t0 = Date.now();
      db.prepare('SELECT 1').get();
      return { ok: true, latencyMs: Date.now() - t0 };
    },
  };

  return adapter;
}
