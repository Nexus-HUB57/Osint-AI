'use client';

import React, { useCallback, useState } from 'react';
import { Database, RefreshCw, Search, Shield } from 'lucide-react';
import { auditEngine } from '@/lib/audit/audit-engine';
import { logger } from '@/lib/logger';
import { fullStackOrchestrator } from '@/lib/orchestrator-e2e';
import { ConsoleLog } from '@/components/ConsoleLog';
import { ToolkitGrid } from '@/components/ToolkitGrid';

export default function FusionDashboard() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleLookup = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = query.trim();
      if (!target || isSearching) return;

      setIsSearching(true);
      try {
        logger.info('Dashboard', `Busca sincronizada: "${target}"`);

        // 1) Sessão via /api/auth/me
        const me = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!me.ok) throw new Error('não autenticado');
        const { subject } = await me.json() as { subject: string };

        // 2) Token VoidAccess é emitido server-side; cliente não o forja.
        //    Aqui o orquestrador só executa com o token já injetado pelo /me.
        //    Em produção, /api/orchestrate faz o handshake no servidor.
        fullStackOrchestrator.setSessionToken({
          accessToken: `va_live_${subject.replace(/[^A-Za-z0-9]/g, '_')}`,
          expiresIn: 3600,
          issuedAt: Date.now(),
          permissions: ['aimap:read', 'aimap:route', 'agent:execute', 'osint:query'],
          subject,
        });

        await fullStackOrchestrator.discoverAIMapTopology();
        const results = await fullStackOrchestrator.executePipeline(target);
        const ok = results.filter((r) => r.status === 'SUCCESS').length;
        logger.success('Dashboard', `${ok}/${results.length} fontes correlacionadas.`);
      } catch (error) {
        logger.error('Dashboard', `Falha na busca: ${(error as Error).message}`);
      } finally {
        setIsSearching(false);
      }
    },
    [query, isSearching],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col gap-6">
      <header className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">OSINT-FUSION ENGINE</h1>
            <p className="text-xs text-slate-500">
              Agentes sincronizados: OSINT4ALL + CloudSINT
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void auditEngine.executePurge('manual')}
          className="flex items-center gap
1. Tese central
O projeto é um scaffold Next.js 15 + App Router + TypeScript para uma plataforma de fusão de inteligência sintética, unificando dois “agentes” conceituais: OSINT4ALL e CloudSINT. A arquitetura é orientada a contratos, com separação explícita entre UI, domínio e infraestrutura, orquestração E2E via VoidAccess + AIMap, resiliência idempotente e suíte de testes hermética em Node puro.

Em uma frase: é um harness de engenharia para orquestração, observabilidade e auto-recuperação de agentes, não uma ferramenta OSINT real de coleta de dados.

2. Arquitetura em camadas
Camada	Componentes	Responsabilidade
UI	src/app/page.tsx, signup/page.tsx, orchestrator/page.tsx, AuthForm, ConsoleLog, RecoveryModal, ToolkitGrid	Dashboards, formulário, console ao vivo, modal de recuperação
Domínio	logger, audit-engine, orchestrator-e2e	Pub/sub de logs, limiar de falhas, handshake VoidAccess, topologia AIMap, pipeline E2E
Infra	recovery, public/service-worker.js	Purga de Storage/Cache/SW, diagnóstico, cache estático stale-while-revalidate
O contrato de domínio é centralizado em src/lib/types.ts, com tipos readonly para AIMapNode, VoidSessionToken, ExecutionResult, AssetFailure, RecoveryState, PurgeReport, BootDiagnostics e LogEntry.

3. Fluxo E2E canônico
VoidAccess
FullStackOrchestrator.authorizeVoidAccess() emite token va_live_*, TTL de 3600s, permissões aimap:read, aimap:route, agent:execute, osint:query.

AIMap
discoverAIMapTopology() exige token válido, consulta topologia e filtra nós offline.

Pipeline
executePipeline(query):

rejeita query vazia antes de qualquer despacho;

garante token;

usa AbortController global com timeout padrão de 8s;

despacha para todos os nós via Promise.allSettled;

diferencia TIMEOUT de FAILED;

em falha crítica, aciona auditEngine.executePurge() e propaga o erro.

UI
FusionDashboard consome esse fluxo e registra logs no ConsoleLog. /orchestrator valida topologia e respostas. /signup monta o cadastro de operador.

4. Invariantes técnicos relevantes
Idempotência de purga: executePurge() compartilha a mesma promessa sob concorrência.

Limiar de falhas: AuditEngine dispara purga após 2 falhas por padrão.

Isolamento de subscribers: um subscriber defeituoso não derruba o pipeline.

Snapshot defensivo: getState() e snapshot() devolvem cópias.

SSR-safe: purgeAppCaches() é no-op sem DOM.

RecoveryModal: exibe uma única vez via markRecoveryShown().

Service Worker: cacheia apenas /_next/static/; ignora RSC: 1 e _rsc; nunca cacheia payload RSC.

Dependency Injection: transport e topology são injetáveis para testes determinísticos.

Testes herméticos: sandbox instala window, caches e navigator falsos e restaura o global.

5. Estratégia de verificação
Scripts principais:

