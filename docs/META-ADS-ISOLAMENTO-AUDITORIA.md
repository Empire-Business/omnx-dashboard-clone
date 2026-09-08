# Auditoria de Isolamento Multi-Tenant — Meta Ads

| Campo | Valor |
|---|---|
| Status | Isolamento multi-tenant aplicado e validado em produção em 2026-07-16 |
| Atualizado em | 2026-07-16 BRT |
| Escopo | `meta_ads_insights`, `meta_ads_insights_breakdowns`, `meta_ads_account_daily`, `meta_ads_raw_insights`, `workspace_integration_credentials` |
| Dono da decisão | Bruno Guzela |

---

## 1. Resumo executivo (para leigo)

O dashboard mostrava investimento Meta Ads "zero" para semanas anteriores a 14/07/2026. A Clara, por causa disso, calculou um CPMQL médio histórico de **R$ 3,79** — número totalmente fora da realidade.

Causa real: **9.842 linhas da tabela `meta_ads_insights` (94%) estavam sem `workspace_id`**. Os relatórios semanais filtram investimento por workspace; quando o campo está vazio, o spend não entra no cálculo.

Foi feito um **backfill de emergência** atribuindo essas linhas ao workspace Default (única conta Meta ativa hoje). Após reprocessar 26 semanas de snapshots, os números voltaram a bater:

| Métrica | Antes (errado) | Depois (corrigido) |
|---|---|---|
| CPMQL médio histórico | R$ 3,79 | R$ 82,39 |
| Desvio padrão CPMQL | — | R$ 54,51 |
| Média de spend/semana | — | R$ 9.417,63 |
| Semanas com CPMQL | — | 27 |

> ⚠️ O backfill foi seguro **no estado atual** (apenas uma conta Meta ativa, do workspace Default). Ele NÃO é suficiente para abrir o isolamento para múltiplas contas/subcontas. Antes de conectar qualquer nova conta Meta, os gaps abaixo precisam ser fechados.

---

## 2. O que foi feito (ação corretiva)

### 2.1 Migration de backfill

`supabase/migrations/20260716000002_backfill_meta_ads_workspace_id.sql`:

