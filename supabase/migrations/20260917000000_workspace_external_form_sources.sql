-- ============================================================
-- Migration: 20260917000000
-- workspace_external_form_sources — subcontas configuram próprio Supabase
-- docs/ROADMAP-MULTI-TENANT.md seção 8
-- ============================================================
SET search_path = public, pg_catalog;

CREATE TABLE IF NOT EXISTS public.workspace_external_form_sources (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'supabase',
    external_project_url TEXT NOT NULL,
    external_table_name TEXT NOT NULL DEFAULT 'aplic-acelerador',
    secret_key_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_configured'
        CHECK (status IN ('not_configured', 'testing', 'connected', 'error')),
    last_tested_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_wefs_workspace ON public.workspace_external_form_sources (workspace_id);

ALTER TABLE public.workspace_external_form_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages external form sources" ON public.workspace_external_form_sources;
CREATE POLICY "Service role manages external form sources"
    ON public.workspace_external_form_sources FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Workspace admins read external form source status" ON public.workspace_external_form_sources;
CREATE POLICY "Workspace admins read external form source status"
    ON public.workspace_external_form_sources FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = workspace_external_form_sources.workspace_id
          AND wm.user_id = (SELECT auth.uid())
          AND wm.role IN ('owner', 'admin')
          AND wm.is_active = true
    ));

REVOKE ALL ON public.workspace_external_form_sources FROM PUBLIC, anon;
GRANT ALL ON public.workspace_external_form_sources TO service_role;
GRANT SELECT ON public.workspace_external_form_sources TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at_wefs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_wefs ON public.workspace_external_form_sources;
CREATE TRIGGER set_updated_at_wefs
    BEFORE UPDATE ON public.workspace_external_form_sources
    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_wefs();

-- RPC: salvar configuração (admin-only, chave vai pro Vault)
CREATE OR REPLACE FUNCTION public.save_workspace_external_form_source(
    p_workspace_id uuid,
    p_external_project_url text,
    p_secret text,
    p_external_table_name text DEFAULT 'aplic-acelerador'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id uuid;
    v_existing record;
BEGIN
    IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'workspace_id obrigatorio'; END IF;
    IF NULLIF(TRIM(COALESCE(p_external_project_url, '')), '') IS NULL THEN
        RAISE EXCEPTION 'external_project_url obrigatorio';
    END IF;
    IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN
        RAISE EXCEPTION 'secret (service role key) obrigatorio';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
        RAISE EXCEPTION 'workspace nao encontrado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = (SELECT auth.uid())
          AND role IN ('owner', 'admin')
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner do workspace';
    END IF;

    v_secret_id := vault.create_secret(
        p_secret,
        'extform@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
        'external form source service role key'
    );

    SELECT * INTO v_existing FROM public.workspace_external_form_sources
        WHERE workspace_id = p_workspace_id AND provider = 'supabase';

    IF v_existing IS NOT NULL THEN
        UPDATE public.workspace_external_form_sources SET
            external_project_url = p_external_project_url,
            external_table_name = p_external_table_name,
            secret_key_id = v_secret_id,
            status = 'testing',
            last_error = NULL,
            updated_at = now()
        WHERE workspace_id = p_workspace_id AND provider = 'supabase';
    ELSE
        INSERT INTO public.workspace_external_form_sources
            (workspace_id, provider, external_project_url, external_table_name, secret_key_id, status)
        VALUES
            (p_workspace_id, 'supabase', p_external_project_url, p_external_table_name, v_secret_id, 'testing');
    END IF;

    RETURN 'saved';
END;
$$;

-- RPC: status (nunca devolve o segredo)
CREATE OR REPLACE FUNCTION public.get_workspace_external_form_source_status(
    p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row record;
BEGIN
    SELECT id, provider, external_project_url, external_table_name, status, last_tested_at, last_error
    INTO v_row
    FROM public.workspace_external_form_sources
    WHERE workspace_id = p_workspace_id AND provider = 'supabase'
    LIMIT 1;

    IF v_row IS NOT NULL THEN
        RETURN jsonb_build_object(
            'configured', true,
            'status', v_row.status,
            'external_project_url', v_row.external_project_url,
            'external_table_name', v_row.external_table_name,
            'last_tested_at', v_row.last_tested_at,
            'last_error', v_row.last_error
        );
    END IF;

    RETURN jsonb_build_object('configured', false, 'status', 'not_configured');
END;
$$;

-- RPC: marcar status (connected/error)
CREATE OR REPLACE FUNCTION public.update_workspace_external_form_source_status(
    p_workspace_id uuid,
    p_status text,
    p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.workspace_external_form_sources SET
        status = p_status,
        last_error = p_error,
        last_tested_at = now()
    WHERE workspace_id = p_workspace_id AND provider = 'supabase';
END;
$$;

REVOKE ALL ON FUNCTION public.save_workspace_external_form_source(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_workspace_external_form_source(uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_workspace_external_form_source_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_external_form_source_status(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_workspace_external_form_source_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_workspace_external_form_source_status(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';
