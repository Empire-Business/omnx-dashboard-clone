# Limpeza de crons órfãos e código morto (pós-guard de segurança)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Implementado e validado no banco de TESTE (`fgjbmdsucruvtpywyhhf`) |
| **Branch** | `chore/remove-orphan-crons-and-dead-code` |
| **Origem** | 3 achados colaterais registrados durante `docs/SEGURANCA-CRON-CALLER-GUARD.md` |

---

## 1. `enviar-email-contrato-assinado` — removida

**Confirmação antes de remover:** nenhuma função SQL no banco de teste chama mais
`/functions/v1/enviar-email-contrato-assinado` (`pg_get_functiondef` de todas as
functions em `public` não contém a string), nenhum `cron.job` a referencia, e não
há chamada no frontend (`eb-dash2/src`). O disparo de e-mail de contrato assinado
foi substituído pelo sistema genérico `outbound_webhooks` por workspace (Fase 2/
fatia 7) — a function ficou no repositório sem nenhum chamador desde então.

**O que foi feito:**
- `supabase/functions/enviar-email-contrato-assinado/` removida por completo.
- `__tests__/integration/cron-caller-guard.test.ts`: removida da lista de 20
  functions cron-guardadas (agora 19) e adicionada à allowlist
  `KNOWN_ORPHAN_CRON_TARGETS` (migrations antigas ainda citam o nome — histórico
  imutável — então o teste estrutural precisa saber que essa referência é
  esperada e não uma regressão).
- `RESEND_API_KEY` **não** foi removida do ambiente — ainda usada por
  `send-weekly-report-email` e `invite-user`.

## 2. 4 crons órfãos — desagendados

Achado durante o mapeamento do item 1 do guard de segurança: 4 jobs em `cron.job`
chamavam edge functions que não existem no repositório (404 silencioso a cada
execução):

| Job | Function inexistente |
|---|---|
| `reconcile-vendas-fechamento-cron` | `reconcile-vendas-fechamento` |
| `stevo-process-att1` | `stevo-calls-sync` (instance=att1) |
| `stevo-process-att2` | `stevo-calls-sync` (instance=att2) |
| `stevo-process-att3` | `stevo-calls-sync` (instance=att3) |

Migration `20260810000000_remove_orphan_crons_and_dead_functions.sql`:
`cron.unschedule()` idempotente dos 4 (`WHERE EXISTS` antes de cada chamada — não
falha se algum já tiver sido removido manualmente). Aplicada e verificada no banco
de teste: `cron.job` caiu de 32 para 28 linhas, 0 órfãos restantes.

`stevo-process-att*` chamavam via `net.http_get` **sem nenhum header de
autenticação** — não era só código morto, era uma chamada completamente aberta
(qualquer um com a URL do projeto Supabase podia acionar o 404, sem nenhum risco
de dado mas ruído/custo de invocação). `reconcile-vendas-fechamento-cron` ainda
enviava `anon_key` (o único job restante com esse padrão depois do item 1 do guard
de segurança) — removido junto.

## 3. Botão manual "Sync" do Meta Ads — removido

**Diagnóstico:** `SyncBanner.tsx` chamava `supabase.functions.invoke('sync-meta-ads')`
sem `workspace_id` — a function exige esse campo (fail-closed, Fase 2/Fatia 8) desde
antes desta sessão, então o botão **já retornava erro 400 toda vez que alguém
clicava**, bug pré-existente não relacionado ao guard de segurança. Depois do item 1
do guard (`docs/SEGURANCA-CRON-CALLER-GUARD.md`), `sync-meta-ads` também passou a
exigir `Authorization: Bearer <service_role_key>` — o botão (chamado com JWT de
usuário via `supabase.functions.invoke`) nunca mais teria como funcionar mesmo que o
bug do `workspace_id` fosse corrigido, a menos que se construísse uma function
intermediária autenticada por usuário — feature nova, fora de escopo de uma limpeza.

**Decisão:** remover o botão. O sync horário via cron (autenticado por
`service_role_key`, uma vez por workspace com credencial Meta) já cobre a
necessidade; não há perda de funcionalidade real (o botão já não funcionava).

**O que foi feito:**
- `SyncBanner.tsx`: removidos `handleSync`, o estado `syncing`, o botão e a prop
  `onRefresh`. O componente virou puramente informativo (mostra a última
  sincronização/status/registros, lidos de `meta_ads_sync_log`).
- `FilterBar.tsx` / `DashboardPage.tsx` / `useTrafego.ts`: removida a prop/callback
  `refreshSyncStatus` (só existia para o botão — nada mais a chamava; `syncStatus`
  em si continua populado normalmente pelo carregamento inicial de
  `useTrafego`, sem relação com o botão removido).

## 4. Validação

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
# 357 passed | 10 todo (era 358 — -1 esperado: removida 1 sub-prova da function excluída)
cd eb-dash2 && npx tsc -b && npx vitest run --exclude "**/.claude/**"
# tsc limpo; 22 passed (unitário/componente, 0 regressão)
```
