import 'server-only';
import { createClient, type Client } from '@libsql/client';
import type { DbAdapter, ExecuteResult } from './adapter';
import { SQLITE_DDL } from './sql/sqlite';

export async function createLibsqlAdapter(url: string): Promise<DbAdapter> {
  const client: Client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  // Executa DDL statement por statement (tolerante a "already exists").
  const statements = SQLITE_DDL
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const sql of statements) {
    try {
      await client.execute(sql);
    } catch (e) {
      const msg = (e as Error).message;
      if (!/already exists|duplicate/i.test(msg)) throw e;
    }
  }

  // Migração suave para coluna adicionada em v2.
  try {
    const info = await client.execute(`PRAGMA table_info(sessions)`);
    const cols = info.rows.map((r) => String((r as Record<string, unknown>)['name']));
    if (!cols.includes('refresh_chain_id')) {
      await client.execute(`ALTER TABLE sessions ADD COLUMN refresh_chain_id TEXT`);
    }
  } catch { /* PRAGMA pode não existir em libsql remoto — ignorar */ }

  const base: Omit<DbAdapter, 'transaction' | 'close' | 'healthCheck'> = {
    dialect: 'libsql',
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const res = await client.execute({ sql, args: params as never[] });
      return res.rows as unknown as T[];
    },
    async queryOne<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      const res = await client.execute({ sql, args: params as never[] });
      return (res.rows[0] ?? null) as unknown as T | null;
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<ExecuteResult> {
      const res = await client.execute({ sql, args: params as never[] });
      return { changes: res.rowsAffected };
    },
  };

  const adapter: DbAdapter = {
    ...base,
    async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
      const tx = await client.transaction('write');
      const txAdapter: DbAdapter = {
        dialect: 'libsql',
        async query<R>(sql: string, params: readonly unknown[] = []) {
          const r = await tx.execute({ sql, args: params as never[] });
          return r.rows as unknown as R[];
        },
        async queryOne<R>(sql: string, params: readonly unknown[] = []) {
          const r = await tx.execute({ sql, args: params as never[] });
          return (r.rows[0] ?? null) as unknown as R | null;
        },
        async execute(sql: string, params: readonly unknown[] = []) {
          const r = await tx.execute({ sql, args: params as never[] });
          return { changes: r.rowsAffected };
        },
        async transaction<TN>(inner: (t: DbAdapter) => Promise<TN>) { return inner(txAdapter); },
        async close() {},
        async healthCheck() { return { ok: true, latencyMs: 0 }; },
      };
      try {
        const result = await fn(txAdapter);
        await tx.commit();
        return result;
      } catch (e) {
        try { await tx.rollback(); } catch { /* noop */ }
        throw e;
      }
    },
    async close() { client.close(); },
    async healthCheck() {
      const t0 = Date.now();
      await client.execute('SELECT 1');
      return { ok: true, latencyMs: Date.now() - t0 };
    },
  };

  return adapter;
}
