import { NextResponse } from 'next/server';
import { createS3WormUploader, exportAuditToWorm, wormConfigFromEnv } from '@/lib/audit/worm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.ADMIN_EXPORT_TOKEN;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const cfg = wormConfigFromEnv();
  if (!cfg) return NextResponse.json({ error: 'worm_not_configured' }, { status: 503 });

  const uploader = await createS3WormUploader(cfg);
  const batches = await exportAuditToWorm({ uploader });

  return NextResponse.json({
    ok: true,
    batchCount: batches.length,
    batches: batches.map((b) => ({
      seqStart: b.seqStart, seqEnd: b.seqEnd, count: b.count,
      key: b.key, sha256: b.sha256, sizeBytes: b.sizeBytes,
      retainUntil: b.retainUntil.toISOString(),
    })),
  }, { status: 200 });
}
