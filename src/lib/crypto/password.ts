import 'server-only';
import { hash, verify, Algorithm } from '@node-rs/argon2';

/**
 * Parâmetros OWASP 2024 para Argon2id.
 * m=19 MiB, t=2, p=1 — resistente a GPU/ASIC.
 */
const ARGON2ID = {
  algorithm:   Algorithm.Argon2id,
  memoryCost:  19_456,
  timeCost:    2,
  parallelism: 1,
  outputLen:   32,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2ID);
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  try {
    return await verify(encoded, plain);
  } catch {
    return false;
  }
}

/** Anti-enumeração: gasta CPU equivalente a uma verificação real. */
let _dummyPromise: Promise<string> | null = null;

export async function dummyVerify(): Promise<void> {
  if (!_dummyPromise) _dummyPromise = hashPassword('::timing-defense::');
  const encoded = await _dummyPromise;
  await verifyPassword('wrong-password', encoded);
}
