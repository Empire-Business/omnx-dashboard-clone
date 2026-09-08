-- ============================================================================
-- Migration: 20261004000000_fix_cross_tenant_rls_p0_round2.sql
-- ============================================================================
-- P0 (rodada 2) — fecha os vazamentos cross-tenant encontrados na validação
-- adversarial de 2026-07-18 (docs/VALIDACAO-MULTITENANT.md), que a auditoria
-- de 2026-07-17 (migration 20260927000000) não cobriu.
--
-- MESMO PADRÃO da migration anterior: múltiplas políticas PERMISSIVE para o
-- mesmo comando são combinadas com OR pelo Postgres — uma política antiga
-- "membro de QUALQUER workspace" ao lado de uma política nova correta
-- ("membro DESTE workspace") anula a proteção da política nova. A correção é
-- sempre DROP da política antiga, nunca tentar "consertar" a antiga.
--
-- Achados desta rodada (introspecção ao vivo de pg_policies/information_schema
-- em produção, 2026-07-18/19, somente leitura):
--
--   tabela                     | problema                                    | classe
--   ----------------------------|---------------------------------------------|-------
--   contatos                   | SELECT sem filtro de workspace              | achado #1 do relatório
--   contatos                   | DELETE sem filtro de workspace              | achado #2 do relatório
--   oportunidades               | SELECT sem filtro de workspace              | achado #1
--   comunicacoes                | SELECT sem filtro de workspace              | achado #1
--   vendas_fechamento           | SELECT sem filtro de workspace              | achado #1
--   meta_ads_raw_insights       | SELECT sem filtro (redundante — já tem 2   | achado #1 (tabela extra)
--                                 políticas corretas coexistindo)             |
--   meta_ads_backfill_controle  | única política SELECT não filtra (tabela   | achado novo — sem
--                                 nunca ganhou workspace_id)                  | workspace_id nenhum
--   meta_ads_backfill_log       | idem, via controle_id -> controle          | idem
--   ghl_opp_reconcile_runs      | policies authenticated usam is_*_any() —   | achado novo — função
--                                 admin/membro de QUALQUER workspace          | sem parâmetro de linha
--                                 lê/escreve/apaga runs de reconciliação      |
--                                 de QUALQUER tenant (run é sistêmico, não    |
--                                 pertence a 1 workspace — não dá pra          |
--                                 "consertar" com workspace_id; a correção é  |
--                                 remover o acesso authenticated, igual às    |
--                                 tabelas-irmãs contact_opp_sync_queue e      |
--                                 ghl_conversations_sync_log, que já são      |
--                                 service_role-only)                         |
--   ghl_custom_field_mappings   | idem (is_*_any()) — tabela legada          | achado novo — mesma
--                                 pré-multi-tenant (PK=logical_name, sem      | classe de função
--                                 workspace_id), superada por                |
--                                 ghl_field_mappings (essa sim workspace-     |
--                                 scoped); ainda lida por                    |
--                                 sync-contact-attribution via service_role  |
--
-- Revisado e NÃO alterado nesta migration (falso-positivo confirmado por
-- inspeção de conteúdo, não só por nome):
--   - ai_embeddings / ai_doc_chunks / ai_doc_index_status / ghl_field_mapping_templates:
--     conteúdo é documentação do próprio repositório (ex.: chunks de CLAUDE.md)
--     e catálogo de templates de mapeamento GHL — dado de referência global,
--     sem PII, sem workspace_id por design. Confirmado lendo `ai_doc_chunks`
--     ao vivo (doc_path = 'CLAUDE.md', etc.) antes de decidir não mexer.
--   - agency_workspaces_read (is_agency_member(agency_id)): já é escopada por
--     agência corretamente — não é "qualquer agência", é a agência do
--     parâmetro da linha.
--
-- Estratégia:
--   1. Tabelas que JÁ têm política correta coexistindo (contatos, oportunidades,
--      comunicacoes, vendas_fechamento, meta_ads_raw_insights): DROP só da
--      política antiga/redundante. A política correta cobre o caso legítimo.
--   2. Tabelas sem workspace_id nenhum, mas com dado por-workspace de verdade
--      (meta_ads_backfill_controle/log): ADD COLUMN + backfill (mesma
--      justificativa Single-Tenant Lock da migration anterior — só existe
--      1 workspace real com dado Meta Ads hoje) + trigger BEFORE INSERT +
--      policy correta.
--   3. Tabelas sistêmicas sem conceito de tenant por linha, cujas políticas
--      "_any()" nunca vão poder ser corrigidas com workspace_id porque o dado
--      não pertence a 1 tenant (ghl_opp_reconcile_runs, ghl_custom_field_mappings):
--      DROP das políticas authenticated, deixando service_role-only — mesmo
--      padrão já usado pelas tabelas-irmãs (contact_opp_sync_queue,
--      ghl_conversations_sync_log, webhook_unresolved).
--
-- Idempotente: DROP POLICY IF EXISTS / ADD COLUMN IF NOT EXISTS /
-- CREATE OR REPLACE FUNCTION / CREATE INDEX IF NOT EXISTS. Re-aplicável sem
-- efeito colateral.
--
-- NÃO aplicada em produção por esta sessão — testada em ambiente de validação
-- (ver docs/VALIDACAO-MULTITENANT.md, seção "Rodada 2"). Aplicação em
-- produção é decisão do dono (runbook: node scripts/apply-migration.mjs
-- 20261004000000_fix_cross_tenant_rls_p0_round2.sql --allow-destructive,
-- após backup/snapshot — contém DROP POLICY).
-- ============================================================================

