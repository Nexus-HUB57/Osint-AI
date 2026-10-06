'use client';

import React, { useCallback, useState } from 'react';
import { CheckCircle, Cpu, Play, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { ConsoleLog } from '@/components/ConsoleLog';
import { logger } from '@/lib/logger';
import { fullStackOrchestrator } from '@/lib/orchestrator-e2e';
import type { AIMapNode, ExecutionResult } from '@/lib/types';

export default function OrchestratorValidationPage() {
  const [nodes,   setNodes]   = useState<AIMapNode[]>([]);
  const [results, setResults] = useState<ExecutionResult[]>([]);
  const [query,   setQuery]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleSyncAndExecute = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = query.trim();
      if (!target || loading) return;

      setLoading(true);
      try {
        logger.info('Orchestrator', 'Handshake VoidAccess + sincronização AIMap…');
        await fullStackOrchestrator.authorizeVoidAccess();
        setNodes(await fullStackOrchestrator.discoverAIMapTopology());
        setResults(await fullStackOrchestrator.executePipeline(target));
      } catch (error) {
        logger.error('Orchestrator', `Falha: ${(error as Error).message}`);
      } finally {
        setLoading(false);
      }
    },
    [query, loading],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 space-y-6">
      <header className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <ShieldCheck className="w-8 h-8 text-sky-400" />
        <div>
          <h1 className="text-xl font-bold">VOIDACCESS + AIMAP ORCHESTRATOR</h1>
          <p className="text-xs text-slate-500">
            Sincronização e validação de agentes AI end-to-end
          </p>
        </div>
      </header>

      <form onSubmit={handleSyncAndExecute} className="flex gap-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Vetor de pesquisa"
          placeholder="Vetor de pesquisa (ex.: target-user@domain.org)…"
          className="flex-1 bg-slate-900 border border-slate-800 rounded px-4 py-3 text-sm focus:outline-none focus:border-sky-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded text-sm flex items-center gap-2 transition-colors"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Executar &amp; Validar
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2 text-slate-300">
            <Server className="w-4 h-4 text-emerald-400" /> Servidores AIMap Detectados
          </h2>
          <div className="space-y-2 text-xs">
            {nodes.length === 0 ? (
              <p className="text-slate-600">Nenhum nó sincronizado. Execute o pipeline.</p>
            ) : nodes.map((node) => (
              <div
                key={node.nodeId}
                className="p-3 bg-slate-950 border border-slate-800 rounded flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-white block">{node.nodeId}</span>
                  <span className="text-slate-500">
                    {node.agentType} — {node.endpoint}
                  </span>
                </div>
                <span className="text-emerald-400 font-bold">{node.latencyMs}ms</span>
              </div>
            ))}
          </div>
        </div>

        <ConsoleLog title="Logs de Sincronização" />
      </div>

      {results.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-sm font-bold flex items-center gap-2 text-slate-300">
            <Cpu className="w-4 h-4 text-sky-400" /> Respostas Validadas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((result) => (
              <div
                key={result.nodeId}
                className="p-4 bg-slate-950 border border-slate-800 rounded text-xs space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sky-400">
                    {result.agent} ({result.nodeId})
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle className="w-3.5 h-3.5" /> {result.status} · {result.durationMs}ms
                  </span>
                </div>
                <pre className="p-2 bg-slate-900 rounded text-[11px] text-slate-400 overflow-x-auto">
                  {JSON.stringify(result.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
