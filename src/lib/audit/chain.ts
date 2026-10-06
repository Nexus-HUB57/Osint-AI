import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client';
import type { DbAdapter } from '../db/adapter';
import { canonicalJSON, computeEntryHash, GENESIS_HASH } from '../crypto/hash-chain';
import type { AuditEvent } from '../contracts/schemas';

export interface AppendInput {
  event:    AuditEvent;
  actor?:   string | null;
  subject?: string | null;
  ip?:      string | null;
  payload?: Record<string, unknown>;
}

export interface ChainRecord {
  seq:       number;
  id:        string;
  prevHash:  string | null;
  hash:      string;
  event:     string;
  actor:     string | null;
  subject:   string | null;
  ip:        string | null;
  payload:   string;
  createdAt: number;
}

/**
 * Append-only encadeado por SHA-256.
 * - `tx` opcional: passa o adapter transacional quando chamado dentro de
 *   outra `db.transaction()` — evita BEGIN aninhado.
 * - Postgres: usa pg_advisory_xact_lock para serializar o append.
 * - Trigger nativo (SQLite/PG) rejeita UPDATE/DELETE.
 */
export async function appendAudit(
  input: AppendInput,
  tx?: DbAdapter,
): Promise<ChainRecord> {
  const exec = async (adapter: DbAdapter): Promise<ChainRecord> => {
    if (adapter.dialect === 'postgres') {
      // Serializa appends concorrentes sem SERIALIZABLE.
      await adapter.execute(`SELECT pg_advisory_xact_lock(hashtext('audit_log_chain'))`);
    }

    const last = await adapter.queryOne<{ hash: string; seq: number }>(
      `SELECT hash, seq FROM audit_log ORDER BY seq DESC LIMIT 1`,
    );

    const prevHash  = last?.hash ?? GENESIS_HASH;
    const nextSeq   = (last?.seq ?? 0) + 1;
    const id        = randomUUID();
    const createdAt = Date.now();
    const payload   = canonicalJSON(input.payload ?? {});

    const hash = computeEntryHash({
      seq: nextSeq, id, prevHash,
      event:   input.event,
      actor:   input.actor ?? null,
      subject: input.subject ?? null,
      ip:      input.ip ?? null,
      payload, createdAt,
    });

    await adapter.execute(
      `INSERT INTO audit_log
         (seq, id, prev_hash, hash, event, actor, subject, ip, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [nextSeq, id, prevHash, hash, input.event,
       input.actor ?? null, input.subject ?? null, input.ip ?? null,
       payload, createdAt],
    );

    return {
      seq: nextSeq, id, prevHash, hash,
      event: input.event,
      actor: input.actor ?? null,
      subject: input.subject ?? null,
      ip: input.ip ?? null,
      payload, createdAt,
    };
  };

  if (tx) return exec(tx);
  const db = await getDb();
  return db.transaction(exec);
}

export interface VerifyReport {
  ok:        boolean;
  length:    number;
  brokenAt?: number;
  reason?:   'prev_hash_mismatch' | 'hash_mismatch';
}

export async function verifyAuditChain(tx?: DbAdapter): Promise<VerifyReport> {
  const db = tx ?? (await getDb());
  const rows = await db.query<ChainRecord>(
    `SELECT seq, id,
            prev_hash  AS prevHash,
            hash, event, actor, subject, ip, payload,
            created_at AS createdAt
     FROM audit_log
     ORDER BY seq ASC`,
  );

  let prev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prevHash !== prev) {
      return { ok: false, length: rows.length, brokenAt: row.seq, reason: 'prev_hash_mismatch' };
    }
    const expected = computeEntryHash({
      seq: row.seq, id: row.id, prevHash: row.prevHash,
      event: row.event, actor: row.actor, subject: row.subject,
      ip: row.ip, payload: row.payload, createdAt: row.createdAt,
    });
    if (expected !== row.hash) {
      return { ok: false, length: rows.length, brokenAt: row.seq, reason: 'hash_mismatch' };
    }
    prev = row.hash;
  }

  return { ok: true, length: rows.length };
}
