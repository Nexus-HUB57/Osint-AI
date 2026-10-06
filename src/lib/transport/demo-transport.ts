import type { AIMapNode, AgentType } from '../contracts/schemas';
import type { NodeTransport } from '../orchestrator-e2e';

const PAYLOADS: Record<AgentType, Record<string, unknown>> = {
  CloudSINT:  { matches: 14, breachCategories: ['identities', 'credentials'] },
  OSINT4ALL:  { mappedProfiles: 8, assetsAudited: true },
  HybridCore: { fusedScore: 0.87, corroboratingSources: 3 },
};

/** Somente para harness/testes — NUNCA use em produção. */
export const demoTransport: NodeTransport = async (node, query, signal) => {
  await new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, 80 + Math.random() * 240);
    signal.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
  return { query, ...PAYLOADS[node.agentType] };
};

export const demoTopology: readonly AIMapNode[] = [
  { nodeId: 'node-osint4all-01', endpoint: 'https://node1.aimap.internal/osint4all', agentType: 'OSINT4ALL', status: 'active', latencyMs: 14 },
  { nodeId: 'node-cloudsint-02', endpoint: 'https://node2.aimap.internal/vector',    agentType: 'CloudSINT', status: 'active', latencyMs: 19 },
  { nodeId: 'node-fusion-core',  endpoint: 'https://hub.aimap.internal/orchestrate', agentType: 'HybridCore', status: 'active', latencyMs: 9  },
];
