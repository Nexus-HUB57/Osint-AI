import { NodeExecutionResponseSchema, type AIMapNode } from '../contracts/schemas';
import type { NodeTransport } from '../orchestrator-e2e';
import { metrics } from '../metrics';

export interface HttpTransportOptions {
  fetchImpl?: typeof fetch;
  headers?:   () => Record<string, string>;
  timeoutMs?: number;
}

export class HttpTransport implements NodeTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly headers:   () => Record<string, string>;

  constructor(opts: HttpTransportOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.headers   = opts.headers ?? (() => ({}));
  }

  async invoke(node: AIMapNode, query: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    const url = new URL('/v1/execute', node.endpoint).toString();
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers() },
      body: JSON.stringify({ query, nodeId: node.nodeId }),
      signal,
    });
    if (!res.ok) {
      metrics.counter('orchestrator.node.errors', 1, { agent: node.agentType, reason: `http_${res.status}` });
      throw new Error(`node ${node.nodeId} HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    const parsed = NodeExecutionResponseSchema.parse(json);
    if (!parsed.ok) {
      metrics.counter('orchestrator.node.errors', 1, { agent: node.agentType, reason: 'node_not_ok' });
      throw new Error(`node ${node.nodeId} reported ok=false`);
    }
    return parsed.payload;
  }
}

export function makeBearerHeaders(getToken: () => string | null) {
  return () => {
    const t = getToken();
    return t ? { authorization: `Bearer ${t}` } : {};
  };
}
