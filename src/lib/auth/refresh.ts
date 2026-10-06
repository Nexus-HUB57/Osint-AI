import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client';
import type { DbAdapter } from '../db/adapter';
import { generateSessionToken, hashSessionToken } from '../crypto/session';
import { appendAudit } from '../audit/chain';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export class RefreshReuseError   extends Error { readonly code = 'refresh_reuse';   constructor(public readonly chainId: string) { super('refresh token reuse detected'); } }
export class RefreshExpiredError extends Error { readonly code = 'refresh_expired'; }
export class RefreshInvalidError extends Error { readonly code = 'refresh_invalid'; }

interface RefreshRow {
  id:          string;
  user_id:     string;
  token_hash:  string;
  chain_id:    string;
  parent_id:   string | null;
  issued_at:   number;
  expires_at:  number;
  consumed_at: number | null;
  revoked_at:  number | null;
}

export interface IssuedRefresh {
  token:     string;
  expiresAt: number;
  chainId:   string;
  id:        string;
}

export interface IssueRefreshInput {
  userId:    string;
  ip:        string | null;
  userAgent: string | null;
  chainId?:  string;
  parentId?: string | null;
}

export async function issueRefreshToken(
  input: IssueRefreshInput,
  tx?: DbAdapter,
): Promise<IssuedRefresh> {
  const db = tx ?? (await getDb());
  const raw       = generateSessionToken();
  const tokenHash = hashSessionToken(raw);
  const id        = randomUUID();
  const chainId   = input.chainId ?? id;
  const issuedAt  = Date.now();
  const expiresAt = issuedAt + REFRESH_TTL_MS;

  await db.execute(
    `INSERT INTO refresh_tokens
       (id, user_id, token_hash, chain_id, parent_id, issued_at, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, input.userId, tokenHash, chainId, input.parentId ?? null,
     issuedAt, expiresAt, input.ip, input.userAgent],
  );

  return { token: raw, expiresAt, chainId, id };
}

export interface RotatedRefresh {
  userId:     string;
  newRefresh: IssuedRefresh;
  chainId:    string;
}

export async function rotateRefreshToken(
  presentedRaw: string,
  ip: string | null,
  userAgent: string | null,
): Promise<RotatedRefresh> {
  const db = await getDb();
  const hash = hashSessionToken(presentedRaw);
  const now = Date.now();

  return db.transaction(async (tx) => {
    const row = await tx.queryOne<RefreshRow>(
      `SELECT id, user_id, token_hash, chain_id, parent_id,
              issued_at, expires_at, consumed_at, revoked_at
       FROM refresh_tokens WHERE token_hash = $1`,
      [hash],
    );

    if (!row) throw new RefreshInvalidError();
    if (row.revoked_at !== null) throw new RefreshInvalidError();
    if (row.expires_at <= now) throw new RefreshExpiredError();

    // ─── Reuse detection: token consumido sendo reapresentado ───
    if (row.consumed_at !== null) {
      await tx.execute(
        `UPDATE refresh_tokens SET revoked_at = $1
         WHERE chain_id = $2 AND revoked_at IS NULL`,
        [now, row.chain_id],
      );
      await appendAudit({
        event: 'session.refresh_reuse_detected',
        actor: row.user_id, subject: `user:${row.user_id}`, ip,
        payload: { chainId: row.chain_id, offendingTokenId: row.id },
      }, tx);
      throw new RefreshReuseError(row.chain_id);
    }

    const consumed = await tx.execute(
      `UPDATE refresh_tokens SET consumed_at = $1
       WHERE id = $2 AND consumed_at IS NULL`,
      [now, row.id],
    );

    if (consumed.changes !== 1) {
      // Corrida perdida: outra requisição consumiu primeiro → reuse
      await tx.execute(
        `UPDATE refresh_tokens SET revoked_at = $1
         WHERE chain_id = $2 AND revoked_at IS NULL`,
        [now, row.chain_id],
      );
      throw new RefreshReuseError(row.chain_id);
    }

    const newRefresh = await issueRefreshToken({
      userId:    row.user_id,
      ip, userAgent,
      chainId:   row.chain_id,
      parentId:  row.id,
    }, tx);

    await appendAudit({
      event: 'session.refreshed',
      actor: row.user_id, subject: `user:${row.user_id}`, ip,
      payload: { chainId: row.chain_id, parent: row.id, child: newRefresh.id },
    }, tx);

    return { userId: row.user_id, newRefresh, chainId: row.chain_id };
  });
}

export async function revokeRefreshChain(
  chainId: string,
  ip: string | null,
  tx?: DbAdapter,
): Promise<number> {
  const db = tx ?? (await getDb());
  const res = await db.execute(
    `UPDATE refresh_tokens SET revoked_at = $1
     WHERE chain_id = $2 AND revoked_at IS NULL`,
    [Date.now(), chainId],
  );
  if (res.changes > 0) {
    await appendAudit({
      event: 'session.revoked',
      actor: null, subject: null, ip,
      payload: { chainId, count: res.changes, reason: 'chain_revoked' },
    }, tx);
  }
  return res.changes;
}

export async function revokeRefreshToken(
  presentedRaw: string,
  ip: string | null,
): Promise<boolean> {
  const db = await getDb();
  const hash = hashSessionToken(presentedRaw);

  return db.transaction(async (tx) => {
    const row = await tx.queryOne<{ chain_id: string; revoked_at: number | null }>(
      `SELECT chain_id, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
      [hash],
    );
    if (!row) return false;
    if (row.revoked_at !== null) return true;

    const res = await tx.execute(
      `UPDATE refresh_tokens SET revoked_at = $1
       WHERE chain_id = $2 AND revoked_at IS NULL`,
      [Date.now(), row.chain_id],
    );
    await appendAudit({
      event: 'session.revoked',
      actor: null, subject: null, ip,
      payload: { chainId: row.chain_id, count: res.changes, reason: 'logout' },
    }, tx);
    return res.changes > 0;
  });
}
