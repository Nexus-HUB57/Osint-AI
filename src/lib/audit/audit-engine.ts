import { logger } from '../logger';
import { purgeAppCaches } from '../recovery';
import { metrics } from '../metrics';
import type { AssetFailure, AssetSource, RecoveryState, PurgeReport } from '../contracts/types';

export type PurgeTrigger = 'threshold' | 'manual' | 'pipeline_critical';

export interface AuditEngineOptions {
  maxFailuresBeforePurge?: number;
  reloadOnPurge?:          boolean;
  purge?:                  (trigger: PurgeTrigger) => Promise<PurgeReport>;
}

const SCOPE = 'Audit';
const DEFAULT_MAX_FAILURES = 2;

export class AuditEngine {
  private failures: AssetFailure[] = [];
  private recoveryShown = false;
  private purgeInFlight: Promise<PurgeReport | null> | null = null;
  private readonly listeners = new Set<(s: RecoveryState) => void>();

  private readonly maxFailuresBeforePurge: number;
  private readonly purgeFn: (t: PurgeTrigger) => Promise<PurgeReport>;

  public reloadOnPurge: boolean;

  constructor(opts: AuditEngineOptions = {}) {
    this.maxFailuresBeforePurge = opts.maxFailuresBeforePurge ?? DEFAULT_MAX_FAILURES;
    this.reloadOnPurge = opts.reloadOnPurge ?? true;
    this.purgeFn = opts.purge ?? (async () => purgeAppCaches());
  }

  public recordAssetFailure(url: string, source: AssetSource = 'unknown', detail?: string): void {
    this.failures.push({ url, source, time: new Date().toISOString(), detail });
    logger.warn(SCOPE, `Falha de asset (${source}): ${url}`);
    this.emit();
    if (this.failures.length >= this.maxFailuresBeforePurge) void this.executePurge('threshold');
  }

  public executePurge(trigger: PurgeTrigger = 'manual'): Promise<PurgeReport | null> {
    if (this.purgeInFlight) return this.purgeInFlight;

    this.purgeInFlight = (async (): Promise<PurgeReport | null> => {
      metrics.counter('audit.purge.total', 1, { trigger });
      logger.warn(SCOPE, `Purga de emergência iniciada (${trigger}).`);
      try {
        const report = await this.purgeFn(trigger);
        logger.success(SCOPE, 'Purga concluída.');
        if (this.reloadOnPurge && typeof window !== 'undefined') window.location.reload();
        return report;
      } catch (e) {
        logger.error(SCOPE, `Falha na purga: ${(e as Error).message}`);
        return null;
      } finally {
        this.purgeInFlight = null;
      }
    })();

    return this.purgeInFlight;
  }

  public markRecoveryShown(): void {
    if (this.recoveryShown) return;
    this.recoveryShown = true;
    this.emit();
  }

  public getState(): RecoveryState {
    return { recoveryShown: this.recoveryShown, failures: [...this.failures] };
  }

  public subscribe(fn: (s: RecoveryState) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  public reset(): void {
    this.failures = [];
    this.recoveryShown = false;
    this.purgeInFlight = null;
    this.listeners.clear();
  }

  private emit(): void {
    const snap = this.getState();
    for (const fn of this.listeners) {
      try { fn(snap); } catch { /* isolamento */ }
    }
  }
}

export const auditEngine = new AuditEngine();
🌐 Rotas de API
