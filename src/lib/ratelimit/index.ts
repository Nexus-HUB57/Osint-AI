import 'server-only';

export interface RateLimitResult {
  allowed:   boolean;
  remaining: number;
  resetAt:   number;
  limit:     number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

const LUA_FIXED_WINDOW = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

class UpstashStore implements RateLimitStore {
  constructor(private readonly url: string, private readonly token: string) {}

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        authorization:  `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(['EVAL', LUA_FIXED_WINDOW, '1', `rl:${key}`, String(windowMs)]),
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`upstash_http_${res.status}`);

    const data = (await res.json()) as { result: [number, number] };
    const [count, ttl] = data.result;
    const resetAt = Date.now() + Math.max(0, ttl);

    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetAt, limit };
  }
}

class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const b = this.buckets.get(key);

    if (!b || b.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return { allowed: true, remaining: limit - 1, resetAt: fresh.resetAt, limit };
    }

    b.count += 1;
    return {
      allowed:   b.count <= limit,
      remaining: Math.max(0, limit - b.count),
      resetAt:   b.resetAt,
      limit,
    };
  }
}

let _store: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (_store) return _store;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    _store = new UpstashStore(url, token);
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[ratelimit] UPSTASH não configurado — fallback in-memory NÃO é distribuído.');
    }
    _store = new MemoryStore();
  }
  return _store;
}

export const POLICIES = {
  register: { limit:   3, windowMs: 60 * 60 * 1000 },
  login:    { limit:   5, windowMs: 15 * 60 * 1000 },
  me:       { limit: 120, windowMs: 60 * 1000 },
  logout:   { limit:  30, windowMs: 60 * 1000 },
} as const;

export type PolicyName = keyof typeof POLICIES;

/** Bloqueia se qualquer identificador estourar. */
export async function enforce(
  policy: PolicyName,
  identifiers: Array<string | null | undefined>,
): Promise<RateLimitResult> {
  const { limit, windowMs } = POLICIES[policy];
  const store = getRateLimitStore();
  const ids = identifiers.filter((x): x is string => Boolean(x));

  if (ids.length === 0) {
    return { allowed: true, remaining: limit, resetAt: Date.now() + windowMs, limit };
  }

  const results = await Promise.all(
    ids.map((id) => store.consume(`${policy}:${id}`, limit, windowMs)),
  );

  const blocked = results.find((r) => !r.allowed);
  if (blocked) return blocked;

  return results.reduce((a, b) => (a.remaining <= b.remaining ? a : b));
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}
🧰 Suporte (logger, metrics, rbac, recovery, cx)
