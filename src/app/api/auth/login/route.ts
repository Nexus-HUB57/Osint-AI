import { NextResponse } from 'next/server';
import { LoginRequestSchema } from '@/lib/contracts/schemas';
import { enforce, clientIp } from '@/lib/ratelimit';
import { appendAudit } from '@/lib/audit/chain';
import { login, InvalidCredentialsError } from '@/lib/auth/service';
import { setSessionCookie, setRefreshCookie } from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);

  let json: unknown;
  try { json = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const parsed = LoginRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 422 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const rl = await enforce('login', [ip, `email:${email}`]);
  if (!rl.allowed) {
    await appendAudit({
      event: 'ratelimit.blocked', ip, subject: `email:${email}`,
      payload: { policy: 'login' },
    });
    return NextResponse.json(
      { error: 'rate_limited', resetAt: rl.resetAt },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  try {
    const pair = await login({
      email, password: parsed.data.password, ip,
      userAgent: req.headers.get('user-agent'),
    });
    const res = NextResponse.json({ user: pair.user, token: pair.access.tokenVoid }, { status: 200 });
    setSessionCookie(res, pair.access.token, pair.access.expiresAt);
    setRefreshCookie(res, pair.refresh.token, pair.refresh.expiresAt);
    return res;
  } catch (e) {
    if (e instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }
    console.error('[auth/login]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
