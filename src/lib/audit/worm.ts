import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getDb } from '../db/client';
import { canonicalJSON } from '../crypto/hash-chain';
import { appendAudit } from './chain';

export interface WormObject {
  key:         string;
  body:        string;
  sha256:      string;
  sizeBytes:   number;
  retainUntil: Date;
}

export interface WormUploader {
  putObject(obj: WormObject): Promise<void>;
}

export interface S3Config {
  bucket:           string;
  region:           string;
  endpoint?:        string;
  accessKeyId?:     string;
  secretAccessKey?: string;
  retainDays?:      number;
}

export async function createS3WormUploader(cfg: S3Config): Promise<WormUploader> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: cfg.accessKeyId && cfg.secretAccessKey
      ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
      : undefined,
  });

  const retainDays = cfg.retainDays ?? 7 * 365;

  return {
    async putObject(obj) {
      await client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: obj.key,
        Body: obj.body,
        ContentType: 'application/x-ndjson',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: obj.retainUntil,
        ChecksumSHA256: Buffer.from(obj.sha256, 'hex').toString('base64'),
        Metadata: { 'x-osint-sha256': obj.sha256 },
      }));
      void retainDays;
    },
  };
}

export function createMemoryWormUploader(): WormUploader & { objects: WormObject[] } {
  const objects: WormObject[] = [];
  return {
    objects,
    async putObject(obj) { objects.push(obj); },
  };
}

export interface ExportBatch {
  seqStart:    number;
  seqEnd:      number;
  count:       number;
  key:         string;
  sha256:      string;
  sizeBytes:   number;
  retainUntil: Date;
}

interface ExportedRow {
  seq: number; id: string; prev_hash: string | null; hash: string;
  event: string; actor: string | null; subject: string | null;
  ip: string | null; payload: string; created_at: number;
}

const DEFAULT_BATCH = 500;
const RETENTION_DAYS = 7 * 365;

export interface WormExportOptions {
  uploader:   WormUploader;
  batchSize?: number;
  signal?:    AbortSignal;
}

export async function exportAuditToWorm(opts: WormExportOptions): Promise<ExportBatch[]> {
  const db = await getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH;
  const batches: ExportBatch[] = [];

  const state = await db.queryOne<{ last_seq: number }>(
    `SELECT last_seq FROM worm_export_state WHERE id = 1`,
  );
  let lastExported = state?.last_seq ?? 0;

  for (;;) {
    if (opts.signal?.aborted) break;

    const rows = await db.query<ExportedRow>(
      `SELECT seq, id, prev_hash, hash, event, actor, subject, ip, payload, created_at
       FROM audit_log WHERE seq > $1
       ORDER BY seq ASC LIMIT $2`,
      [lastExported, batchSize],
    );

    if (rows.length === 0) break;

    const seqStart = rows[0]!.seq;
    const seqEnd   = rows[rows.length - 1]!.seq;
    const now      = new Date();

    const ndjson = rows.map((r) => canonicalJSON({
      seq: r.seq, id: r.id, prevHash: r.prev_hash, hash: r.hash,
      event: r.event, actor: r.actor, subject: r.subject, ip: r.ip,
      payload: safeJsonParse(r.payload),
      createdAt: r.created_at,
    })).join('\n') + '\n';

    const sha256    = createHash('sha256').update(ndjson).digest('hex');
    const sizeBytes = Buffer.byteLength(ndjson, 'utf8');
    const key       = `audit/${now.toISOString().slice(0, 10)}/seq-${seqStart}-${seqEnd}-${sha256.slice(0, 12)}.ndjson`;
    const retainUntil = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await opts.uploader.putObject({ key, body: ndjson, sha256, sizeBytes, retainUntil });

    await db.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO worm_exports
           (id, seq_start, seq_end, count, s3_key, sha256, size_bytes, retain_until, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [randomUUID(), seqStart, seqEnd, rows.length, key, sha256, sizeBytes, retainUntil.getTime(), now.getTime()],
      );

      await tx.execute(
        `INSERT INTO worm_export_state (id, last_seq, updated_at)
         VALUES (1, $1, $2)
         ON CONFLICT(id) DO UPDATE SET last_seq = excluded.last_seq, updated_at = excluded.updated_at`,
        [seqEnd, now.getTime()],
      );

      await appendAudit({
        event: 'audit.worm_exported', actor: null, subject: null, ip: null,
        payload: { key, sha256, seqStart, seqEnd, count: rows.length, retainUntil: retainUntil.toISOString() },
      }, tx);
    });

    batches.push({ seqStart, seqEnd, count: rows.length, key, sha256, sizeBytes, retainUntil });
    lastExported = seqEnd;

    if (rows.length < batchSize) break;
  }

  return batches;
}

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

export function wormConfigFromEnv(): S3Config | null {
  const bucket = process.env.WORM_S3_BUCKET;
  const region = process.env.WORM_S3_REGION;
  if (!bucket || !region) return null;
  return {
    bucket, region,
    endpoint:        process.env.WORM_S3_ENDPOINT,
    accessKeyId:     process.env.WORM_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.WORM_S3_SECRET_ACCESS_KEY,
    retainDays:      process.env.WORM_RETAIN_DAYS ? Number(process.env.WORM_RETAIN_DAYS) : undefined,
  };
}
🔑 Sessão, refresh e auth
