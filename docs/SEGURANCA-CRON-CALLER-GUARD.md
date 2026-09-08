# Guard de chamador autorizado nas edge functions de cron

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Implementado e validado no banco de TESTE (`fgjbmdsucruvtpywyhhf`) |
| **Branch** | `fix/edge-functions-cron-role-guard` |
| **Origem do achado** | Auditoria de segurança da Fase 3 multi-tenant (`docs/ROADMAP-MULTI-TENANT.md`, log de execução 2026-07-11) |

---

## 1. O achado

As edge functions chamadas periodicamente por `pg_cron` (via `net.http_post`) não
validavam o **papel** de quem as chamava — só o `verify_jwt` padrão do Supabase, que
apenas confirma que o token é um JWT assinado pelo projeto. A **anon key** (pública,
embutida no bundle JS do frontend) e a **service_role key** são ambas JWTs válidos
para esse checador. Sem um guard adicional, **qualquer pessoa com a anon key** podia
chamar diretamente essas functions e disparar ações administrativas: sync em massa
de contatos/oportunidades, reconciliação, envio de e-mail semanal, etc. — fora do
controle de frequência do cron e sem qualquer autorização real.

Das 20 edge functions cron-invocadas, **11 já enviavam `Authorization: Bearer
service_role_key`** (proteção acidental, não por design). **9 enviavam `anon_key`**:
`compute-weekly-reports`, `enviar-email-contrato-assinado`, `send-weekly-report-email`,
`sync-appointment-dates`, `sync-contact-attribution`, `sync-contact-tasks`,
`sync-ghl-users`, `sync-opp-pipelines`, `sync-opp-sdr`.

## 2. A correção

### 2.1 Guard genérico (`supabase/functions/_shared/require-service-role.ts`)

- `require-service-role-logic.ts` — módulo **puro** (sem import Deno/esm), testável
  em Node: `isServiceRoleCaller(authHeader, serviceRoleKey)` compara o token do
  header `Authorization` contra a `service_role_key` em **tempo constante**
  (reaproveita `secretsEqual` de `webhook-ghl-auth.ts`). Fail-closed: sem
  `service_role_key` configurada, nunca autoriza.
- `require-service-role.ts` — wrapper fino Deno: lê `SUPABASE_SERVICE_ROLE_KEY`/
  `SB_SERVICE_ROLE_KEY` do ambiente e expõe `requireServiceRoleCaller(req,
  corsHeaders)` (retorna `Response` 401 pronta pra devolver, ou `null` se
  autorizado) e `isServiceRoleCaller(req)` (booleano, para functions com um
  segundo caminho de autorização — ver 2.3).

### 2.2 As 20 edge functions (guard estrito — só service_role)

`ghl-api-worker`, `discover-agency-locations`, `reconcile-contact-opportunities`,
`sync-ad-permalinks`, `sync-contact-opportunities`, `sync-contact-tags`,
`sync-ghl-conversations`, `sync-meta-ads`, `sync-meta-ads-backfill`,
`notion-creatives-sync`, `sync-opp-dates`, `compute-weekly-reports`,
`enviar-email-contrato-assinado`, `sync-appointment-dates`,
`sync-contact-attribution`, `sync-contact-tasks`, `sync-opp-pipelines`,
`sync-opp-sdr` chamam `requireServiceRoleCaller(req, corsHeaders)` logo após o
tratamento do `OPTIONS`/preflight e devolvem a `Response` 401 se o guard não
passar.

### 2.3 As 2 edge functions dual-mode (service_role OU usuário autenticado)

- **`sync-ghl-users`**: além do cron, aceitava um checador próprio de
  `x-cron-secret`/`CRON_SECRET` que era **inerte** (o cron nunca enviava esse
  header) e um caminho de usuário `owner`/`admin` autenticado. Consolidado: o
  checador de `CRON_SECRET` foi substituído por `isServiceRoleCaller(req)`; o
  caminho de usuário autenticado foi preservado.
