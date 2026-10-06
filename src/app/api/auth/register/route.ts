import { NextResponse } from 'next/server';
import { RegisterRequestSchema } from '@/lib/contracts/schemas';
import { enforce, clientIp } from '@/lib/ratelimit';
import { appendAudit } from '@/lib/audit/chain';
import { register, DuplicateEmailError } from '@/lib/auth/service';
import { setSessionCookie, setRefreshCookie } from '@/lib/auth/session-cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TurnstileVerify { success: boolean }

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('TURNSTILE_SECRET_KEY ausente');
    return true;
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body, cache: 'no-store',
  });
  return Boolean(((await res.json()) as TurnstileVerify).success);
}

export async function POST(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);

  const rl = await enforce('register', [ip]);
  if (!rl.allowed) {
    await appendAudit({ event: 'ratelimit.blocked', ip, payload: { policy: 'register' } });
    return NextResponse.json(
      { error: 'rate_limited', resetAt: rl.resetAt },
      {
        status: 429,
        headers: { 'retry-after': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  let json: unknown;
  try { json = await req.json(); }
  catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }

  const parsed = RegisterRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', issues: parsed.error.issues }, { status: 422 });
  }

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return NextResponse.json({ error: 'turnstile_failed' }, { status: 403 });
  }

  try {
    const pair = await register({
      firstName: parsed.data.firstName,
      lastName:  parsed.data.lastName,
      email:     parsed.data.email,
      organization: parsed.data.organization,
      password:  parsed.data.password,
      ip,
    });

    const res = NextResponse.json(
      { user: pair.user, token: pair.access.tokenVoid },
      { status: 201 },
    );
    setSessionCookie(res, pair.access.token, pair.access.expiresAt);
    setRefreshCookie(res, pair.refresh.token, pair.refresh.expiresAt);
    return res;
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: 'email_taken' }, { status: 409 });
    }
    console.error('[auth/register]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
