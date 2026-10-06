import { logger } from './logger';
import { auditEngine } from './audit/audit-engine';
import { metrics, type MetricsSink } from './metrics';
import { requirePermission, isExpired, ForbiddenError } from './rbac';
import {
  VoidSessionTokenSchema,
  AIMapNodeSchema,
  type AIMapNode,
  type ExecutionResult,
  type VoidSessionToken,
} from './contracts/schemas';
import { demoTransport, demoTopology } from './transport/demo-transport';

export type NodeTransport =
  | ((node: AIMapNode, query: string, signal: AbortSignal) => Promise<Record<string, unknown>>)
  | { invoke(node: AIMapNode, query: string, signal: AbortSignal): Promise<Record<string, unknown>> };

export type TopologyProvider = () => Promise<readonly AIMapNode[]>;

export interface OrchestratorOptions {
  voidUrl?:      string;
  aiMapUrl?:     string;
  timeoutMs?:    number;
  transport?:    NodeTransport;
  topology?:     TopologyProvider;
  metrics?:      MetricsSink;
  tokenFactory?: (subject: string) => Promise<VoidSessionToken>;
}

const SCOPE = 'Orchestrator';
const DEFAULT_TIMEOUT_MS = 8_000;

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const abortError = (reason: unknown): Error => {
  const message = reason instanceof Error ? reason.message
    : typeof reason === 'string' ? reason : 'aborted';
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const e = new Error(message); e.name = 'AbortError'; return e;
};

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError(signal.reason));
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => { clearTimeout(timer); reject(abortError(signal.reason)); };
    timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

async function invokeTransport(
  t: NodeTransport,
  node: AIMapNode,
  query: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  if (typeof t === 'function') return t(node, query, signal);
  return t.invoke(node, query, signal);
}

export class FullStackOrchestrator {
  private token: VoidSessionToken | null = null;
  private nodes: AIMapNode[] = [];

  private readonly voidUrl:   string;
  private readonly aiMapUrl:  string;
  private readonly timeoutMs: number;
  private readonly transport: NodeTransport;
  private readonly topology:  TopologyProvider;
  private readonly metrics:   MetricsSink;
  private readonly tokenFactory: (subject: string) => Promise<VoidSessionToken>;

  constructor(opts: OrchestratorOptions = {}) {
    this.voidUrl   = opts.voidUrl  ?? process.env.NEXT_PUBLIC_VOIDACCESS_URL ?? 'https://void.internal';
    this.aiMapUrl  = opts.aiMapUrl ?? process.env.NEXT_PUBLIC_AIMAP_URL      ?? 'https://aimap.internal';
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.metrics   = opts.metrics ?? metrics;

    this.transport = opts.transport ?? demoTransport;
    this.topology  = opts.topology  ?? (async () => demoTopology);

    this.tokenFactory = opts.tokenFactory ?? (async () => {
      throw new Error('tokenFactory não configurado — configure via API route.');
    });
  }

  public get session(): VoidSessionToken | null { return this.token; }
  public get topologySnapshot(): readonly AIMapNode[] { return this.nodes; }

  public async authorizeVoidAccess(subject = 'anonymous'): Promise<VoidSessionToken> {
    const t0 = now();
    logger.info(SCOPE, `Handshake M2M contra VoidAccess (${this.voidUrl})…`);
    const raw = await this.tokenFactory(subject);
    const token = VoidSessionTokenSchema.parse(raw);
    if (isExpired(token)) throw new Error('Token emitido já nasceu expirado.');
    this.token = token;
    this.metrics.counter('orchestrator.token.issued', 1, { subject });
    logger.success(SCOPE, `Sessão autorizada em ${Math.round(now() - t0)}ms.`);
    return token;
  }

  public setSessionToken(token: VoidSessionToken): void {
    this.token = VoidSessionTokenSchema.parse(token);
  }

  private ensureToken(required: Parameters<typeof requirePermission>[1]): VoidSessionToken {
    if (!this.token) throw new Error('Sessão VoidAccess ausente. Execute authorizeVoidAccess().');
    if (isExpired(this.token)) {
      this.metrics.counter('orchestrator.token.rejected', 1, { reason: 'expired' });
      throw new Error('Sessão VoidAccess expirada.');
    }
    requirePermission(this.token, required);
    return this.token;
  }

