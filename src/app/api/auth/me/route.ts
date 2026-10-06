import { NextResponse } from 'next/server';
import { clientIp, enforce } from '@/lib/ratelimit';
import { readSessionCookie } from '@/lib/auth/session-cookie';
import { getSessionByToken } from '@/lib/auth/service';
import { verifyAuditChain } from '@/lib/audit/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  const ip = clientIp(req);
  const rl = await enforce('me', [ip]);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const raw = readSessionCookie(req);
  if (!raw) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const ctx = await getSessionByToken(raw);
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const body: Record<string, unknown> = {
    user: ctx.user, subject: ctx.subject, expiresAt: ctx.expiresAt,
  };
  if (url.searchParams.get('verify_chain') === '1') {
    body['auditChain'] = await verifyAuditChain();
  }
  return NextResponse.json(body, { status: 200 });
}