- Preencheu `workspace_id` das 9.842 linhas `NULL` em `meta_ads_insights` com o workspace Default (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`).
- Tornou a coluna `workspace_id` `NOT NULL` (garantia de que novas linhas não cheguem órfãs).

### 2.2 Reprocessamento dos snapshots cohort

A edge function `compute-weekly-reports` foi acionada para reprocessar **26 semanas** de tráfego. Isso recalculou `meta_spend`, `cpmql`, `roas` e benchmarks usados pela Clara.

### 2.3 Reenvio do email de teste da Clara

Benchmark corrigido enviado para `bruno@aliancadealtovalor.com.br` via modelo `qwen/qwen3.6-plus`.

---

## 3. Gaps arquiteturais — STATUS: FECHADOS (2026-07-16)

As correções abaixo foram implementadas via migrations
`20260924000000_fix_meta_ads_tenant_isolation.sql` e
`20260924000001_add_meta_ads_account_workspace_trigger.sql`, testadas no banco
de teste com 536 testes de integração passando.

### 3.1 ✅ Tabela de mapeamento conta Meta ↔ workspace

Criada `workspace_meta_ad_accounts` com PK `(workspace_id, account_id)` e índice
único para contas ativas. Seed do workspace Default → `act_716772443330289`
incluído na migration.

### 3.2 ✅ `UNIQUE` constraints com `workspace_id`

- `meta_ads_insights`: `UNIQUE(workspace_id, ad_id, date)`
- `meta_ads_insights_breakdowns`: `UNIQUE(workspace_id, insights_id, region, country)`
- `meta_ads_campaigns`: `UNIQUE(workspace_id, campaign_id)`

Removido o `COALESCE(EXCLUDED.workspace_id, ...)` dos `ON CONFLICT`.

### 3.3 ✅ Políticas RLS fail-closed

Removida a cláusula `OR workspace_id IS NULL` das policies de `SELECT`. Agora
apenas `is_workspace_member(workspace_id)` ou
`can_access_workspace_via_agency(workspace_id)` podem ler.

### 3.4 ✅ `meta_ads_account_daily`

Constraint `CHECK (workspace_id IS NOT NULL)` validada e coluna tornada
`NOT NULL`.

### 3.5 ✅ `meta_ads_raw_insights` e `meta_ads_campaigns` com `NOT NULL`

`workspace_id` é obrigatório em `meta_ads_raw_insights` e `meta_ads_campaigns`.
`meta_ads_sync_log` continua permitindo NULL em registros legados (decisão
consciente: não perder histórico de auditoria; novos registros via
`registrar_sync_log` já recebem workspace_id).

### 3.6 ✅ `sync-meta-ads` fail-closed

A edge function agora valida que a `account_id` da credencial está cadastrada
em `workspace_meta_ad_accounts` antes de sincronizar. A function SQL
`processar_meta_ads_raw` aborta se `workspace_id` não estiver nos params.

### 3.7 ✅ Trigger de validação no banco

Triggers `BEFORE INSERT OR UPDATE` em `meta_ads_insights`,
`meta_ads_raw_insights`, `meta_ads_account_daily` e `meta_ads_campaigns`
garantem que a `account_id` só pode ser escrita se estiver vinculada ao
workspace em `workspace_meta_ad_accounts`. Reforço defensivo contra scripts,
APIs e inserts diretos.

---

## 4. O que foi implementado

Migrations:
- `20260924000000_fix_meta_ads_tenant_isolation.sql`
- `20260924000001_add_meta_ads_account_workspace_trigger.sql`
- `20260924000002_fix_meta_ads_raw_trigger_account.sql`

Edge functions ajustadas:
- `supabase/functions/sync-meta-ads/index.ts` — valida `workspace_meta_ad_accounts`.
- `supabase/functions/sync-meta-ads-backfill/index.ts` — mesma validação.
- `supabase/functions/sync-meta-ads/index.ts` — upsert de campaigns com
  `onConflict: 'workspace_id,campaign_id'`.

Testes:
- `__tests__/integration/meta-ads-isolation.test.ts` — 8 testes A→B.
- Suite completa de integração: **536 passed** (incluindo o teste corrigido
  `fase6-fatia2-meta-weekly-email-isolation.test.ts`).

## 5. Aplicação em produção (concluída em 2026-07-16)

As migrations foram aplicadas em produção após as verificações abaixo
retornarem zeros. As queries continuam úteis para auditoria periódica.

> ✅ Produção validada: 0 NULLs, 0 duplicatas, 0 account_ids órfãos.
> Edge functions `sync-meta-ads` (v37) e `sync-meta-ads-backfill` (v31)
> re-deployadas.

### Verificações obrigatórias em produção

```sql
-- 1. Confirme que workspace Default existe (semente da migration)
SELECT id, name FROM workspaces WHERE id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351';

-- 2. Confirme que NÃO há linhas sem workspace_id nas tabelas afetadas
SELECT 'meta_ads_raw_insights' AS tabela, COUNT(*) FILTER (WHERE workspace_id IS NULL) AS nulos FROM meta_ads_raw_insights
UNION ALL
SELECT 'meta_ads_insights_breakdowns', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_insights_breakdowns
UNION ALL
SELECT 'meta_ads_account_daily', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_account_daily
UNION ALL
SELECT 'meta_ads_campaigns', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_campaigns;
-- Esperado: 0 em todas

-- 3. Confirme que não há duplicatas que quebrariam as novas UNIQUE
SELECT workspace_id, ad_id, date, COUNT(*) FROM meta_ads_insights GROUP BY 1,2,3 HAVING COUNT(*) > 1;
SELECT workspace_id, insights_id, region, country, COUNT(*) FROM meta_ads_insights_breakdowns GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
SELECT workspace_id, campaign_id, COUNT(*) FROM meta_ads_campaigns GROUP BY 1,2 HAVING COUNT(*) > 1;
-- Esperado: 0 linhas em todas

-- 4. Liste account_ids em uso que ainda não estão em workspace_meta_ad_accounts
SELECT DISTINCT i.account_id
FROM meta_ads_insights i
LEFT JOIN workspace_meta_ad_accounts m
  ON m.workspace_id = i.workspace_id AND m.account_id = i.account_id
WHERE m.account_id IS NULL;
-- Esperado: vazio (ou preencher workspace_meta_ad_accounts antes da migration)
```

Se qualquer uma das verificações acima retornar dado problemático, **não aplique**
as migrations em produção antes de corrigir.

---

## 6. Decisões do dono

1. **Uma conta Meta pode pertencer a mais de um workspace?**
   - Implementação atual: `UNIQUE(account_id) WHERE is_active = true` — uma conta
     ativa só pode estar em um workspace. Se isso mudar no futuro, basta remover
     ou ajustar o índice parcial.
2. **Aplicação das migrations em produção:** aprovada e executada em
   2026-07-16. Auditoria da seção 5 retornou zeros; nenhum dado legado quebrou.

---

## 7. Verificações operacionais

### Confirme que não há mais insights órfãos

```sql
SELECT COUNT(*) AS sem_workspace
FROM meta_ads_insights
WHERE workspace_id IS NULL;
-- Esperado: 0
```

### Confirme que o spend cohort bate com o esperado

```sql
SELECT
  ws.year_week,
  ws.report_type,
  wt.meta_spend
FROM weekly_snapshots ws
JOIN weekly_trafego wt ON wt.snapshot_id = ws.id
WHERE ws.report_type = 'cohort'
  AND wt.module = 'trafego'
  AND wt.dimension = 'todos'
ORDER BY ws.year_week DESC
LIMIT 8;
```

Últimas 8 semanas devem mostrar spend positivo (não zero). Em produção
(2026-07-16) a semana 2026-W29 registrou R$ 6.554,41.

### Confirme benchmarks da Clara

```sql
SELECT * FROM get_clara_benchmarks(
  '7909d02a-4d15-46ea-a7b8-5debeb6e8351'::UUID,
  'all'
);
-- cpmql_avg deve estar próximo de R$ 82,39 (não R$ 3,79)
-- spend_avg deve estar próximo de R$ 9.417,63
```

---

## 8. Lições aprendidas

1. **Coluna nullable em tabela de fato = dado invisível silenciosamente.** O dashboard não quebrou, mas os números ficaram errados por semanas.
2. **Benchmarks da Clara são tão bons quanto os dados subjacentes.** A IA "pensou" corretamente, mas usou inputs distorcidos.
3. **Backfill sem mapeamento formal é aceitável apenas em single-tenant-lock.** Não repetir quando houver mais de uma conta Meta ativa.
4. **Policies `workspace_id IS NULL OR ...` mascaram bugs.** Depois do backfill, essa cláusula deve ser removida para forçar fail-closed.
5. **Validação no banco é a última linha de defesa.** Edge functions podem ser chamadas por scripts; triggers garantem isolamento mesmo em inserts diretos.

---

## 9. Referências cruzadas

- `docs/ROADMAP.md` — seção "Isolamento de investimento Meta Ads por subconta"
- `docs/UML.md` — seção "Meta Ads por sub-conta"
- `docs/NIVEIS-DE-ACESSO.md` — `workspace_meta_ad_accounts` segue o padrão owner/admin de leitura
- `supabase/migrations/20260716000002_backfill_meta_ads_workspace_id.sql`
- `supabase/migrations/20260705000002_add_workspace_id_meta_ads.sql`
- `supabase/migrations/20260823000000_fix_meta_ads_account_daily_tenant_isolation.sql`
- `supabase/migrations/20260924000000_fix_meta_ads_tenant_isolation.sql`
- `supabase/migrations/20260924000001_add_meta_ads_account_workspace_trigger.sql`
- `supabase/migrations/20260924000002_fix_meta_ads_raw_trigger_account.sql`
