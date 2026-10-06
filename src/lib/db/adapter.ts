import 'server-only';

export interface ExecuteResult {
  changes:           number;
  lastInsertRowid?:  number | bigint;
}

export interface DbAdapter {
  readonly dialect: 'sqlite' | 'postgres' | 'libsql';
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  queryOne<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  execute(sql: string, params?: readonly unknown[]): Promise<ExecuteResult>;
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}

/** Traduz placeholders universais `$1, $2…` para `?` (SQLite). */
export function toPositionalQuestion(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}
