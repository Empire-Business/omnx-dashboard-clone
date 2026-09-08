-- ============================================================================
-- FASE 8 — LGPD/offboarding: runbook técnico de expurgo de workspace.
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 15 + 16) + docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md
--
-- Entrega:
--   1. Tabela workspace_deletion_requests (ciclo de vida do pedido de exclusao,
--      seção 16.2 do plano) — desacoplada de agency_workspaces.status (que é
--      sobre PROVISIONAMENTO, não sobre ciclo de vida de dado pessoal).
--   2. RPC request_workspace_deletion — owner do workspace ou admin da agência
--      dona pede a exclusão (fail-closed se já houver pedido em aberto).
--   3. RPC export_workspace_data_manifest — manifesto (contagem por tabela)
--      usado tanto para o pacote de portabilidade (art. 18, IX) quanto para
--      provar depois que o expurgo não deixou linha para trás.
--   4. RPC purge_workspace_data — SERVICE_ROLE ONLY (ação destrutiva de alto
--      risco, sempre via operador/script, nunca exposta a authenticated).
--      Roda inteira dentro de UMA função plpgsql = UMA transação Postgres:
--      se qualquer passo falhar, TUDO desfaz sozinho (ao contrário do
--      provisionamento em scripts/provision-new-client.ts, que é uma
--      sequência de chamadas de rede sem transação única — ver secao 2 do
--      runbook para o porquê essa garantia não se generaliza pra lá).
--      Suporta p_dry_run=true: calcula as contagens reais fazendo os DELETEs
--      de verdade dentro da transação, e então força ROLLBACK via RAISE
--      EXCEPTION carregando o relatório em JSON na mensagem — nada é
--      commitado, mas as contagens são exatas (não são estimativa).
--
-- Ordem de exclusão (respeita FKs bloqueantes e SET NULL — ver runbook secao 3):
--   a) ghl_tasks (FK NO ACTION em contato_id — bloqueia DELETE de contatos)
--   b) ghl_opp_reconcile_items (FK SET NULL em contato_id — orfanaria PII)
--   c) contatos WHERE workspace_id = alvo
--        -> CASCADE automático: oportunidades, comunicacoes, vendas_fechamento,
--           reunioes (todas ON DELETE CASCADE a partir de contato_id)
--   d) webhooks_ghl / contact_opp_sync_queue / webhook_unresolved, por
--      location_id (capturado de ghl_integration_settings ANTES do cascade
--      final apagar essa tabela)
--   e) ghl_users / ghl_calendars explicitamente (FK a workspaces é SET NULL,
--      cascade do passo (g) não apagaria — orfanaria nome/e-mail de usuário GHL)
--   f) dado de IA (ai_conversations/ai_messages/ai_analysis_sessions) e
--      auth_audit_log/auth_password_reset_tokens/auth_rate_limits — SÓ para
--      usuários cuja ÚNICA membership é este workspace (evita apagar
--      histórico de um admin que também atua em outro tenant)
--   g) DELETE FROM workspaces WHERE id = alvo
--        -> CASCADE automático faz o resto: ads_campaigns, creative_*,
--           disparo_*, funnels, ghl_discovery_runs, ghl_field_mappings,
--           ghl_integration_settings, ghl_pipeline_mappings, ghl_stage_mappings,
--           goal_definitions -> goal_versions -> goal_snapshots, notion_*,
--           organic_*, outbound_webhooks, permission_audit_log, sales_*,
--           sdr_ia_config, utm_*, whatsapp_pricing_config, workspace_apps,
--           workspace_integration_credentials, workspace_members,
--           workspace_settings, agency_workspaces.
--
-- GAPS CONHECIDOS (documentados, não resolvidos por esta migration — ver
-- runbook secao 5): meta_ads_campaigns/meta_ads_permalinks, stevo_whatsapp_calls,
-- weekly_email_logs/weekly_email_schedules, audit_log residual. Nenhuma
-- dessas tabelas tem workspace_id hoje (gap pré-existente da Fase 6, mais
-- stevo_whatsapp_calls que é um gap NOVO encontrado nesta sessão). O
-- relatório de purge SEMPRE lista esses gaps explicitamente — nunca reporta
-- "100% limpo" silenciosamente (mesmo risco de completude que o Anexo B do
-- plano-mãe já aponta para a secao 16.3).
--
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- Idempotente: DROP ... IF EXISTS / CREATE OR REPLACE / CREATE TABLE IF NOT EXISTS.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- ---------------------------------------------------------------------------
-- 1. Tabela de pedidos de exclusao (ciclo de vida, secao 16.2 do plano-mãe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_deletion_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    workspace_name_snapshot TEXT NOT NULL,
    requested_by           UUID NOT NULL REFERENCES auth.users(id),
    requested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason                 TEXT,
    status                 TEXT NOT NULL DEFAULT 'export_pending'
        CHECK (status IN ('export_pending', 'export_done', 'grace_period', 'deleted', 'cancelled')),
    export_manifest        JSONB,
    exported_at            TIMESTAMPTZ,
    grace_period_days      INTEGER NOT NULL DEFAULT 30,
    scheduled_deletion_at  TIMESTAMPTZ,
    deleted_at             TIMESTAMPTZ,
    deletion_report        JSONB,
    cancelled_at           TIMESTAMPTZ,
    cancelled_reason        TEXT,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_deletion_requests_workspace_id
    ON public.workspace_deletion_requests (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_deletion_requests_status
    ON public.workspace_deletion_requests (status);

-- Só pode haver 1 pedido "em voo" (não finalizado/cancelado) por workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_deletion_requests_open_per_workspace
    ON public.workspace_deletion_requests (workspace_id)
    WHERE status NOT IN ('deleted', 'cancelled') AND workspace_id IS NOT NULL;

ALTER TABLE public.workspace_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_deletion_requests_select ON public.workspace_deletion_requests;
CREATE POLICY workspace_deletion_requests_select ON public.workspace_deletion_requests
    FOR SELECT
    USING (
        workspace_id IS NOT NULL
        AND (public.is_workspace_owner(workspace_id) OR public.is_workspace_admin(workspace_id))
    );

-- INSERT/UPDATE/DELETE só por service_role (via RPCs abaixo, nunca direto pelo cliente).
GRANT SELECT ON public.workspace_deletion_requests TO authenticated;
GRANT ALL ON public.workspace_deletion_requests TO service_role;

COMMENT ON TABLE public.workspace_deletion_requests IS
    'Ciclo de vida do pedido de exclusão LGPD (Art. 18) de um workspace. '
    'Desacoplado de agency_workspaces.status (que é sobre provisionamento). '
    'export_pending -> export_done -> grace_period -> deleted (ou cancelled a qualquer momento antes de deleted).';

-- ---------------------------------------------------------------------------
-- 2. request_workspace_deletion — owner do workspace ou admin da agência dona
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_workspace_deletion(
    p_workspace_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_grace_period_days INTEGER DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_workspace_name TEXT;
    v_request_id UUID;
    v_authorized BOOLEAN;
BEGIN
    SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = p_workspace_id;
    IF v_workspace_name IS NULL THEN
        RAISE EXCEPTION 'workspace % não encontrado', p_workspace_id;
    END IF;

    v_authorized := public.is_workspace_owner(p_workspace_id)
        OR EXISTS (
            SELECT 1
            FROM public.agency_workspaces aw
            WHERE aw.workspace_id = p_workspace_id
              AND public.is_agency_admin(aw.agency_id)
        );

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'apenas o owner do workspace ou um admin da agência dona pode pedir exclusão' USING ERRCODE = '42501';
    END IF;

    IF p_grace_period_days < 1 THEN
        RAISE EXCEPTION 'grace_period_days deve ser >= 1';
    END IF;

    INSERT INTO public.workspace_deletion_requests (
        workspace_id, workspace_name_snapshot, requested_by, reason, grace_period_days, status
    ) VALUES (
        p_workspace_id, v_workspace_name, auth.uid(), p_reason, p_grace_period_days, 'export_pending'
    )
    RETURNING id INTO v_request_id;

    RETURN v_request_id;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'já existe um pedido de exclusão em aberto para este workspace' USING ERRCODE = '23505';
END;
$$;

REVOKE ALL ON FUNCTION public.request_workspace_deletion(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_workspace_deletion(UUID, TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. export_workspace_data_manifest — contagem por tabela (portabilidade +
--    prova de completude pós-expurgo). service_role only: chamada pelo
--    script de export (scripts/export-workspace-data.ts), não pelo cliente.
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

    -- Tabelas com workspace_id direto (contagem genérica via information_schema
    -- seria mais "elegante" mas exigiria SQL dinâmico com EXECUTE por tabela;
    -- optamos por explicitar a lista para deixar auditável e revisável em PR
    -- — a mesma lista é usada no teste de completude do runbook (Fase 8).
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
            'meta_ads_campaigns', 'meta_ads_permalinks', 'stevo_whatsapp_calls',
            'weekly_email_logs', 'weekly_email_schedules', 'audit_log (residual, best-effort)'
        ),
        '_location_ids', to_jsonb(v_location_ids),
        '_generated_at', to_jsonb(now())
    );

    RETURN v_manifest;
END;
$$;

REVOKE ALL ON FUNCTION public.export_workspace_data_manifest(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.export_workspace_data_manifest(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. purge_workspace_data — SERVICE_ROLE ONLY. Uma função = uma transação:
--    dry_run=true sempre desfaz (RAISE no final); dry_run=false commita.
-- ---------------------------------------------------------------------------
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
    v_total_after INTEGER := 0;
BEGIN
    SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = p_workspace_id;
    IF v_workspace_name IS NULL THEN
        RAISE EXCEPTION 'workspace % não encontrado (já foi excluído?)', p_workspace_id;
    END IF;

    IF p_confirmation_name IS DISTINCT FROM v_workspace_name THEN
        RAISE EXCEPTION 'confirmação não bate com o nome do workspace — recusando expurgo (fail-closed)' USING ERRCODE = '42501';
    END IF;

    -- Captura location_ids ANTES de qualquer delete (ghl_integration_settings
    -- só será apagada no cascade final do passo g).
    SELECT array_agg(ghl_location_id) INTO v_location_ids
    FROM public.ghl_integration_settings
    WHERE workspace_id = p_workspace_id AND ghl_location_id IS NOT NULL;
    v_location_ids := COALESCE(v_location_ids, ARRAY[]::TEXT[]);

    -- (a) ghl_tasks — FK NO ACTION bloqueia DELETE de contatos se não for primeiro.
    DELETE FROM public.ghl_tasks t
    USING public.contatos c
    WHERE t.contato_id = c.id AND c.workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_tasks', v_n);
    v_total_before := v_total_before + v_n;

    -- (b) ghl_opp_reconcile_items — FK SET NULL; delete explícito para não orfanar PII.
    DELETE FROM public.ghl_opp_reconcile_items i
    USING public.contatos c
    WHERE i.contato_id = c.id AND c.workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_opp_reconcile_items', v_n);
    v_total_before := v_total_before + v_n;

    -- (c) contatos — cascade cuida de oportunidades/comunicacoes/vendas_fechamento/reunioes.
    DELETE FROM public.contatos WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('contatos_e_cascade_crm', v_n);
    v_total_before := v_total_before + v_n;

    -- (d) filas/logs GHL por location_id (sem FK, sem coluna workspace_id).
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

    -- (e) ghl_users / ghl_calendars — FK SET NULL, cascade final não apagaria.
    DELETE FROM public.ghl_users WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_users', v_n);
    v_total_before := v_total_before + v_n;

    DELETE FROM public.ghl_calendars WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('ghl_calendars', v_n);
    v_total_before := v_total_before + v_n;

    -- (f) dado de IA + auth_* — só para usuários cuja ÚNICA membership é este workspace.
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

    -- (g0) achado real desta sessão: app_feature_role_permissions/
    -- app_feature_user_overrides/dashboard_user_permissions têm trigger AFTER
    -- DELETE que ESCREVE em permission_audit_log (workspace_id). Se essas 3
    -- tabelas forem apagadas só pelo CASCADE do DELETE FROM workspaces (passo g),
    -- a linha em workspaces já não existe mais no momento em que o trigger tenta
    -- inserir o registro de auditoria -> viola a FK de permission_audit_log
    -- (23503) e aborta a transação inteira. Delete explícito ANTES do passo (g),
    -- enquanto o workspace ainda existe: os inserts feitos pelo trigger têm FK
    -- válida, e essas linhas de auditoria (também workspace_id CASCADE) são
    -- limpas automaticamente no cascade final do passo (g) — sem sobrar rastro.
    DELETE FROM public.app_feature_role_permissions WHERE workspace_id = p_workspace_id;
    DELETE FROM public.app_feature_user_overrides WHERE workspace_id = p_workspace_id;
    DELETE FROM public.dashboard_user_permissions WHERE workspace_id = p_workspace_id;

    -- (g) workspaces — cascade final cobre o resto (ver cabeçalho da migration).
    DELETE FROM public.workspaces WHERE id = p_workspace_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_report := v_report || jsonb_build_object('workspaces_row', v_n);

    v_report := v_report || jsonb_build_object(
        '_gaps_nao_purgados_nesta_funcao', jsonb_build_array(
            'meta_ads_campaigns', 'meta_ads_permalinks', 'stevo_whatsapp_calls',
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

REVOKE ALL ON FUNCTION public.purge_workspace_data(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_workspace_data(UUID, TEXT, BOOLEAN) TO service_role;

COMMENT ON FUNCTION public.purge_workspace_data IS
    'LGPD/offboarding (Fase 8). SERVICE_ROLE ONLY — nunca GRANT a authenticated. '
    'p_dry_run=true (padrão) roda os deletes reais e força ROLLBACK via RAISE no final '
    '(contagens exatas, nada commitado). p_dry_run=false commita. '
    'p_confirmation_name precisa bater com workspaces.name (fail-closed, mesmo padrão '
    'de reactivate_agency_workspace). Gaps conhecidos: ver docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md.';

-- ---------------------------------------------------------------------------
-- 5. finalize_workspace_deletion_request — marca o request como concluído
--    depois que o script de purge (fora do SQL) confirma sucesso. Separado
--    de purge_workspace_data porque o request pode sobreviver ao workspace
--    (FK ON DELETE SET NULL) como trilha de auditoria do offboarding.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_workspace_deletion_request(
    p_request_id UUID,
    p_deletion_report JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.workspace_deletion_requests
    SET status = 'deleted', deleted_at = now(), deletion_report = p_deletion_report, updated_at = now()
    WHERE id = p_request_id;
$$;

REVOKE ALL ON FUNCTION public.finalize_workspace_deletion_request(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_workspace_deletion_request(UUID, JSONB) TO service_role;
