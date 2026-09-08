-- ============================================================================
-- FASE 6 (fatia 2) — workspace_id em meta_ads_campaigns, meta_ads_permalinks,
-- weekly_email_logs, weekly_email_schedules.
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 4.2/4.3) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md secao 5
--
-- Fecha os 4 gaps que a Fase 8 (migrations 20260811000000/20260812000000) documentou
-- como "_gaps_nao_isolaveis_hoje" no manifesto/purge de LGPD, e que a analise de
-- 2026-07-11 confirmou:
--
--  * meta_ads_permalinks: ACHADO REAL — supabase/functions/sync-ad-permalinks/index.ts
--    ja escreve `workspace_id` em CADA upsert (linha "workspace_id: workspaceId" no
--    record) desde a Fase 2/fatia 8, mas a coluna NUNCA existiu na tabela. Ou seja,
--    todo upsert real dessa function falha hoje com "column workspace_id does not
--    exist" — nao e so um gap de isolamento, e um bug funcional que quebra o sync de
--    permalinks para 100% dos workspaces. Esta migration corrige os dois de uma vez.
--
--  * meta_ads_campaigns: sem NENHUM writer no codigo atual (grep confirma: so
--    aparece em migrations/purge/export scripts) — tabela morta funcionalmente, mas
--    ja cadastrada como gap do purge/manifesto da Fase 8. Ganha a coluna por
--    consistencia e para nao reabrir o gap se um writer futuro aparecer.
--
--  * weekly_email_logs / weekly_email_schedules: mecanismo de relatorio semanal por
--    e-mail (PII de destinatarios em weekly_email_logs.recipient_emails). Backfill via
--    join real (created_by -> workspace_members; schedule_id -> weekly_email_schedules),
--    nao so pelo fallback "1 workspace so" usado em stevo_whatsapp_calls (que nao tinha
--    NENHUMA coluna de join).
--
-- meta_ads_backfill_controle / meta_ads_backfill_log: DELIBERADAMENTE FORA DESTA
-- MIGRATION. Decisao do dono ja registrada em docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md
-- e docs/HANDOFF-FASE-4-BYOK.md: sync-meta-ads-backfill (a function que escreve nessas
-- 2 tabelas de controle) e "residual de-scoped" — carga historica de uso raro, o dono
-- priorizou o fluxo pra frente (100% isolado) e pediu para "nao mexer salvo pedido".
-- Nao ha pedido nesta sessao para reabrir essa decisao.
--
-- meta_ads_region_mapping: NAO e um gap de isolamento — e tabela de referencia global
-- (mapeamento estatico UF -> regiao do Brasil, mesma natureza de
-- estado_uf_normalizacao, ja em GLOBAL_INTENTIONAL_TABLES). Nao ganha workspace_id;
-- a fixture desta sessao ja a move para a categoria correta (global_intentional).
--
-- Mesmo padrao de seguranca das duas migrations anteriores da Fase 6: coluna
-- nullable -> backfill (aqui, via JOIN real quando existe coluna de correlacao,
-- com fallback fail-closed de "1 workspace so" para o residual sem join) ->
-- NOT NULL pelo padrao seguro (NOT VALID -> VALIDATE -> SET NOT NULL) -> trigger
-- BEFORE INSERT que fecha o gap pra linhas novas com a MESMA logica de resolucao.
--
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- Helper generico: resolve workspace_id quando existe EXATAMENTE 1 workspace
-- ativo hoje. Reusado pelos 4 backfills/triggers desta migration (mesmo
-- fallback ja usado em stevo_whatsapp_calls, sem duplicar a logica inline).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolve_single_active_workspace()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_count integer;
    v_id uuid;
BEGIN
    SELECT count(*) INTO v_count FROM public.workspaces;
    IF v_count = 1 THEN
        SELECT id INTO v_id FROM public.workspaces LIMIT 1;
        RETURN v_id;
    END IF;
    RETURN NULL;
END;
$$;

-- ============================================================================
-- 1. meta_ads_campaigns — sem coluna de join; so o fallback single-workspace.
-- ============================================================================
ALTER TABLE public.meta_ads_campaigns ADD COLUMN IF NOT EXISTS workspace_id uuid;
CREATE INDEX IF NOT EXISTS idx_meta_ads_campaigns_workspace_id ON public.meta_ads_campaigns (workspace_id);

