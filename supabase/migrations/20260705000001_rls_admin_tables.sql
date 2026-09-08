-- ============================================================
-- Migration: ativar RLS em tabelas administrativas/criticas
--
-- Tabelas afetadas:
--   - ghl_api_jobs             (fila global da API GHL)
--   - ghl_opp_reconcile_runs   (execucoes de reconciliacao de opps)
--   - ghl_opp_reconcile_items  (itens de uma execucao de reconciliacao)
--   - bot_context              (contexto dinamico do bot Empire)
--   - ghl_custom_field_mappings (mapeamento de custom fields GHL)
--
-- Principios aplicados:
--   1. RLS ativado em todas as tabelas.
--   2. Tabelas sem workspace_id direto sao restritas a usuarios
--      autenticados que sao membros ativos de algum workspace
--      (leitura) ou admins/owners (escrita).
--   3. Tabelas com relacionamento indireto via contato usam helper
--      SECURITY DEFINER para resolver workspace_id.
--   4. service_role mantem acesso total para edge functions/syncs.
-- ============================================================

-- =============================================================================
-- Helpers SECURITY DEFINER para resolver workspace de relacionamentos
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_workspace_id(p_contato_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT workspace_id FROM public.contatos WHERE id = p_contato_id;
$$;

-- Returns true if the current user is an active member of ANY workspace
CREATE OR REPLACE FUNCTION public.is_active_workspace_member_any()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND is_active = true
    );
$$;

-- Returns true if the current user is an active owner/admin of ANY workspace
CREATE OR REPLACE FUNCTION public.is_active_workspace_admin_any()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$$;

-- =============================================================================
-- ghl_api_jobs
-- Fila centralizada da API GHL. Nao possui workspace_id e eh de uso exclusivo
-- de edge functions/crons. RLS ativado; apenas service_role acessa.
-- =============================================================================
ALTER TABLE public.ghl_api_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_ghl_api_jobs" ON public.ghl_api_jobs;
CREATE POLICY "service_role_all_ghl_api_jobs"
    ON public.ghl_api_jobs FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- ghl_opp_reconcile_runs
-- Execucoes de reconciliacao de oportunidades. Nao possui workspace_id direto;
-- restringimos a membros ativos de qualquer workspace para leitura e admins
-- para escrita, ate que a aplicacao passe a popular workspace_id por execucao.
-- =============================================================================
ALTER TABLE public.ghl_opp_reconcile_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;

CREATE POLICY "workspace_members_select_ghl_opp_reconcile_runs"
    ON public.ghl_opp_reconcile_runs FOR SELECT
    TO authenticated
    USING (public.is_active_workspace_member_any());

CREATE POLICY "workspace_admins_insert_ghl_opp_reconcile_runs"
    ON public.ghl_opp_reconcile_runs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_update_ghl_opp_reconcile_runs"
    ON public.ghl_opp_reconcile_runs FOR UPDATE
    TO authenticated
    USING (public.is_active_workspace_admin_any())
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_delete_ghl_opp_reconcile_runs"
    ON public.ghl_opp_reconcile_runs FOR DELETE
    TO authenticated
    USING (public.is_active_workspace_admin_any());

DROP POLICY IF EXISTS "service_role_all_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY "service_role_all_ghl_opp_reconcile_runs"
    ON public.ghl_opp_reconcile_runs FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- ghl_opp_reconcile_items
-- Itens de reconciliacao possuem contato_id, entao resolvemos o workspace
-- indiretamente pela tabela contatos.
-- =============================================================================
ALTER TABLE public.ghl_opp_reconcile_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
DROP POLICY IF EXISTS "workspace_members_insert_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
DROP POLICY IF EXISTS "workspace_members_update_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;

CREATE POLICY "workspace_members_select_ghl_opp_reconcile_items"
    ON public.ghl_opp_reconcile_items FOR SELECT
    TO authenticated
    USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_insert_ghl_opp_reconcile_items"
    ON public.ghl_opp_reconcile_items FOR INSERT
    TO authenticated
    WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_members_update_ghl_opp_reconcile_items"
    ON public.ghl_opp_reconcile_items FOR UPDATE
    TO authenticated
    USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)))
    WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));

CREATE POLICY "workspace_admins_delete_ghl_opp_reconcile_items"
    ON public.ghl_opp_reconcile_items FOR DELETE
    TO authenticated
    USING (public.is_workspace_admin(public.get_contact_workspace_id(contato_id)));

DROP POLICY IF EXISTS "service_role_all_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY "service_role_all_ghl_opp_reconcile_items"
    ON public.ghl_opp_reconcile_items FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Indice de apoio para performance da policy por contato
CREATE INDEX IF NOT EXISTS idx_ghl_opp_reconcile_items_contato_id
    ON public.ghl_opp_reconcile_items (contato_id);

-- =============================================================================
-- bot_context
-- Contexto dinamico injetado no system prompt do bot. Nao possui workspace_id;
-- leitura liberada para membros ativos, escrita apenas para admins.
-- =============================================================================
ALTER TABLE public.bot_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_bot_context" ON public.bot_context;
DROP POLICY IF EXISTS "workspace_admins_insert_bot_context" ON public.bot_context;
DROP POLICY IF EXISTS "workspace_admins_update_bot_context" ON public.bot_context;
DROP POLICY IF EXISTS "workspace_admins_delete_bot_context" ON public.bot_context;

CREATE POLICY "workspace_members_select_bot_context"
    ON public.bot_context FOR SELECT
    TO authenticated
    USING (public.is_active_workspace_member_any());

CREATE POLICY "workspace_admins_insert_bot_context"
    ON public.bot_context FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_update_bot_context"
    ON public.bot_context FOR UPDATE
    TO authenticated
    USING (public.is_active_workspace_admin_any())
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_delete_bot_context"
    ON public.bot_context FOR DELETE
    TO authenticated
    USING (public.is_active_workspace_admin_any());

DROP POLICY IF EXISTS "service_role_all_bot_context" ON public.bot_context;
CREATE POLICY "service_role_all_bot_context"
    ON public.bot_context FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- ghl_custom_field_mappings
-- Mapeamento global entre nome logico e ID de custom field do GHL. Nao possui
-- workspace_id; leitura para membros ativos, escrita apenas para admins.
-- =============================================================================
ALTER TABLE public.ghl_custom_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;

CREATE POLICY "workspace_members_select_ghl_custom_field_mappings"
    ON public.ghl_custom_field_mappings FOR SELECT
    TO authenticated
    USING (public.is_active_workspace_member_any());

CREATE POLICY "workspace_admins_insert_ghl_custom_field_mappings"
    ON public.ghl_custom_field_mappings FOR INSERT
    TO authenticated
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_update_ghl_custom_field_mappings"
    ON public.ghl_custom_field_mappings FOR UPDATE
    TO authenticated
    USING (public.is_active_workspace_admin_any())
    WITH CHECK (public.is_active_workspace_admin_any());

CREATE POLICY "workspace_admins_delete_ghl_custom_field_mappings"
    ON public.ghl_custom_field_mappings FOR DELETE
    TO authenticated
    USING (public.is_active_workspace_admin_any());

DROP POLICY IF EXISTS "service_role_all_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY "service_role_all_ghl_custom_field_mappings"
    ON public.ghl_custom_field_mappings FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
