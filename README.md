# OSINT-Fusion Engine

Agente Autônomo e Motor de Inteligência para Investigações OSINT em Fontes Abertas.

Plataforma de ultra-baixa latência construída sobre **Next.js 15 App Router + React 19 RSC**, com persistência polimórfica (SQLite / PostgreSQL / LibSQL-Turso), trilha de auditoria encadeada por SHA-256 e exportação WORM para S3 Object Lock (modo COMPLIANCE).

## 🚀 Como Executar

```bash
# 1. Instalar dependências
npm install

# 2. Checagem de tipos
npm run typecheck

# 3. Suite de testes
npm run test

# 4. Servidor local
npm run dev
```

## ⚙️ Variáveis de ambiente

Veja `.env.example`. Os pontos críticos:

| Var | Descrição |
| --- | --- |
| `DATABASE_URL` | `sqlite:./.data/osint-fusion.db` · `postgres://…` · `libsql://…` |
| `JWT_SECRET` | Chave de assinatura (32+ bytes) |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limit distribuído |
| `WORM_S3_*` | S3 com COMPLIANCE mode para exportação WORM |
| `NEXT_PUBLIC_VOIDACCESS_URL` / `NEXT_PUBLIC_AIMAP_URL` | Handshake M2M do orquestrador |

## 🧱 Estrutura

```
src/
├── app/                          # Next 15 App Router
│   ├── api/auth/{register,login,refresh,logout,me}/route.ts
│   ├── api/admin/audit/export/route.ts
│   ├── api/cron/audit-export/route.ts
│   ├── api/health/route.ts
│   ├── signup/page.tsx
│   ├── orchestrator/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/                   # AuthForm, ConsoleLog, RecoveryModal, ToolkitGrid
└── lib/
    ├── contracts/                # Zod schemas + tipos compartilhados
    ├── crypto/                   # Argon2id, session tokens, hash chain
    ├── db/                       # Adapter polimórfico + DDL SQLite/Postgres/LibSQL
    ├── audit/                    # Append-only SHA-256 chain + WORM export
    ├── auth/                     # register/login/refresh + cookies __Host-
    ├── ratelimit/                # Upstash Redis (Lua atômico) + fallback memória
    ├── transport/                # HttpTransport + demoTransport
    ├── orchestrator-e2e.ts       # VoidAccess + AIMap + pipeline de execução
    ├── logger.ts / metrics.ts / rbac.ts / recovery.ts
```

## 🔒 Garantias de segurança

- **Argon2id**: `m=19456 KB · t=2 · p=1 · outputLen=32` (OWASP 2024).
- **Dummy verify**: tempo de resposta δ-constante contra enumeração.
- **Refresh rotation**: tokens single-use com detecção de reuse → revogação em cascata da cadeia.
- **Cookies `__Host-sid` / `__Host-rid`**: HttpOnly + Secure + SameSite=Lax + Path=/.
- **CSP estrita** + `frame-ancestors 'none'` + sem `unsafe-eval` (apenas `wasm-unsafe-eval`).
- **Audit hash chain**: SHA-256 sobre `prev_hash + payload canônico`; triggers no DB rejeitam `UPDATE/DELETE`.
- **WORM**: NDJSON em S3 com `ObjectLockMode=COMPLIANCE` por 2555 dias.

## ✅ Verificação

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest
npm run verify      # typecheck + test
npm run build       # next build
```

## 📜 Licença

Restrito / Engenharia Core.