DO $$
DECLARE
    v_orphans integer;
    v_fallback uuid;
BEGIN
    SELECT count(*) INTO v_orphans FROM public.meta_ads_campaigns WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        v_fallback := public._resolve_single_active_workspace();
        IF v_fallback IS NOT NULL THEN
            UPDATE public.meta_ads_campaigns SET workspace_id = v_fallback WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'meta_ads_campaigns: % linha(s) sem workspace_id, sem coluna de join (account_id nao mapeia workspace) e mais de 1 workspace ativo. Resolva manualmente antes de reaplicar esta migration.', v_orphans;
        END IF;
    END IF;
END $$;

SET lock_timeout = '2s';
ALTER TABLE public.meta_ads_campaigns
    ADD CONSTRAINT meta_ads_campaigns_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.meta_ads_campaigns VALIDATE CONSTRAINT meta_ads_campaigns_workspace_id_not_null;
ALTER TABLE public.meta_ads_campaigns ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.meta_ads_campaigns DROP CONSTRAINT meta_ads_campaigns_workspace_id_not_null;
RESET lock_timeout;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_campaigns_workspace_id_fkey') THEN
        ALTER TABLE public.meta_ads_campaigns
            ADD CONSTRAINT meta_ads_campaigns_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_meta_ads_campaigns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.workspace_id IS NULL THEN
        NEW.workspace_id := public._resolve_single_active_workspace();
        IF NEW.workspace_id IS NULL THEN
            RAISE EXCEPTION 'meta_ads_campaigns: workspace_id nao informado, sem coluna de join e mais de 1 workspace ativo. Informe workspace_id explicitamente no INSERT.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_meta_ads_campaigns ON public.meta_ads_campaigns;
CREATE TRIGGER tr_set_workspace_id_meta_ads_campaigns
    BEFORE INSERT ON public.meta_ads_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_meta_ads_campaigns();

-- ============================================================================
-- 2. meta_ads_permalinks — join real por ad_id via meta_ads_insights.
--    ACHADO: sync-ad-permalinks ja escreve workspace_id; coluna faltava.
-- ============================================================================
ALTER TABLE public.meta_ads_permalinks ADD COLUMN IF NOT EXISTS workspace_id uuid;
CREATE INDEX IF NOT EXISTS idx_meta_ads_permalinks_workspace_id ON public.meta_ads_permalinks (workspace_id);

-- Backfill por join: só resolve ad_id que aparece em EXATAMENTE 1 workspace
-- diferente em meta_ads_insights (ad_id do Meta é global, mas não confiamos
-- cegamente — se por algum motivo aparecer em 2+ workspaces, fica órfão e
-- cai no fallback abaixo em vez de atribuir errado).
WITH ad_workspace AS (
    SELECT ad_id, (array_agg(workspace_id))[1] AS workspace_id
    FROM public.meta_ads_insights
    WHERE ad_id IS NOT NULL AND workspace_id IS NOT NULL
    GROUP BY ad_id
    HAVING count(DISTINCT workspace_id) = 1
)
UPDATE public.meta_ads_permalinks p
SET workspace_id = aw.workspace_id
FROM ad_workspace aw
WHERE p.ad_id = aw.ad_id AND p.workspace_id IS NULL;

DO $$
DECLARE
    v_orphans integer;
    v_fallback uuid;
BEGIN
    SELECT count(*) INTO v_orphans FROM public.meta_ads_permalinks WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        v_fallback := public._resolve_single_active_workspace();
        IF v_fallback IS NOT NULL THEN
            UPDATE public.meta_ads_permalinks SET workspace_id = v_fallback WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'meta_ads_permalinks: % linha(s) sem workspace_id resolvivel (ad_id sem match unico em meta_ads_insights) e mais de 1 workspace ativo. Resolva manualmente antes de reaplicar esta migration.', v_orphans;
        END IF;
    END IF;
END $$;

SET lock_timeout = '2s';
ALTER TABLE public.meta_ads_permalinks
    ADD CONSTRAINT meta_ads_permalinks_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.meta_ads_permalinks VALIDATE CONSTRAINT meta_ads_permalinks_workspace_id_not_null;
