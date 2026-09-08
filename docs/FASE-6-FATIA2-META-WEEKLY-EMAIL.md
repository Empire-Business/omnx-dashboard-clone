# Fase 6 (fatia 2) — `workspace_id` em `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_logs`, `weekly_email_schedules`

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Entregue no banco de TESTE (2026-07-11) |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) seção 4.2/4.3 |
| **Migration** | `supabase/migrations/20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql` |
| **Teste** | `__tests__/integration/fase6-fatia2-meta-weekly-email-isolation.test.ts` (7/7) + `rls-fixture.test.ts` (10/10) + `workspace-isolation.test.ts` (132/132) |

## Contexto

`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md` e a migration `20260811000000` documentaram 4 tabelas como gap conhecido do purge/manifesto LGPD: `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_logs`, `weekly_email_schedules` — nenhuma tinha `workspace_id`. Esta fatia fecha os 4 gaps.

`meta_ads_backfill_controle`/`meta_ads_backfill_log` **ficam de fora, deliberadamente** — decisão do dono já registrada (`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`, `docs/HANDOFF-FASE-4-BYOK.md`): `sync-meta-ads-backfill` é residual de-scoped (carga histórica de uso raro, grava `workspace_id NULL`), "não mexer salvo pedido". Nenhum pedido nesta sessão para reabrir essa decisão.

`meta_ads_region_mapping` também não entra — não é gap de isolamento, é tabela de referência estática (UF → região do Brasil), mesma natureza de `estado_uf_normalizacao`. Reclassificada na fixture de `infra_service_role` para `global_intentional`.

## Achado real 1 — bug funcional, não só gap de isolamento

`supabase/functions/sync-ad-permalinks/index.ts` já escrevia `workspace_id` em **todo** upsert desde a Fase 2 (fatia 8), mas a coluna nunca existiu em `meta_ads_permalinks`. Ou seja: todo upsert real dessa function falhava com `column "workspace_id" does not exist` — o sync de permalinks estava quebrado para 100% dos workspaces, não era só um risco de isolamento latente. Corrigido pela mesma migration que fecha o gap de segurança.

## Achado real 2 — policies de SELECT não filtravam por linha

Ao inspecionar as policies existentes antes de expor essas 4 tabelas na suite de isolamento (prática desta sessão: nunca declarar uma tabela "coberta" sem checar a policy real), duas ficaram mais graves do que o esperado:

- `meta_ads_campaigns`/`meta_ads_permalinks`: a policy de SELECT checava só "é membro ativo de **algum** workspace", sem comparar `wm.workspace_id` com a linha. Qualquer usuário autenticado de qualquer workspace lia **todas** as linhas.
- `weekly_email_logs`/`weekly_email_schedules`: a policy de SELECT/INSERT/UPDATE/DELETE checava só `auth.role() = 'authenticated'` — **nenhum** filtro de workspace. Qualquer usuário autenticado podia ler/editar/apagar o agendamento de relatório e o log (com `recipient_emails`, PII) de **qualquer** workspace.

Isso nunca vazou nada até agora porque as tabelas não tinham `workspace_id` (dado não era diferenciável por tenant). Ao denormalizar a coluna nesta fatia, a policy antiga passaria a vazar de verdade — corrigida na mesma migration, antes de declarar a tabela "isolada" na fixture. Padrão usado: `EXISTS (... wm.workspace_id = <tabela>.workspace_id AND wm.is_active) `, igual ao já usado em `ads_campaigns`/`contatos`, com `(SELECT auth.uid())` para evitar reavaliação por linha (mesmo fix de performance da migration `20260802000000`).

## Backfill — join real, não só o fallback single-workspace

Diferente de `stevo_whatsapp_calls` (fatia adicional, sem NENHUMA coluna de correlação), estas 4 tabelas tinham caminho de join real:

- `meta_ads_permalinks.ad_id` → `meta_ads_insights.ad_id` (já tem `workspace_id` desde a Fase 2). Só resolve automaticamente quando o `ad_id` aparece em **exatamente 1** workspace distinto — caso contrário cai no fallback.
- `weekly_email_schedules.created_by` → `workspace_members.user_id`, só quando o usuário pertence a **exatamente 1** workspace.
- `weekly_email_logs.schedule_id` → `weekly_email_schedules.workspace_id` (depois que a tabela acima já foi resolvida).
- `meta_ads_campaigns`: sem coluna de correlação (nunca teve writer no código — `grep` confirma que só aparece em migrations/scripts de purge/export). Só o fallback single-workspace.

Fallback (todas as 4, para o residual sem join): se existe **exatamente 1** workspace ativo, atribui automaticamente; com 2+, `RAISE EXCEPTION` força resolução manual — nunca atribuição silenciosa (mesma regra das fatias anteriores). Trigger `BEFORE INSERT` replica a mesma lógica de resolução para linhas novas.

## Fecha o gap na Fase 8 (LGPD)

`export_workspace_data_manifest` e `purge_workspace_data` (recriadas na mesma migration) passam a cobrir as 4 tabelas por coluna direta e saem de `_gaps_nao_isolaveis_hoje`/`_gaps_nao_purgados_nesta_funcao`. Só restam `meta_ads_backfill_controle/log` (residual de-scoped, decisão do dono) e `audit_log` (residual, best-effort).

## Verificação

- Migration aplicada via `supabase db query --linked -f <arquivo>` (o histórico `supabase_migrations.schema_migrations` do projeto de teste está vazio — mesma limitação de reprodutibilidade documentada em `docs/BASELINE-REPRODUCIBILIDADE.md` — então a aplicação incremental é feita executando o SQL da migration diretamente, e não via `db push`). Reaplicada uma segunda vez para confirmar idempotência (`IF NOT EXISTS`/`CREATE OR REPLACE`/`DROP POLICY IF EXISTS`) — passou limpo.
- `rls-fixture.test.ts`: **10/10** — universo agora 83 tabelas com `workspace_id` (era 79) + 37 sem (era 41).
- `workspace-isolation.test.ts`: **132/132** — as 4 tabelas entram na prova forte genérica por coluna.
- `fase6-fatia2-meta-weekly-email-isolation.test.ts` (novo, **7/7**): seed real (não só tabela vazia) prova (a) o trigger resolve `workspace_id` via JOIN quando o caller não informa a coluna, (b) usuário A não vê linha de B em nenhuma das 4 tabelas — inclusive `recipient_emails` (PII) — e (c) `WITH CHECK` bloqueia tentativa de fixar `workspace_id` de outro workspace no INSERT.
- `fase8-workspace-purge.test.ts`: **5/5**, sem regressão (manifesto/purge continuam corretos com as novas colunas).
