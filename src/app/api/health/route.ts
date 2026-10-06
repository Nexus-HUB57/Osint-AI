import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { verifyAuditChain } from '@/lib/audit/chain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const db = await getDb();
    const dbHealth = await db.healthCheck();
    const chain = await verifyAuditChain();
    return NextResponse.json({
      ok: dbHealth.ok && chain.ok,
      db:  { dialect: db.dialect, ...dbHealth },
      auditChain: chain,
      timestamp: new Date().toISOString(),
    }, { status: chain.ok && dbHealth.ok ? 200 : 503 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 503 },
    );
  }
}
🖼️ UI
