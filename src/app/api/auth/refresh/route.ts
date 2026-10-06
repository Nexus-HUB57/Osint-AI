import { NextResponse } from 'next/server';
import { enforce, clientIp } from '@/lib/ratelimit';
import { appendAudit } from '@/lib/audit/chain';
import {
  RefreshReuseError, RefreshExpiredError, RefreshInvalidError,
} from '@/lib/auth/refresh';
import { rotateSession } from '@/lib/auth/service';
import {
  readRefreshCookie, setSessionCookie, setRefreshCookie,
  clearSessionCookie, clearRefreshCookie,
} from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);

  const rl = await enforce('login', [ip, 'refresh']);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const rawRefresh = readRefreshCookie(req);
  if (!rawRefresh) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  try {
    const pair = await rotateSession(rawRefresh, ip, req.headers.get('user-agent'));

    const res = NextResponse.json(
      { user: pair.user, token: pair.access.tokenVoid },
      { status: 200 },
    );
    setSessionCookie(res, pair.access.token, pair.access.expiresAt);
    setRefreshCookie(res, pair.refresh.token, pair.refresh.expiresAt);
    return res;
  } catch (e) {
    const res = NextResponse.json(
      {
        error: e instanceof RefreshReuseError   ? 'refresh_reuse_detected'
             : e instanceof RefreshExpiredError ? 'refresh_expired'
             : 'invalid_refresh',
      },
      { status: 401 },
    );
    clearSessionCookie(res);
    clearRefreshCookie(res);

    if (e instanceof RefreshReuseError) {
      await appendAudit({
        event: 'session.refresh_reuse_detected',
        actor: null, subject: null, ip,
        payload: { chainId: e.chainId, handler: 'route' },
      });
    }
    if (!(e instanceof RefreshReuseError || e instanceof RefreshExpiredError || e instanceof RefreshInvalidError)) {
      console.error('[auth/refresh]', e);
    }
    return res;
  }
}