SET search_path = public, pg_catalog;
SET lock_timeout = '10s';
SET statement_timeout = '5min';

-- ============================================================================
-- 1. contatos — SELECT sem filtro (achado #1) + DELETE sem filtro (achado #2)
--    Políticas corretas que permanecem: workspace_members_select_contatos,
--    agencia_select_contatos, workspace_admins_delete_contatos,
--    agencia_delete_contatos.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_contatos ON public.contatos;
DROP POLICY IF EXISTS admins_delete_contatos ON public.contatos;

-- ============================================================================
-- 2. oportunidades — SELECT sem filtro (achado #1)
--    Política correta que permanece: workspace_members_select_oportunidades,
--    agencia_select_oportunidades.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_oportunidades ON public.oportunidades;

-- ============================================================================
-- 3. comunicacoes — SELECT sem filtro (achado #1)
--    Política correta que permanece: workspace_members_select_comunicacoes,
--    agencia_select_comunicacoes.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_comunicacoes ON public.comunicacoes;

-- ============================================================================
-- 4. vendas_fechamento — SELECT sem filtro (achado #1)
--    Política correta que permanece: workspace_members_select_vendas_fechamento,
--    agencia_select_vendas_fechamento.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_vendas_fechamento ON public.vendas_fechamento;

-- ============================================================================
-- 5. meta_ads_raw_insights — SELECT redundante sem filtro (achado #1, tabela
--    extra citada no relatório). Já tem workspace_id NOT NULL e DUAS
--    políticas corretas coexistindo ("Workspace members can view
--    meta_ads_raw_insights" e agencia_select_meta_ads_raw_insights) — só
--    remove a terceira, redundante e larga.
-- ============================================================================
DROP POLICY IF EXISTS workspace_members_read_meta_ads_raw_insights ON public.meta_ads_raw_insights;

-- ============================================================================
-- 6. meta_ads_backfill_controle (57 linhas) — nunca ganhou workspace_id.
--    Sem link relacional para outro tenant: todo backfill Meta Ads hoje é do
--    unico workspace real com integracao Meta Ads (Single-Tenant Lock) —
--    mesma justificativa documentada na migration 20260927000000 para
--    maquina_de_conteudo/bot_context. Nunca copiar este padrao para tabela
--    com mapeamento relacional real.
-- ============================================================================
ALTER TABLE public.meta_ads_backfill_controle
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.meta_ads_backfill_controle
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.meta_ads_backfill_controle WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'meta_ads_backfill_controle: backfill incompleto';
    END IF;
END $$;

ALTER TABLE public.meta_ads_backfill_controle ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_backfill_controle_workspace_id_idx
    ON public.meta_ads_backfill_controle(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_meta_ads_backfill_controle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        -- Single-Tenant Lock: unica conta Meta Ads da instancia hoje.
        NEW.workspace_id := (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_meta_ads_backfill_controle ON public.meta_ads_backfill_controle;
CREATE TRIGGER tr_set_workspace_id_meta_ads_backfill_controle
    BEFORE INSERT ON public.meta_ads_backfill_controle
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_meta_ads_backfill_controle();

DROP POLICY IF EXISTS workspace_members_read_meta_ads_backfill_controle ON public.meta_ads_backfill_controle;
CREATE POLICY workspace_members_read_meta_ads_backfill_controle
    ON public.meta_ads_backfill_controle FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 7. meta_ads_backfill_log (4.222 linhas) — backfill via controle_id -> 6.
-- ============================================================================
ALTER TABLE public.meta_ads_backfill_log
    ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

UPDATE public.meta_ads_backfill_log l
SET workspace_id = c.workspace_id
FROM public.meta_ads_backfill_controle c
WHERE l.controle_id = c.id
  AND l.workspace_id IS NULL;

-- Orfaos (controle_id nulo ou apagado): mesma justificativa Single-Tenant Lock.
UPDATE public.meta_ads_backfill_log
SET workspace_id = (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
WHERE workspace_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.meta_ads_backfill_log WHERE workspace_id IS NULL) THEN
        RAISE EXCEPTION 'meta_ads_backfill_log: backfill incompleto — % linhas sem workspace_id',
            (SELECT count(*) FROM public.meta_ads_backfill_log WHERE workspace_id IS NULL);
    END IF;
END $$;

ALTER TABLE public.meta_ads_backfill_log ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS meta_ads_backfill_log_workspace_id_idx
    ON public.meta_ads_backfill_log(workspace_id);

CREATE OR REPLACE FUNCTION public.set_workspace_id_meta_ads_backfill_log()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := COALESCE(
            (SELECT c.workspace_id FROM public.meta_ads_backfill_controle c WHERE c.id = NEW.controle_id),
            (SELECT id FROM public.workspaces ORDER BY created_at ASC LIMIT 1)
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_meta_ads_backfill_log ON public.meta_ads_backfill_log;
CREATE TRIGGER tr_set_workspace_id_meta_ads_backfill_log
    BEFORE INSERT ON public.meta_ads_backfill_log
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_meta_ads_backfill_log();

DROP POLICY IF EXISTS workspace_members_read_meta_ads_backfill_log ON public.meta_ads_backfill_log;
CREATE POLICY workspace_members_read_meta_ads_backfill_log
    ON public.meta_ads_backfill_log FOR SELECT TO authenticated
    USING (public.is_workspace_member(workspace_id));

-- ============================================================================
-- 8. ghl_opp_reconcile_runs (62 linhas) — dado SISTÊMICO, não pertence a 1
--    workspace (mode/scope/source mostram runs "all_contacts" que varrem
--    TODOS os workspaces numa unica execucao). Nao existe workspace_id
--    correto para atribuir (diferente do caso 6/7, aqui nao ha 1 tenant
--    "dono" — inventar um seria mentir sobre a semantica do dado). A
--    correcao e remover o acesso authenticated (que hoje usa is_*_any(),
--    ou seja, admin/membro de QUALQUER workspace le/escreve/apaga runs de
--    QUALQUER tenant), deixando service_role-only — mesmo padrao ja usado
--    pelas tabelas-irmas de fila/log operacional (contact_opp_sync_queue,
--    ghl_conversations_sync_log, webhook_unresolved). O unico consumidor,
--    a edge function reconcile-contact-opportunities, roda com service_role
--    (guard de Classe B, ja documentado) e continua funcionando sem
--    alteracao.
-- ============================================================================
DROP POLICY IF EXISTS workspace_admins_delete_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS workspace_admins_insert_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS workspace_members_select_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS workspace_admins_update_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs;

-- ============================================================================
-- 9. ghl_custom_field_mappings (10 linhas) — tabela legada pre-multi-tenant
--    (PK = logical_name, nunca teve workspace_id), superada por
--    ghl_field_mappings (essa sim workspace-scoped, ver GHL-CONFIG-UI.md).
--    Mesmo defeito de funcao is_*_any(): admin/membro de QUALQUER workspace
--    pode ler/escrever/apagar este config global compartilhado. Unico
--    consumidor real (sync-contact-attribution) roda com service_role.
--    Correcao: mesmo padrao do item 8 — remove acesso authenticated.
-- ============================================================================
DROP POLICY IF EXISTS workspace_admins_delete_ghl_custom_field_mappings ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS workspace_admins_insert_ghl_custom_field_mappings ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS workspace_members_select_ghl_custom_field_mappings ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS workspace_admins_update_ghl_custom_field_mappings ON public.ghl_custom_field_mappings;

NOTIFY pgrst, 'reload schema';
RESET lock_timeout;
RESET statement_timeout;