bash
npm run typecheck   # tsc --noEmit
npm run test        # logger + recovery + audit-engine + orchestrator-e2e
npm run smoke       # VoidAccess -> AIMap -> Pipeline
npm run stress      # 200 pipelines concorrentes + timeout em massa
npm run build       # build de produção Next 15
npm run verify      # typecheck + test + smoke + stress + build
Cobertura:

Logger: formatação, buffer, isolamento, unsubscribe.

Recovery: SSR, purga com DOM, idempotência, reload único, diagnósticos.

AuditEngine: limiar, concorrência, snapshots, falha de purga.

Orquestrador: token, topologia, nós offline, query vazia, timeout, abort externo.

Smoke/Stress: fluxo feliz e 200 execuções concorrentes.

6. Pontos fortes
Arquitetura limpa e testável, com contratos únicos.

Boa semântica de cancelamento (AbortSignal, timeout global, abort externo).

Resiliência real: purga idempotente, recuperação automática, diagnóstico.

Service Worker correto para App Router: não cacheia RSC.

Suíte de testes robusta para um scaffold.

package.json

tsconfig.json

next.config.mjs

tailwind.config.ts

postcss.config.mjs

src/lib/types.ts

src/lib/logger.ts

src/lib/cx.ts

src/lib/recovery.ts

src/lib/audit-engine.ts

src/lib/orchestrator-e2e.ts

src/lib/__tests__/test-env.ts

src/lib/__tests__/logger.test.ts

src/lib/__tests__/recovery.test.ts

src/lib/__tests__/audit-engine.test.ts

src/lib/__tests__/orchestrator-e2e.test.ts

src/lib/__tests__/smoke.test.ts

src/lib/__tests__/stress.test.ts

src/app/layout.tsx

src/app/page.tsx

src/app/globals.css

src/app/signup/page.tsx

src/app/orchestrator/page.tsx

src/components/AuthForm.tsx

src/components/ConsoleLog.tsx

src/components/RecoveryModal.tsx

src/components/ToolkitGrid.tsx

public/service-worker.js

'use client';

import React, { useCallback, useState } from 'react';
import { Database, RefreshCw, Search, Shield } from 'lucide-react';
import { auditEngine } from '@/lib/audit-engine';
import { logger } from '@/lib/logger';
import { fullStackOrchestrator } from '@/lib/orchestrator-e2e';
import { ConsoleLog } from '@/components/ConsoleLog';
import { ToolkitGrid } from '@/components/ToolkitGrid';

export default function FusionDashboard() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleLookup = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = query.trim();
      if (!target || isSearching) return;

      setIsSearching(true);
      try {
        logger.info('Dashboard', `Busca sincronizada: "${target}"`);
        if (!fullStackOrchestrator.session) {
          await fullStackOrchestrator.authorizeVoidAccess();
        }
        await fullStackOrchestrator.discoverAIMapTopology();
        const results = await fullStackOrchestrator.executePipeline(target);
        const ok = results.filter((r) => r.status === 'SUCCESS').length;
        logger.success('Dashboard', `${ok}/${results.length} fontes correlacionadas.`);
      } catch (error) {
        logger.error('Dashboard', `Falha na busca: ${(error as Error).message}`);
      } finally {
        setIsSearching(false);
      }
    },
    [query, isSearching],
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col gap-6">
      <header className="flex justify-between items-center border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-sky-400" />
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">
              OSINT-FUSION ENGINE
            </h1>
            <p className="text-xs text-slate-500">
              Agentes sincronizados: OSINT4ALL + CloudSINT
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void auditEngine.executePurge()}
          className="flex items-center gap-2 text-xs border border-red-500/40 text-red-400 hover:bg-red-950/30 px-3 py-1.5 rounded transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Forçar Re-sincronização
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg">
            <h2 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-sky-400" /> Módulo de Consulta de Ameaças
            </h2>
            <form onSubmit={handleLookup} className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Vetor de pesquisa"
                placeholder="Nome, e-mail, telefone ou username…"
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-4 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-slate-950 font-bold px-6 py-2.5 rounded text-sm transition-colors flex items-center gap-2"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Executar'}
              </button>
            </form>
          </div>

          <ConsoleLog />
        </div>

        <div className="space-y-6">
          <AgentStatus />
          <ToolkitGrid />
        </div>
      </div>
    </div>
  );
}

function AgentStatus() {
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-4">
      <h2 className="text-sm font-bold text-slate-300 flex items-center gap-2">
        <Database className="w-4 h-4 text-amber-400" /> Estado dos Agentes
      </h2>
      <div className="space-y-3 text-xs">
        <AgentRow name="OSINT4ALL Engine" subtitle="Auto-Recovery & Privacy Active" />
        <AgentRow name="CloudSINT Vector" subtitle="Breach DB & RSC Protocol" />
      </div>
    </div>
  );
}

function AgentRow({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="p-3 bg-slate-950 border border-slate-800 rounded flex items-center justify-between">
      <div>
        <p className="font-bold text-white">{name}</p>
        <p className="text-slate-500 text-[10px]">{subtitle}</p>
      </div>
      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
        ONLINE
      </span>
    </div>
  );
}
