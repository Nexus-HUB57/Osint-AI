import 'server-only';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db/client';
import type { DbAdapter } from '../db/adapter';
import { hashPassword, verifyPassword, dummyVerify } from '../crypto/password';
import { generateSessionToken, hashSessionToken } from '../crypto/session';
import { appendAudit } from '../audit/chain';
import { issueRefreshToken, revokeRefreshChain, type IssuedRefresh } from './refresh';
import type { PublicUser } from '../contracts/schemas';
import type { Permission, VoidSessionToken } from '../contracts/types';

const ACCESS_TTL_S = 60 * 60 * 24 * 7; // 7 dias

const DEFAULT_PERMISSIONS: readonly Permission[] = [
  'aimap:read', 'aimap:route', 'agent:execute', 'osint:query',
];

interface UserRow {
  id:            string;
  email:         string;
  password_hash: string;
  first_name:    string;
  last_name:     string;
  organization:  string;
  created_at:    number;
  disabled_at:   number | null;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id, email: row.email,
    firstName: row.first_name, lastName: row.last_name,
    organization: row.organization, createdAt: row.created_at,
  };
}

export interface SessionPair {
  access:  { token: string; expiresAt: number; tokenVoid: VoidSessionToken };
  refresh: IssuedRefresh;
  user:    PublicUser;
}

export class DuplicateEmailError extends Error {
  readonly code = 'duplicate_email';
  constructor(public readonly email: string) { super('email já cadastrado'); this.name = 'DuplicateEmailError'; }
}
export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials';
  constructor() { super('credenciais inválidas'); this.name = 'InvalidCredentialsError'; }
}

/* ─── Emissão do par access+refresh (atômica) ─── */
export async function issueSessionPair(
  user: UserRow,
  ip: string | null,
  userAgent: string | null,
  tx?: DbAdapter,
  opts?: { reuseChainId?: string },
): Promise<SessionPair> {
  const exec = async (adapter: DbAdapter): Promise<SessionPair> => {
    const subject  = `user:${user.id}`;
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ACCESS_TTL_S * 1000;

    // 1) refresh primeiro — fornece chain_id
    const refresh = opts?.reuseChainId
      ? await (async () => {
          const { issueRefreshToken: _issue } = await import('./refresh');
          return _issue({
            userId: user.id, ip, userAgent,
            chainId: opts.reuseChainId,
          }, adapter);
        })()
      : await issueRefreshToken({ userId: user.id, ip, userAgent }, adapter);

    // 2) access vinculado à chain
    const raw = generateSessionToken();
    const tokenHash = hashSessionToken(raw);

    await adapter.execute(
      `INSERT INTO sessions
         (id, user_id, token_hash, subject, issued_at, expires_at, ip, user_agent, refresh_chain_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), user.id, tokenHash, subject, issuedAt, expiresAt, ip, userAgent, refresh.chainId],
    );

    await appendAudit({
      event: 'session.issued',
      actor: user.id, subject, ip,
      payload: { expiresAt, userAgent, chainId: refresh.chainId },
    }, adapter);

    const tokenVoid: VoidSessionToken = {
      accessToken: `va_live_${raw}`,
      expiresIn:   ACCESS_TTL_S,
      issuedAt,
      permissions: DEFAULT_PERMISSIONS,
      subject,
    };

    return {
      access: { token: raw, expiresAt, tokenVoid },
      refresh,
      user: toPublicUser(user),
    };
  };

  if (tx) return exec(tx);
  const db = await getDb();
  return db.transaction(exec);
}

/* ─── Registro ─── */
export interface RegisterInput {
  firstName: string; lastName: string; email: string;
  organization: string; password: string; ip: string | null;
}

export async function register(input: RegisterInput): Promise<SessionPair> {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();

  return db.transaction(async (tx) => {
    const existing = await tx.queryOne<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`, [email],
    );
    if (existing) {
      await appendAudit({
        event: 'user.registered', actor: null, subject: `email:${email}`,
        ip: input.ip, payload: { outcome: 'duplicate' },
      }, tx);
      throw new DuplicateEmailError(email);
    }

    const passwordHash = await hashPassword(input.password);
    const now = Date.now();
    const user: UserRow = {
      id: randomUUID(), email, password_hash: passwordHash,
      first_name: input.firstName.trim(), last_name: input.lastName.trim(),
      organization: input.organization.trim(),
      created_at: now, disabled_at: null,
    };

    await tx.execute(
      `INSERT INTO users
         (id, email, password_hash, first_name, last_name, organization, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, user.email, user.password_hash, user.first_name, user.last_name,
       user.organization, user.created_at, user.created_at],
    );

    await appendAudit({
      event: 'user.registered', actor: user.id, subject: `user:${user.id}`,
      ip: input.ip, payload: { email: user.email, organization: user.organization },
    }, tx);

    return issueSessionPair(user, input.ip, null, tx);
  });
}

/* ─── Login ─── */
export interface LoginInput {
  email: string; password: string; ip: string | null; userAgent: string | null;
}

export async function login(input: LoginInput): Promise<SessionPair> {
  const db = await getDb();
  const email = input.email.trim().toLowerCase();

  const row = await db.queryOne<UserRow>(
    `SELECT id, email, password_hash, first_name, last_name,
            organization, created_at, disabled_at
     FROM users WHERE email = $1`,
    [email],
  );

  if (!row || row.disabled_at !== null) {
    await dummyVerify();
    await appendAudit({
      event: 'user.login_failed', actor: null, subject: `email:${email}`,
      ip: input.ip, payload: { reason: 'user_not_found' },
    });
    throw new InvalidCredentialsError();
  }

  const ok = await verifyPassword(input.password, row.password_hash);
  if (!ok) {
    await appendAudit({
      event: 'user.login_failed', actor: null, subject: `user:${row.id}`,
      ip: input.ip, payload: { reason: 'bad_password' },
    });
    throw new InvalidCredentialsError();
  }

  await appendAudit({
    event: 'user.login', actor: row.id, subject: `user:${row.id}`,
    ip: input.ip, payload: { email: row.email },
  });

  return issueSessionPair(row, input.ip, input.userAgent);
}

/* ─── Rotação completa: refresh + novo access na mesma chain ─── */
export async function rotateSession(
  rawRefresh: string,
  ip: string | null,
  userAgent: string | null,
): Promise<SessionPair> {
  const { rotateRefreshToken } = await import('./refresh');

  const rotated = await rotateRefreshToken(rawRefresh, ip, userAgent);

  const db = await getDb();
  const user = await db.queryOne<UserRow>(
    `SELECT id, email, password_hash, first_name, last_name,
            organization, created_at, disabled_at
     FROM users WHERE id = $1 AND disabled_at IS NULL`,
    [rotated.userId],
  );
  if (!user) {
    await revokeRefreshChain(rotated.chainId, ip);
    throw new InvalidCredentialsError();
  }

  // Emite só o access vinculado à chain existente (o refresh já foi emitido
  // dentro de rotateRefreshToken).
  const subject  = `user:${user.id}`;
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ACCESS_TTL_S * 1000;
  const rawAccess = generateSessionToken();
  const tokenHash = hashSessionToken(rawAccess);

  await db.execute(
    `INSERT INTO sessions
       (id, user_id, token_hash, subject, issued_at, expires_at, ip, user_agent, refresh_chain_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), user.id, tokenHash, subject, issuedAt, expiresAt, ip, userAgent, rotated.chainId],
  );

  const tokenVoid: VoidSessionToken = {
    accessToken: `va_live_${rawAccess}`,
    expiresIn:   ACCESS_TTL_S,
    issuedAt,
    permissions: DEFAULT_PERMISSIONS,
    subject,
  };

  return {
    access:  { token: rawAccess, expiresAt, tokenVoid },
    refresh: rotated.newRefresh,
    user:    toPublicUser(user),
  };
}