ALTER TABLE public.meta_ads_permalinks ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.meta_ads_permalinks DROP CONSTRAINT meta_ads_permalinks_workspace_id_not_null;
RESET lock_timeout;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_permalinks_workspace_id_fkey') THEN
        ALTER TABLE public.meta_ads_permalinks
            ADD CONSTRAINT meta_ads_permalinks_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_meta_ads_permalinks()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ad_workspace uuid;
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT workspace_id INTO v_ad_workspace
        FROM public.meta_ads_insights
        WHERE ad_id = NEW.ad_id AND workspace_id IS NOT NULL
        GROUP BY ad_id, workspace_id
        HAVING count(*) > 0
        LIMIT 1;

        IF v_ad_workspace IS NOT NULL THEN
            NEW.workspace_id := v_ad_workspace;
        ELSE
            NEW.workspace_id := public._resolve_single_active_workspace();
        END IF;

        IF NEW.workspace_id IS NULL THEN
            RAISE EXCEPTION 'meta_ads_permalinks: workspace_id nao informado, ad_id % sem match em meta_ads_insights e mais de 1 workspace ativo. Informe workspace_id explicitamente no INSERT.', NEW.ad_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_meta_ads_permalinks ON public.meta_ads_permalinks;
CREATE TRIGGER tr_set_workspace_id_meta_ads_permalinks
    BEFORE INSERT ON public.meta_ads_permalinks
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_meta_ads_permalinks();

-- ============================================================================
-- 3. weekly_email_schedules — join real por created_by -> workspace_members.
-- ============================================================================
ALTER TABLE public.weekly_email_schedules ADD COLUMN IF NOT EXISTS workspace_id uuid;
CREATE INDEX IF NOT EXISTS idx_weekly_email_schedules_workspace_id ON public.weekly_email_schedules (workspace_id);

WITH creator_workspace AS (
    SELECT user_id, (array_agg(workspace_id))[1] AS workspace_id
    FROM public.workspace_members
    GROUP BY user_id
    HAVING count(DISTINCT workspace_id) = 1
)
UPDATE public.weekly_email_schedules s
SET workspace_id = cw.workspace_id
FROM creator_workspace cw
WHERE s.created_by = cw.user_id AND s.workspace_id IS NULL;

DO $$
DECLARE
    v_orphans integer;
    v_fallback uuid;
BEGIN
    SELECT count(*) INTO v_orphans FROM public.weekly_email_schedules WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        v_fallback := public._resolve_single_active_workspace();
        IF v_fallback IS NOT NULL THEN
            UPDATE public.weekly_email_schedules SET workspace_id = v_fallback WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'weekly_email_schedules: % linha(s) sem workspace_id resolvivel (created_by sem membership unica) e mais de 1 workspace ativo. Resolva manualmente antes de reaplicar esta migration.', v_orphans;
        END IF;
    END IF;
END $$;

SET lock_timeout = '2s';
ALTER TABLE public.weekly_email_schedules
    ADD CONSTRAINT weekly_email_schedules_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.weekly_email_schedules VALIDATE CONSTRAINT weekly_email_schedules_workspace_id_not_null;
ALTER TABLE public.weekly_email_schedules ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.weekly_email_schedules DROP CONSTRAINT weekly_email_schedules_workspace_id_not_null;
RESET lock_timeout;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_schedules_workspace_id_fkey') THEN
        ALTER TABLE public.weekly_email_schedules
            ADD CONSTRAINT weekly_email_schedules_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_weekly_email_schedules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_creator_workspace uuid;
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT workspace_id INTO v_creator_workspace
        FROM public.workspace_members
        WHERE user_id = NEW.created_by
        GROUP BY workspace_id
        HAVING count(*) > 0
        ORDER BY count(*) DESC
        LIMIT 1;

        -- so aceita join automatico se o usuario tem exatamente 1 workspace
        IF (SELECT count(DISTINCT workspace_id) FROM public.workspace_members WHERE user_id = NEW.created_by) = 1 THEN
            NEW.workspace_id := v_creator_workspace;
        ELSE
            NEW.workspace_id := public._resolve_single_active_workspace();
        END IF;

        IF NEW.workspace_id IS NULL THEN
            RAISE EXCEPTION 'weekly_email_schedules: workspace_id nao informado, created_by % sem membership unica e mais de 1 workspace ativo. Informe workspace_id explicitamente no INSERT.', NEW.created_by;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_weekly_email_schedules ON public.weekly_email_schedules;