  public async discoverAIMapTopology(): Promise<readonly AIMapNode[]> {
    this.ensureToken('aimap:read');
    logger.info(SCOPE, `Consultando topologia AIMap (${this.aiMapUrl})…`);
    const discovered = await this.topology();
    this.nodes = discovered
      .map((n) => AIMapNodeSchema.parse(n))
      .filter((n) => n.status !== 'offline');
    logger.success(SCOPE, `${this.nodes.length} nó(s) ativo(s) sincronizado(s).`);
    this.metrics.gauge('orchestrator.nodes.active', this.nodes.length);
    return this.nodes;
  }

  private async dispatch(node: AIMapNode, query: string, signal: AbortSignal): Promise<ExecutionResult> {
    const t0 = now();
    const payload = await invokeTransport(this.transport, node, query, signal);
    return {
      nodeId:     node.nodeId,
      agent:      node.agentType,
      status:     'SUCCESS',
      payload:    { query, ...payload },
      timestamp:  new Date().toISOString(),
      durationMs: Math.max(0, Math.round(now() - t0)),
    };
  }

  public async executePipeline(
    targetQuery: string,
    externalSignal?: AbortSignal,
  ): Promise<readonly ExecutionResult[]> {
    const query = targetQuery.trim();
    if (!query) throw new Error('Query vazia: nada a despachar.');

    try {
      this.ensureToken('agent:execute');
      if (this.nodes.length === 0) await this.discoverAIMapTopology();

      const ctrl = new AbortController();
      const onExternalAbort = () => ctrl.abort(externalSignal?.reason);
      externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
      const timeoutId = setTimeout(() => ctrl.abort(new Error('timeout')), this.timeoutMs);

      logger.info(SCOPE, `Despachando "${query}" para ${this.nodes.length} nó(s)…`);
      this.metrics.counter('orchestrator.pipeline.total', 1, { phase: 'start' });

      try {
        const settled = await Promise.allSettled(
          this.nodes.map((n) => this.dispatch(n, query, ctrl.signal)),
        );

        const results: ExecutionResult[] = settled.map((outcome, i) => {
          const node = this.nodes[i]!;
          if (outcome.status === 'fulfilled') {
            this.metrics.histogram('orchestrator.node.duration_ms', outcome.value.durationMs, {
              agent: node.agentType, outcome: 'success',
            });
            return outcome.value;
          }
          const reason    = outcome.reason;
          const message   = reason instanceof Error ? reason.message : String(reason);
          const isTimeout = ctrl.signal.aborted && !externalSignal?.aborted;
          const status    = isTimeout ? 'TIMEOUT' : 'FAILED';

          this.metrics.counter('orchestrator.node.errors', 1, { agent: node.agentType, reason: status });
          logger.error(SCOPE, `Nó ${node.nodeId} falhou: ${message}`);

          return {
            nodeId: node.nodeId, agent: node.agentType, status,
            payload: { error: message },
            timestamp: new Date().toISOString(), durationMs: 0,
          };
        });

        const ok = results.filter((r) => r.status === 'SUCCESS').length;
        logger.success(SCOPE, `Pipeline concluído — ${ok}/${results.length} nó(s) OK.`);
        this.metrics.counter('orchestrator.pipeline.total', 1, { phase: 'done', ok: String(ok) });
        return results;
      } finally {
        clearTimeout(timeoutId);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      }
    } catch (error) {
      if (error instanceof ForbiddenError) {
        this.metrics.counter('orchestrator.token.rejected', 1, { reason: 'forbidden' });
      }
      logger.error(SCOPE, `Falha crítica: ${(error as Error).message}. Acionando purga.`);
      await auditEngine.executePurge('pipeline_critical');
      throw error;
    }
  }
}

export const fullStackOrchestrator = new FullStackOrchestrator();
🩺 Audit engine (recuperação client-side, distinto do trail)
