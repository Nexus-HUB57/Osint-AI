import 'server-only';
import { Pool, type PoolClient } from 'pg';
import type { DbAdapter, ExecuteResult } from './adapter';
import { POSTGRES_DDL } from './sql/postgres';

export async function createPostgresAdapter(connectionString: string): Promise<DbAdapter> {
  const pool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  await pool.query(POSTGRES_DDL);

  type Runner = Pool | PoolClient;

  const makeRunner = (r: Runner): Omit<DbAdapter, 'transaction' | 'close' | 'healthCheck'> => ({
    dialect: 'postgres',
    async query<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
      const res = await r.query(sql, params as unknown[]);
      return res.rows as T[];
    },
    async queryOne<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
      const res = await r.query(sql, params as unknown[]);
      return (res.rows[0] ?? null) as T | null;
    },
    async execute(sql: string, params: readonly unknown[] = []): Promise<ExecuteResult> {
      const res = await r.query(sql, params as unknown[]);
      return { changes: res.rowCount ?? 0 };
    },
  });

  const adapter: DbAdapter = {
    ...makeRunner(pool),
    async transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const txAdapter: DbAdapter = {
          ...makeRunner(client),
          async transaction<TN>(inner: (t: DbAdapter) => Promise<TN>) {
            // Transação aninhada: reusa a mesma conexão.
            return inner(txAdapter);
          },
          async close() { /* delegado ao pool */ },
          async healthCheck() { return { ok: true, latencyMs: 0 }; },
        };
        const result = await fn(txAdapter);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
    async healthCheck() {
      const t0 = Date.now();
      await pool.query('SELECT 1');
      return { ok: true, latencyMs: Date.now() - t0 };
    },
  };

  return adapter;
}
