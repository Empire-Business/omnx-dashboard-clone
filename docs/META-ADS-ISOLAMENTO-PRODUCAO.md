# Runbook — Isolamento Multi-Tenant Meta Ads em Produção

| Campo | Valor |
|---|---|
| Status | Concluído em 2026-07-16 |
| Ambiente | Supabase `qzesffnkqgelmtfblzkr` |
| Responsável | Bruno Guzela (autorização explícita) |
| Migrations aplicadas | `20260924000000`, `20260924000001`, `20260924000002`, `20260924000003` |
| Edge functions re-deployadas | `sync-meta-ads` (v37), `sync-meta-ads-backfill` (v31) |

---

## 1. Pré-requisitos antes de aplicar

1. Banco de teste (`fgjbmdsucruvtpywyhhf`) com as migrations aplicadas e suite
   de integração passando.
2. Queries de auditoria da seção 5 de
   [`META-ADS-ISOLAMENTO-AUDITORIA.md`](META-ADS-ISOLAMENTO-AUDITORIA.md)
   retornando **0** em produção.
3. Snapshot dos dados críticos (opcional mas recomendado).

## 2. Comandos executados

```bash
# Linkar projeto em produção (já estava linkado)
supabase link --project-ref qzesffnkqgelmtfblzkr

# Verificar migrations pendentes
supabase migration list --linked

# Aplicar migrations
supabase db push --linked

# Re-deploy das edge functions
supabase functions deploy sync-meta-ads
supabase functions deploy sync-meta-ads-backfill
```

## 3. Validações pós-aplicação

```sql
-- NULLs
SELECT 'meta_ads_raw_insights' AS tabela, COUNT(*) FILTER (WHERE workspace_id IS NULL) AS nulos FROM meta_ads_raw_insights
UNION ALL
SELECT 'meta_ads_insights_breakdowns', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_insights_breakdowns
UNION ALL
SELECT 'meta_ads_account_daily', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_account_daily
UNION ALL
SELECT 'meta_ads_campaigns', COUNT(*) FILTER (WHERE workspace_id IS NULL) FROM meta_ads_campaigns;

-- Duplicatas
SELECT workspace_id, ad_id, date, COUNT(*) FROM meta_ads_insights GROUP BY 1,2,3 HAVING COUNT(*) > 1;
SELECT workspace_id, insights_id, region, country, COUNT(*) FROM meta_ads_insights_breakdowns GROUP BY 1,2,3,4 HAVING COUNT(*) > 1;
SELECT workspace_id, campaign_id, COUNT(*) FROM meta_ads_campaigns GROUP BY 1,2 HAVING COUNT(*) > 1;

-- Account_ids órfãos
SELECT DISTINCT i.account_id
FROM meta_ads_insights i
LEFT JOIN workspace_meta_ad_accounts m
  ON m.workspace_id = i.workspace_id AND m.account_id = i.account_id
WHERE m.account_id IS NULL;

-- Benchmarks
SELECT * FROM get_clara_benchmarks('7909d02a-4d15-46ea-a7b8-5debeb6e8351'::UUID, 'all');
```

## 4. Resultados em produção (2026-07-16)

| Verificação | Resultado |
|---|---|
| NULLs em tabelas críticas | 0 |
| Duplicatas nas novas UNIQUE | 0 |
| account_id órfão | 0 |
| `cpmql_avg` | R$ 82,39 |
| `spend_avg` | R$ 9.417,63 |
| Investimento 30d no dashboard | R$ 37.184,51 |
| Teste Playwright E2E | 1 passed |
| Email de teste Clara | `message_id: 6d7c9e01-bd7b-4575-ad8b-1a39f0f6af6b` |

## 5. Rollback (emergência)

Se algo quebrar, as migrations **não** podem ser revertidas diretamente (já
aplicadas). O rollback deve ser feito por novas migrations que:

1. Removam as constraints `UNIQUE` com `workspace_id`.
2. Tornem `workspace_id` nullable novamente.
3. Restaurem as policies RLS com `OR workspace_id IS NULL`.
4. Desativem os triggers de validação.

> Nunca edite uma migration já aplicada em produção.

## 6. Observações para novas contas Meta

Antes de conectar uma segunda conta Meta:

1. Cadastre a conta em `workspace_meta_ad_accounts`.
2. Confirme que o índice parcial `idx_workspace_meta_ad_accounts_active_account`
   ainda reflete a regra de negócio desejada.
3. Faça um sync de teste e valide que os dados aparecem apenas no workspace
   correto.