CREATE TRIGGER tr_set_workspace_id_weekly_email_schedules
    BEFORE INSERT ON public.weekly_email_schedules
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_weekly_email_schedules();

-- ============================================================================
-- 4. weekly_email_logs — join real por schedule_id -> weekly_email_schedules.
--    PII de destinatario (recipient_emails) — prioridade "Media" no runbook Fase 8.
-- ============================================================================
ALTER TABLE public.weekly_email_logs ADD COLUMN IF NOT EXISTS workspace_id uuid;
CREATE INDEX IF NOT EXISTS idx_weekly_email_logs_workspace_id ON public.weekly_email_logs (workspace_id);

UPDATE public.weekly_email_logs l
SET workspace_id = s.workspace_id
FROM public.weekly_email_schedules s
WHERE l.schedule_id = s.id AND l.workspace_id IS NULL;

DO $$
DECLARE
    v_orphans integer;
    v_fallback uuid;
BEGIN
    SELECT count(*) INTO v_orphans FROM public.weekly_email_logs WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        v_fallback := public._resolve_single_active_workspace();
        IF v_fallback IS NOT NULL THEN
            UPDATE public.weekly_email_logs SET workspace_id = v_fallback WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'weekly_email_logs: % linha(s) sem workspace_id resolvivel (schedule_id orfao) e mais de 1 workspace ativo. Resolva manualmente antes de reaplicar esta migration.', v_orphans;
        END IF;
    END IF;
END $$;

SET lock_timeout = '2s';
ALTER TABLE public.weekly_email_logs
    ADD CONSTRAINT weekly_email_logs_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.weekly_email_logs VALIDATE CONSTRAINT weekly_email_logs_workspace_id_not_null;
ALTER TABLE public.weekly_email_logs ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.weekly_email_logs DROP CONSTRAINT weekly_email_logs_workspace_id_not_null;
RESET lock_timeout;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_logs_workspace_id_fkey') THEN
        ALTER TABLE public.weekly_email_logs
            ADD CONSTRAINT weekly_email_logs_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_weekly_email_logs()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_schedule_workspace uuid;
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT workspace_id INTO v_schedule_workspace
        FROM public.weekly_email_schedules
        WHERE id = NEW.schedule_id;

        IF v_schedule_workspace IS NOT NULL THEN
            NEW.workspace_id := v_schedule_workspace;
        ELSE
            NEW.workspace_id := public._resolve_single_active_workspace();
        END IF;

        IF NEW.workspace_id IS NULL THEN
            RAISE EXCEPTION 'weekly_email_logs: workspace_id nao informado, schedule_id % sem workspace resolvivel e mais de 1 workspace ativo. Informe workspace_id explicitamente no INSERT.', NEW.schedule_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_weekly_email_logs ON public.weekly_email_logs;
CREATE TRIGGER tr_set_workspace_id_weekly_email_logs
    BEFORE INSERT ON public.weekly_email_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_weekly_email_logs();

COMMENT ON COLUMN public.meta_ads_campaigns.workspace_id IS
    'Denormalizado (Fase 6, fatia 2). Sem writer funcional hoje; coluna existe para fechar o gap do purge/manifesto LGPD e evitar reabrir o gap se um writer futuro aparecer.';
COMMENT ON COLUMN public.meta_ads_permalinks.workspace_id IS
    'Denormalizado (Fase 6, fatia 2). ACHADO: sync-ad-permalinks ja escrevia este campo antes da coluna existir — todo upsert real falhava. Resolvido por join com meta_ads_insights.ad_id no backfill e no trigger.';
COMMENT ON COLUMN public.weekly_email_schedules.workspace_id IS
    'Denormalizado (Fase 6, fatia 2). Resolvido via created_by -> workspace_members (1:1 quando o usuario pertence a um unico workspace).';
COMMENT ON COLUMN public.weekly_email_logs.workspace_id IS
    'Denormalizado (Fase 6, fatia 2). PII de destinatario (recipient_emails) — prioridade Media no runbook LGPD. Resolvido via schedule_id -> weekly_email_schedules.workspace_id.';

