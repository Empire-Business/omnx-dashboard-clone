-- ============================================================================
-- FASE 6 (fatia adicional) — workspace_id em stevo_whatsapp_calls.
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 4.2/4.3) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md secao 5
--
-- ACHADO desta sessão (Fase 8, ao desenhar o expurgo LGPD): stevo_whatsapp_calls
-- guarda `caller`/`receiver` (telefones — PII direta de ligações WhatsApp) e,
-- ao contrário das outras tabelas "gap" já conhecidas (meta_ads_*, weekly_email_*),
-- não tem NENHUMA coluna de join (nem contato_id, nem location_id) — não dava
-- pra escopar por workspace em nenhum expurgo, nem por RLS. É a única tabela
-- do gap com PII direta e sem caminho de isolamento, por isso teve prioridade
-- "Alta" no runbook da Fase 8.
--
-- Mesmo padrão de segurança da migration 20260803000000 (Fase 6, fatia 1):
-- coluna nullable -> backfill (aqui, sem join possível — SÓ é seguro atribuir
-- automaticamente ao workspace único quando existe EXATAMENTE 1 workspace
-- hoje; com 2+, RAISE EXCEPTION força resolução manual) -> NOT NULL pelo
-- padrão seguro (NOT VALID -> VALIDATE -> SET NOT NULL) -> trigger BEFORE
-- INSERT que fecha o gap pra linhas novas (mesma regra: só resolve sozinho
-- com 1 workspace ativo).
--
-- RLS: esta tabela está hoje na categoria "infra_service_role" (acesso só via
-- service_role, sem policy de leitura para authenticated) — a coluna nova
-- habilita RLS por workspace como melhoria futura opcional, não aplicada
-- aqui (fora do escopo: o objetivo desta migration é fechar o gap de
-- isolamento do EXPURGO, não abrir leitura nova pro cliente).
--
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

ALTER TABLE public.stevo_whatsapp_calls ADD COLUMN IF NOT EXISTS workspace_id uuid;

CREATE INDEX IF NOT EXISTS idx_stevo_whatsapp_calls_workspace_id ON public.stevo_whatsapp_calls (workspace_id);

DO $$
DECLARE
    v_orphans integer;
    v_workspace_count integer;
    v_only_workspace_id uuid;
BEGIN
    SELECT count(*) INTO v_orphans FROM public.stevo_whatsapp_calls WHERE workspace_id IS NULL;
    IF v_orphans > 0 THEN
        SELECT count(*) INTO v_workspace_count FROM public.workspaces;
        IF v_workspace_count = 1 THEN
            SELECT id INTO v_only_workspace_id FROM public.workspaces LIMIT 1;
            UPDATE public.stevo_whatsapp_calls SET workspace_id = v_only_workspace_id WHERE workspace_id IS NULL;
        ELSE
            RAISE EXCEPTION 'stevo_whatsapp_calls: % linha(s) sem workspace_id e sem coluna de join (nem contato_id nem location_id) para resolver — e existem % workspaces. Atribuicao automatica so e segura com EXATAMENTE 1 workspace ativo. Resolva manualmente (ex.: mapear por numero de telefone/instance_id) antes de reaplicar esta migration.', v_orphans, v_workspace_count;
        END IF;
    END IF;
END $$;

SET lock_timeout = '2s';

ALTER TABLE public.stevo_whatsapp_calls
    ADD CONSTRAINT stevo_whatsapp_calls_workspace_id_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;
ALTER TABLE public.stevo_whatsapp_calls VALIDATE CONSTRAINT stevo_whatsapp_calls_workspace_id_not_null;
ALTER TABLE public.stevo_whatsapp_calls ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.stevo_whatsapp_calls DROP CONSTRAINT stevo_whatsapp_calls_workspace_id_not_null;

RESET lock_timeout;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'stevo_whatsapp_calls_workspace_id_fkey'
    ) THEN
        ALTER TABLE public.stevo_whatsapp_calls
            ADD CONSTRAINT stevo_whatsapp_calls_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_workspace_id_stevo_whatsapp_calls()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_workspace_count integer;
    v_only_workspace_id uuid;
BEGIN
    IF NEW.workspace_id IS NULL THEN
        SELECT count(*) INTO v_workspace_count FROM public.workspaces;
        IF v_workspace_count = 1 THEN
            SELECT id INTO v_only_workspace_id FROM public.workspaces LIMIT 1;
            NEW.workspace_id := v_only_workspace_id;
        ELSE
            RAISE EXCEPTION 'stevo_whatsapp_calls: workspace_id nao informado e existem % workspaces — nao ha como resolver automaticamente sem coluna de join. Informe workspace_id explicitamente no INSERT.', v_workspace_count;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_set_workspace_id_stevo_whatsapp_calls ON public.stevo_whatsapp_calls;
CREATE TRIGGER tr_set_workspace_id_stevo_whatsapp_calls
    BEFORE INSERT ON public.stevo_whatsapp_calls
    FOR EACH ROW EXECUTE FUNCTION public.set_workspace_id_stevo_whatsapp_calls();

COMMENT ON COLUMN public.stevo_whatsapp_calls.workspace_id IS
    'Denormalizado (Fase 6, fatia adicional — achado da Fase 8/LGPD). Sem esta '
    'coluna, ligações WhatsApp (telefones) não tinham NENHUM caminho de '
    'isolamento por tenant. Trigger BEFORE INSERT resolve automaticamente só '
    'na janela single-tenant (1 workspace ativo); em multi-tenant real, o '
    'caller precisa informar explicitamente.';

-- ---------------------------------------------------------------------------
-- Fecha o gap na Fase 8 (LGPD): agora que stevo_whatsapp_calls tem
-- workspace_id, purge_workspace_data e export_workspace_data_manifest
-- (migration 20260811000000) passam a cobri-la por coluna direta, e ela sai
-- da lista de gaps conhecidos reportada nos dois relatórios.
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
            'meta_ads_campaigns', 'meta_ads_permalinks',
            'weekly_email_logs', 'weekly_email_schedules', 'audit_log (residual, best-effort)'
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

    -- stevo_whatsapp_calls agora tem workspace_id direto (fatia adicional acima) — apaga junto.
    DELETE FROM public.stevo_whatsapp_calls WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('stevo_whatsapp_calls', v_n);
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
            'meta_ads_campaigns', 'meta_ads_permalinks',
            'weekly_email_logs', 'weekly_email_schedules', 'audit_log (residual, best-effort — não coberto aqui)'
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

NOTIFY pgrst, 'reload schema';
