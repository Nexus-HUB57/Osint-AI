import 'server-only';
import type { NextResponse } from 'next/server';

const PROD = process.env.NODE_ENV === 'production';

const ACCESS_NAME  = PROD ? '__Host-sid' : 'sid';
const REFRESH_NAME = PROD ? '__Host-rid' : 'rid';
const PATH         = '/';

function setCookie(res: NextResponse, name: string, value: string, expiresAt: number): void {
  res.cookies.set({
    name, value, httpOnly: true, secure: PROD,
    sameSite: 'lax', path: PATH, expires: new Date(expiresAt),
  });
}

function clearCookie(res: NextResponse, name: string): void {
  res.cookies.set({
    name, value: '', httpOnly: true, secure: PROD,
    sameSite: 'lax', path: PATH, maxAge: 0,
  });
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSessionCookie(res: NextResponse, raw: string, expiresAt: number): void {
  setCookie(res, ACCESS_NAME, raw, expiresAt);
}
export function clearSessionCookie(res: NextResponse): void {
  clearCookie(res, ACCESS_NAME);
}
export function readSessionCookie(req: Request): string | null {
  return readCookie(req, ACCESS_NAME);
}

export function setRefreshCookie(res: NextResponse, raw: string, expiresAt: number): void {
  setCookie(res, REFRESH_NAME, raw, expiresAt);
}
export function clearRefreshCookie(res: NextResponse): void {
  clearCookie(res, REFRESH_NAME);
}
export function readRefreshCookie(req: Request): string | null {
  return readCookie(req, REFRESH_NAME);
}