/* ─── Leitura ─── */
export interface SessionContext {
  user: PublicUser;
  subject: string;
  expiresAt: number;
  refreshChainId: string | null;
}

export async function getSessionByToken(rawToken: string): Promise<SessionContext | null> {
  const db = await getDb();
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  const row = await db.queryOne<UserRow & {
    expires_at: number; subject: string; refresh_chain_id: string | null;
  }>(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
            u.organization, u.created_at, u.disabled_at,
            s.expires_at, s.subject, s.refresh_chain_id
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > $2
       AND u.disabled_at IS NULL`,
    [tokenHash, now],
  );

  if (!row) return null;
  return {
    user: toPublicUser(row),
    subject: row.subject,
    expiresAt: row.expires_at,
    refreshChainId: row.refresh_chain_id,
  };
}

/* ─── Revogação ─── */
export async function revokeSession(rawToken: string, ip: string | null): Promise<boolean> {
  const db = await getDb();
  const tokenHash = hashSessionToken(rawToken);
  const now = Date.now();

  return db.transaction(async (tx) => {
    const row = await tx.queryOne<{ id: string; refresh_chain_id: string | null; user_id: string }>(
      `SELECT id, refresh_chain_id, user_id FROM sessions
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
    if (!row) return false;

    await tx.execute(`UPDATE sessions SET revoked_at = $1 WHERE id = $2`, [now, row.id]);

    if (row.refresh_chain_id) {
      await revokeRefreshChain(row.refresh_chain_id, ip, tx);
    }

    await appendAudit({
      event: 'user.logout', actor: row.user_id, subject: `user:${row.user_id}`,
      ip, payload: { sessionId: row.id, chainId: row.refresh_chain_id },
    }, tx);

    return true;
  });
}
🚦 Rate limiting
