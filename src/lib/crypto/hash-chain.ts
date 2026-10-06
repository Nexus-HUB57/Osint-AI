import 'server-only';
import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

/** JSON canônico — chaves ordenadas, rejeita não-finitos. */
export function canonicalJSON(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string' || t === 'boolean') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonicalJSON: non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSON).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJSON: cannot serialize ${t}`);
}

export interface ChainInput {
  seq:       number;
  id:        string;
  prevHash:  string | null;
  event:     string;
  actor:     string | null;
  subject:   string | null;
  ip:        string | null;
  payload:   string;
  createdAt: number;
}

export function computeEntryHash(input: ChainInput): string {
  const material = canonicalJSON({
    seq:       input.seq,
    id:        input.id,
    prevHash:  input.prevHash,
    event:     input.event,
    actor:     input.actor,
    subject:   input.subject,
    ip:        input.ip,
    payload:   input.payload,
    createdAt: input.createdAt,
  });
  return createHash('sha256').update(material).digest('hex');
}
🗄️ Camada de banco polimórfica
