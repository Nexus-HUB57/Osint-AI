import { logger } from './logger';
import type { BootDiagnostics, PurgeReport } from './contracts/types';

const SCOPE = 'Recovery';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export async function purgeAppCaches(): Promise<PurgeReport> {
  const report: PurgeReport = {
    storageCleared: false,
    cachesDeleted: 0,
    serviceWorkersUnregistered: 0,
    errors: [],
  };

  if (!isBrowser()) {
    logger.debug(SCOPE, 'Ambiente sem DOM — purga ignorada.');
    return report;
  }

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
    report.storageCleared = true;
    logger.info(SCOPE, 'localStorage + sessionStorage limpos.');
  } catch (e) {
    const msg = (e as Error).message;
    report.errors.push(`storage: ${msg}`);
    logger.error(SCOPE, `Falha ao limpar Storage: ${msg}`);
  }

  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      report.cachesDeleted = keys.length;
      logger.info(SCOPE, `${keys.length} cache(s) removido(s).`);
    } catch (e) {
      const msg = (e as Error).message;
      report.errors.push(`caches: ${msg}`);
      logger.error(SCOPE, `Falha ao limpar Cache Storage: ${msg}`);
    }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      report.serviceWorkersUnregistered = regs.length;
      logger.info(SCOPE, `${regs.length} service worker(s) desregistrado(s).`);
    } catch (e) {
      const msg = (e as Error).message;
      report.errors.push(`serviceWorker: ${msg}`);
      logger.error(SCOPE, `Falha ao desregistrar SW: ${msg}`);
    }
  }

  return report;
}

export async function hardResetAndReload(): Promise<PurgeReport> {
  const report = await purgeAppCaches();
  if (isBrowser()) window.location.reload();
  return report;
}

export function getDiagnostics(): BootDiagnostics {
  if (!isBrowser()) {
    return {
      online: false,
      userAgent: 'server',
      language: 'n/a',
      storage: { localStorageLength: null, sessionStorageLength: null },
      serviceWorker: { supported: false, controller: null, registrations: 0 },
      cacheNames: [],
      timestamp: new Date().toISOString(),
    };
  }

  let localStorageLength:   number | null = null;
  let sessionStorageLength: number | null = null;
  try { localStorageLength   = window.localStorage.length;   } catch { /* modo privado */ }
  try { sessionStorageLength = window.sessionStorage.length; } catch { /* modo privado */ }

  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

  return {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'n/a',
    storage: { localStorageLength, sessionStorageLength },
    serviceWorker: {
      supported: swSupported,
      controller: swSupported
        ? (navigator.serviceWorker.controller?.scriptURL ?? null)
        : null,
      registrations: 0,
    },
    cacheNames: [],
    timestamp: new Date().toISOString(),
  };
}

export async function collectDiagnostics(): Promise<BootDiagnostics> {
  const diag = getDiagnostics();
  if (!isBrowser()) return diag;

  if (typeof caches !== 'undefined') {
    try { diag.cacheNames = await caches.keys(); }
    catch (e) { logger.warn(SCOPE, `cacheNames indisponível: ${(e as Error).message}`); }
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      diag.serviceWorker.registrations = regs.length;
    } catch { /* noop */ }
  }

  return diag;
}
🎛️ Orquestrador e transports
