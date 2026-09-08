# Fase 6 (fatia 1) — Denormalização de `workspace_id` nas tabelas centrais do CRM

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Entregue no banco de TESTE (2026-07-10) |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) seção 4.3 |
| **Migration** | `supabase/migrations/20260803000000_fase6_denormaliza_workspace_id_crm.sql` |
| **Teste** | `__tests__/integration/fase6-denormalizacao-crm-workspace-id.test.ts` (3/3) |

## O que foi feito

`oportunidades`, `comunicacoes` e `vendas_fechamento` resolviam `workspace_id` só por **join** (`get_contact_workspace_id`/`get_opportunity_workspace_id`). Isso já era seguro para RLS, mas não escala bem em performance com muitas sub-contas e não permite associar um registro "órfão" (contato deletado) a um workspace. Esta fatia:

1. Adiciona a coluna `workspace_id UUID` (nullable no início) + índice nas 3 tabelas.
2. Faz backfill histórico via o mesmo join já usado pela RLS.
3. Trata órfãos (join retorna NULL) **somente** se houver exatamente 1 workspace ativo hoje (janela single-tenant) — com 2+ workspaces, a migration **falha com `RAISE EXCEPTION`** em vez de atribuir silenciosamente (nunca fallback silencioso, regra do plano-mãe).
4. Aperta para `NOT NULL` pelo padrão seguro: `CHECK ... NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` → drop da constraint auxiliar, com `lock_timeout = '2s'` — evita travar `ACCESS EXCLUSIVE` sob tráfego real (banco de teste está vazio nessas 3 tabelas hoje, mas a migration já nasce pronta para produção/staging com volume real).
5. Cria trigger `BEFORE INSERT` em cada tabela que preenche `workspace_id` automaticamente a partir do contato (ou, em `vendas_fechamento`, via `COALESCE(contato, oportunidade)`) — fecha o gap para linhas novas.

## O que **não** foi feito nesta fatia (decisão explícita, documentada)

- **RLS continua usando o join**, não foi reescrita para a coluna nova. A seção 3.3.2 do plano-mãe já documentava essa reescrita como **opcional** (melhoria de performance, não requisito de segurança — o join já é seguro). Reescrever as ~4 policies de agência por tabela (retrofit da migration `20260722000000`) fica como próximo passo, para não misturar duas mudanças de risco diferentes num único commit.
- **Backfill real de produção**: o banco de teste tinha 0 linhas nessas 3 tabelas — a migration foi validada estruturalmente (trigger + guard de órfãos), não contra volume real (~4.770 oportunidades, ~78k comunicações). Isso só é possível com o ambiente de staging (ainda não provisionado).
- **~20-25 tabelas de infraestrutura** (filas internas, logs de sync) e **~12 tabelas com `workspace_id` nullable** (`meta_ads_*`, `weekly_*`) continuam fora desta fatia — são o restante da Fase 6 (seção 4.2 do plano-mãe), a tratar em fatias futuras.

## Verificação

- Suite de integração: **313 passed | 10 todo** (era 310, 0 regressão).
- Re-query no banco de teste confirmou as 3 colunas `NOT NULL`.
- Teste dedicado confirma que o trigger preenche `workspace_id` corretamente em `oportunidades`, `comunicacoes` e `vendas_fechamento`, evitando disparar efeitos colaterais dos outros triggers dessas tabelas (sync GHL, webhook OpenClaw, auto-tag) via valores de guard (`data_lead_recebido` preenchido, `direction='outbound'`, `op_link_do_contrato_assinado` omitido).