-- ---------------------------------------------------------------------------
-- Fecha os 4 gaps na Fase 8 (LGPD): purge_workspace_data e
-- export_workspace_data_manifest passam a cobrir as 4 tabelas por coluna
-- direta e saem da lista de gaps conhecidos. meta_ads_backfill_controle/log
-- e audit_log (residual) continuam fora, por decisao (ver cabecalho).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_workspace_data_manifest(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_manifest JSONB := '{}'::jsonb;
    v_location_ids TEXT[];
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
        RAISE EXCEPTION 'workspace % não encontrado', p_workspace_id;
    END IF;

    SELECT array_agg(ghl_location_id) INTO v_location_ids
    FROM public.ghl_integration_settings
    WHERE workspace_id = p_workspace_id AND ghl_location_id IS NOT NULL;
    v_location_ids := COALESCE(v_location_ids, ARRAY[]::TEXT[]);

    v_manifest := v_manifest || jsonb_build_object(
        'contatos', (SELECT count(*) FROM public.contatos WHERE workspace_id = p_workspace_id),
        'oportunidades', (SELECT count(*) FROM public.oportunidades WHERE workspace_id = p_workspace_id),
        'comunicacoes', (SELECT count(*) FROM public.comunicacoes WHERE workspace_id = p_workspace_id),
        'vendas_fechamento', (SELECT count(*) FROM public.vendas_fechamento WHERE workspace_id = p_workspace_id),
        'reunioes', (SELECT count(*) FROM public.reunioes r JOIN public.contatos c ON c.id = r.contato_id WHERE c.workspace_id = p_workspace_id),
        'ghl_tasks', (SELECT count(*) FROM public.ghl_tasks t JOIN public.contatos c ON c.id = t.contato_id WHERE c.workspace_id = p_workspace_id),
        'ghl_opp_reconcile_items', (SELECT count(*) FROM public.ghl_opp_reconcile_items i JOIN public.contatos c ON c.id = i.contato_id WHERE c.workspace_id = p_workspace_id),
        'ghl_users', (SELECT count(*) FROM public.ghl_users WHERE workspace_id = p_workspace_id),
        'ghl_calendars', (SELECT count(*) FROM public.ghl_calendars WHERE workspace_id = p_workspace_id),
        'stevo_whatsapp_calls', (SELECT count(*) FROM public.stevo_whatsapp_calls WHERE workspace_id = p_workspace_id),
        'meta_ads_campaigns', (SELECT count(*) FROM public.meta_ads_campaigns WHERE workspace_id = p_workspace_id),
        'meta_ads_permalinks', (SELECT count(*) FROM public.meta_ads_permalinks WHERE workspace_id = p_workspace_id),
        'weekly_email_schedules', (SELECT count(*) FROM public.weekly_email_schedules WHERE workspace_id = p_workspace_id),
        'weekly_email_logs', (SELECT count(*) FROM public.weekly_email_logs WHERE workspace_id = p_workspace_id),
        'webhooks_ghl', (SELECT count(*) FROM public.webhooks_ghl WHERE location_id = ANY(v_location_ids)),
        'contact_opp_sync_queue', (SELECT count(*) FROM public.contact_opp_sync_queue WHERE location_id = ANY(v_location_ids)),
        'webhook_unresolved', (SELECT count(*) FROM public.webhook_unresolved WHERE location_id = ANY(v_location_ids) OR resolved_workspace_id = p_workspace_id),
        'workspace_members', (SELECT count(*) FROM public.workspace_members WHERE workspace_id = p_workspace_id),
        'ghl_integration_settings', (SELECT count(*) FROM public.ghl_integration_settings WHERE workspace_id = p_workspace_id),
        'workspace_integration_credentials', (SELECT count(*) FROM public.workspace_integration_credentials WHERE workspace_id = p_workspace_id),
        'goal_definitions', (SELECT count(*) FROM public.goal_definitions WHERE workspace_id = p_workspace_id)
    );

    v_manifest := v_manifest || jsonb_build_object(
        '_gaps_nao_isolaveis_hoje', jsonb_build_array(
            'meta_ads_backfill_controle/log (residual de-scoped por decisao do dono — sync-meta-ads-backfill single-tenant)',
            'audit_log (residual, best-effort)'
        ),
        '_location_ids', to_jsonb(v_location_ids),
        '_generated_at', to_jsonb(now())
    );

    RETURN v_manifest;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_workspace_data(
    p_workspace_id UUID,
    p_confirmation_name TEXT,
    p_dry_run BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_name TEXT;
    v_location_ids TEXT[];
    v_report JSONB := '{}'::jsonb;
    v_n INTEGER;
    v_total_before INTEGER := 0;
BEGIN
    SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = p_workspace_id;
    IF v_workspace_name IS NULL THEN
        RAISE EXCEPTION 'workspace % não encontrado (já foi excluído?)', p_workspace_id;
    END IF;

    IF p_confirmation_name IS DISTINCT FROM v_workspace_name THEN
        RAISE EXCEPTION 'confirmação não bate com o nome do workspace — recusando expurgo (fail-closed)' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(ghl_location_id) INTO v_location_ids
    FROM public.ghl_integration_settings
    WHERE workspace_id = p_workspace_id AND ghl_location_id IS NOT NULL;
    v_location_ids := COALESCE(v_location_ids, ARRAY[]::TEXT[]);

    DELETE FROM public.ghl_tasks t
    USING public.contatos c
    WHERE t.contato_id = c.id AND c.workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_tasks', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.ghl_opp_reconcile_items i
    USING public.contatos c
    WHERE i.contato_id = c.id AND c.workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_opp_reconcile_items', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.contatos WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('contatos_e_cascade_crm', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.webhooks_ghl WHERE location_id = ANY(v_location_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('webhooks_ghl', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.contact_opp_sync_queue WHERE location_id = ANY(v_location_ids);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('contact_opp_sync_queue', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.webhook_unresolved
    WHERE location_id = ANY(v_location_ids) OR resolved_workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('webhook_unresolved', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.ghl_users WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_users', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.ghl_calendars WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_calendars', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.stevo_whatsapp_calls WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('stevo_whatsapp_calls', v_n);
    v_total_before := v_total_before + v_n;

    -- Fase 6 fatia 2: as 4 tabelas agora tem workspace_id direto — apaga junto.
    DELETE FROM public.meta_ads_campaigns WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('meta_ads_campaigns', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.meta_ads_permalinks WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('meta_ads_permalinks', v_n);
    v_total_before := v_total_before + v_n;

    -- weekly_email_logs antes de weekly_email_schedules (FK schedule_id -> schedules).
    DELETE FROM public.weekly_email_logs WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('weekly_email_logs', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.weekly_email_schedules WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('weekly_email_schedules', v_n);
    v_total_before := v_total_before + v_n;

    WITH exclusive_users AS (
        SELECT wm.user_id
        FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
        GROUP BY wm.user_id
        HAVING (SELECT COUNT(*) FROM public.workspace_members wm2 WHERE wm2.user_id = wm.user_id) = 1
    )
    DELETE FROM public.ai_messages m
    USING public.ai_conversations c
    WHERE m.conversation_id = c.id AND c.user_id IN (SELECT user_id FROM exclusive_users);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ai_messages', v_n);
    v_total_before := v_total_before + v_n;

    WITH exclusive_users AS (
        SELECT wm.user_id
        FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
        GROUP BY wm.user_id
        HAVING (SELECT COUNT(*) FROM public.workspace_members wm2 WHERE wm2.user_id = wm.user_id) = 1
    )
    DELETE FROM public.ai_conversations WHERE user_id IN (SELECT user_id FROM exclusive_users);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ai_conversations', v_n);
    v_total_before := v_total_before + v_n;

    WITH exclusive_users AS (
        SELECT wm.user_id
        FROM public.workspace_members wm
        WHERE wm.workspace_id = p_workspace_id
        GROUP BY wm.user_id
        HAVING (SELECT COUNT(*) FROM public.workspace_members wm2 WHERE wm2.user_id = wm.user_id) = 1
    )
    DELETE FROM public.ai_analysis_sessions WHERE user_id IN (SELECT user_id::text FROM exclusive_users);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ai_analysis_sessions', v_n);
    v_total_before := v_total_before + v_n;

    v_report := v_report || jsonb_build_object(
        'usuarios_exclusivos_nao_apagados_de_auth_users',
        (SELECT COALESCE(jsonb_agg(user_id), '[]'::jsonb)
         FROM (
            SELECT wm.user_id
            FROM public.workspace_members wm
            WHERE wm.workspace_id = p_workspace_id
            GROUP BY wm.user_id
            HAVING (SELECT COUNT(*) FROM public.workspace_members wm2 WHERE wm2.user_id = wm.user_id) = 1
         ) x)
    );

    DELETE FROM public.app_feature_role_permissions WHERE workspace_id = p_workspace_id;
    DELETE FROM public.app_feature_user_overrides WHERE workspace_id = p_workspace_id;
    DELETE FROM public.dashboard_user_permissions WHERE workspace_id = p_workspace_id;

    DELETE FROM public.workspaces WHERE id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('workspaces_row', v_n);

    v_report := v_report || jsonb_build_object(
        '_gaps_nao_purgados_nesta_funcao', jsonb_build_array(
            'meta_ads_backfill_controle/log (residual de-scoped por decisao do dono)',
            'audit_log (residual, best-effort — não coberto aqui)'
        ),
        '_auth_users_delete_pendente', 'auth.users dos usuários exclusivos listados acima precisa ser apagado via Admin API (fora do SQL) — ver scripts/purge-workspace.ts',
        '_dry_run', p_dry_run,
        '_workspace_id', p_workspace_id,
        '_workspace_name', v_workspace_name
    );

    IF p_dry_run THEN
        RAISE EXCEPTION 'DRY_RUN_ROLLBACK: %', v_report::text;
    END IF;

    RETURN v_report;
END;
$$;

-- ============================================================================
-- 5. ACHADO DE SEGURANCA (encontrado ao inspecionar as policies antes de expor
-- estas 4 tabelas na suite de isolamento): as policies de SELECT existentes
-- NAO filtravam por linha — qualquer usuario autenticado, de QUALQUER
-- workspace, lia TODAS as linhas de meta_ads_campaigns/meta_ads_permalinks
-- (qual so checava "e membro ativo de algum workspace", sem comparar
-- wm.workspace_id com a linha) e de weekly_email_logs/weekly_email_schedules
-- (qual so checava "auth.role() = authenticated", sem NENHUM filtro de
-- workspace em SELECT/INSERT/UPDATE/DELETE). Isso nao vazava nada ate agora
-- porque as tabelas nao tinham workspace_id (dado nao era diferenciavel por
-- tenant); agora que a coluna existe (secoes 1-4 acima) e weekly_email_logs
-- carrega PII (recipient_emails), a policy antiga vazaria cross-tenant de
-- verdade. Corrigido no mesmo padrao ja usado em ads_campaigns/contatos:
-- wm.workspace_id = <tabela>.workspace_id, com (SELECT auth.uid()) (evita
-- reavaliacao por linha, mesmo fix de performance da migration
-- 20260802000000_fase1_agency_rls_auth_uid_perf.sql).
-- ============================================================================

DROP POLICY IF EXISTS workspace_members_read_meta_ads_campaigns ON public.meta_ads_campaigns;
CREATE POLICY workspace_members_read_meta_ads_campaigns ON public.meta_ads_campaigns
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = meta_ads_campaigns.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS workspace_members_read_meta_ads_permalinks ON public.meta_ads_permalinks;
CREATE POLICY workspace_members_read_meta_ads_permalinks ON public.meta_ads_permalinks
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = meta_ads_permalinks.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_logs_select_auth ON public.weekly_email_logs;
CREATE POLICY weekly_email_logs_select_auth ON public.weekly_email_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_logs.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_logs_insert_auth ON public.weekly_email_logs;
CREATE POLICY weekly_email_logs_insert_auth ON public.weekly_email_logs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_logs.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_schedules_select_auth ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_select_auth ON public.weekly_email_schedules
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_schedules.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_schedules_insert_auth ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_insert_auth ON public.weekly_email_schedules
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_schedules.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_schedules_update_auth ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_update_auth ON public.weekly_email_schedules
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_schedules.workspace_id
              AND wm.is_active = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_schedules.workspace_id
              AND wm.is_active = true
        )
    );

DROP POLICY IF EXISTS weekly_email_schedules_delete_auth ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_delete_auth ON public.weekly_email_schedules
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.user_id = (SELECT auth.uid())
              AND wm.workspace_id = weekly_email_schedules.workspace_id
              AND wm.is_active = true
        )
    );

NOTIFY pgrst, 'reload schema';
