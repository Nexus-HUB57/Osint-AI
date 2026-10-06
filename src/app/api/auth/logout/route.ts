import { NextResponse } from 'next/server';
import { clientIp, enforce } from '@/lib/ratelimit';
import {
  readSessionCookie, readRefreshCookie,
  clearSessionCookie, clearRefreshCookie,
} from '@/lib/auth/session-cookie';
import { revokeSession } from '@/lib/auth/service';
import { revokeRefreshToken } from '@/lib/auth/refresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);

  const rl = await enforce('logout', [ip]);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const access  = readSessionCookie(req);
  const refresh = readRefreshCookie(req);

  if (access) {
    try { await revokeSession(access, ip); }
    catch (e) { console.warn('[auth/logout] revokeSession falhou:', (e as Error).message); }
  }

  if (refresh) {
    try { await revokeRefreshToken(refresh, ip); }
    catch (e) { console.warn('[auth/logout] revokeRefresh falhou:', (e as Error).message); }
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearSessionCookie(res);
  clearRefreshCookie(res);
  return res;
}
