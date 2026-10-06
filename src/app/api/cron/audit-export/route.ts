import { NextResponse } from 'next/server';
import { createS3WormUploader, exportAuditToWorm, wormConfigFromEnv } from '@/lib/audit/worm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const cfg = wormConfigFromEnv();
  if (!cfg) return NextResponse.json({ error: 'worm_not_configured' }, { status: 503 });

  const uploader = await createS3WormUploader(cfg);
  const batches = await exportAuditToWorm({ uploader });

  return NextResponse.json({ ok: true, batches: batches.length }, { status: 200 });
}
