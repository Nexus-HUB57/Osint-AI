import type { Permission, VoidSessionToken } from './contracts/types';

export class ForbiddenError extends Error {
  constructor(public readonly required: Permission, public readonly subject: string) {
    super(`subject ${subject} lacks permission ${required}`);
    this.name = 'ForbiddenError';
  }
}

export function hasPermission(token: VoidSessionToken, perm: Permission): boolean {
  return token.permissions.includes(perm);
}

export function requirePermission(token: VoidSessionToken, perm: Permission): void {
  if (!hasPermission(token, perm)) throw new ForbiddenError(perm, token.subject);
}

export function isExpired(token: VoidSessionToken, now = Date.now()): boolean {
  return now >= token.issuedAt + token.expiresIn * 1000;
}