- **`send-weekly-report-email`**: chamada tanto pelo cron quanto pelo botão manual
  de teste em `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` (usuário autenticado).
  Tinha um checador de `_internal_secret`/`BOT_INTERNAL_SECRET` também **inerte**
  (o cron nunca enviava esse campo no body). Substituído por
  `isServiceRoleCaller(req)`; o caminho de usuário autenticado via
  `supabase.auth.getUser()` foi preservado.

### 2.4 Migration `20260808000000_fix_cron_caller_service_role.sql`

Reescreve o lado SQL dos 8 crons que ainda dependiam de `anon_key`/`app_config`
(a nona function apontada originalmente, `enviar-email-contrato-assinado`, acabou
sendo um achado à parte — ver seção 4) para enviarem
`Authorization: Bearer <service_role_key>` via `get_secret('service_role_key')`.
Sem esta migration, os crons corrigidos quebrariam com 401 assim que o guard fosse
para produção — os dois lados (guard na function + header no cron) andam juntos
no mesmo commit.

## 3. Teste estrutural (`__tests__/integration/cron-caller-guard.test.ts`)

Grep puro nas fontes (sem Deno/rede):

1. Para cada uma das 20 functions conhecidas: confirma que `index.ts` existe,
   importa `require-service-role.ts` e chama `requireServiceRoleCaller(req` ou
   `isServiceRoleCaller(req`.
2. Descobre a **lista completa** de rotas de edge function referenciadas em
   qualquer migration (`supabase/migrations/*.sql`) e falha se encontrar uma
   function nova, com pasta existente, chamada por cron e **sem** o guard — isso
   é o que impede a regressão (uma function de cron nova nascer sem o guard).
   Functions órfãs conhecidas (pasta não existe mais: `reconcile-vendas-fechamento`,
   `stevo-calls-sync`, `sdr-ia-orchestrator`) ficam numa allowlist documentada.

## 4. Achados colaterais (não bloqueantes, ações separadas)

- **`enviar-email-contrato-assinado` está órfã**: nenhuma função SQL no banco de
  teste chama mais essa URL — o disparo de e-mail de contrato assinado foi
  substituído pelo sistema genérico `outbound_webhooks` por workspace (Fase 2/
  fatia 7). O guard foi aplicado mesmo assim (defesa em profundidade), mas não há
  SQL de cron para corrigir. Decisão de remover/religar: tarefa separada.
- **`sync-ghl-users-cron` já estava quebrado antes desta correção**: enviava body
  `{}` sem `workspace_id`, mas a function exige `workspace_id` fail-closed desde a
  Fase 2 — toda execução (4x/dia) retornava erro. Corrigido nesta mesma migration:
  `sync_ghl_users_job()` agora percorre os workspaces com credencial `provider='ghl'`
  cadastrada (mesmo padrão dos crons Meta/Notion por workspace).
- **Botão manual "Sync" do Meta Ads** (`eb-dash2/src/components/dashboard/SyncBanner.tsx`)
  chama `sync-meta-ads` sem `workspace_id` — já retornava 400 antes desta mudança
  (bug pré-existente da Fase 8, não uma regressão desta branch). Tarefa separada.
- **4 crons órfãos** (`reconcile-vendas-fechamento-cron`, `stevo-process-att1/2/3`)
  apontam para edge functions que não existem mais no repositório — 404 silencioso,
  sem risco de segurança prático, mas dívida técnica. Tarefa separada.

## 5. Validação

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
# 346 passed | 10 todo (0 regressão)
cd eb-dash2 && npx tsc -b   # limpo
deno check <cada index.ts alterado>   # mesmos erros pré-existentes de antes (SupabaseClient generic), 0 novos
```

Migration aplicada e verificada no banco de teste (`fgjbmdsucruvtpywyhhf`) via
`psql` direto (regra 1 do handoff multi-tenant — nunca produção).
