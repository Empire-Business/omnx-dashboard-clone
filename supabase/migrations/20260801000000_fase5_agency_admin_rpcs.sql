-- ============================================================================
-- FASE 5 — Gestao de agencia: suspender/reativar sub-conta (workspace)
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secoes 8, 3.6)
--
-- O dono/admin de uma agencia precisa suspender ou reativar uma sub-conta
-- (agency_workspaces) sem tocar no banco. Duas RPCs SECURITY DEFINER, abertas
-- a `authenticated` (a seguranca e a guarda interna is_agency_admin — quem nao
-- e admin/owner da agencia dona daquela sub-conta recebe 42501):
--
--   - suspend_agency_workspace(p_agency_workspace_id): so suspende sub-conta
--     'active'. Guard de estado: sub-conta ja suspensa/pending -> erro.
--   - reactivate_agency_workspace(p_agency_workspace_id, p_confirmed): so
--     reativa sub-conta 'suspended', e SOMENTE com p_confirmed = true (secao
--     3.6 do plano-mae: reativacao NUNCA e automatica, exige confirmacao
--     explicita de quem chama).
--
-- Por que SQL (nao edge function): mesmo racional da migration
-- 20260731000000_fase4_save_workspace_credential.sql — porteiro pequeno,
-- testavel via supabase-js .rpc, aplicavel como migration versionada.
--
-- ARMADILHA (docs/HANDOFF-FASE-4-BYOK.md): dentro de uma edge function que usa
-- o client service_role, chamar estas RPCs via supabaseAdmin.rpc(...) SEMPRE
-- falha/retorna false, pois dependem de auth.uid() (NULL no service_role).
-- Estas RPCs sao para chamada direta do FRONTEND autenticado (supabase-js do
-- browser, com o JWT do usuario logado).
--
-- Idempotente: CREATE OR REPLACE FUNCTION / REVOKE / GRANT.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.suspend_agency_workspace(
    p_agency_workspace_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agency_id UUID;
    v_status TEXT;
BEGIN
    SELECT agency_id, status
      INTO v_agency_id, v_status
      FROM public.agency_workspaces
     WHERE id = p_agency_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'agency_workspace nao encontrado: %', p_agency_workspace_id
            USING ERRCODE = '22023';
    END IF;

    -- Guarda de papel: somente admin/owner DESTA agencia suspende a sub-conta.
    IF NOT public.is_agency_admin(v_agency_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner da agencia'
            USING ERRCODE = '42501';
    END IF;

    IF v_status <> 'active' THEN
        RAISE EXCEPTION 'estado invalido: sub-conta esta "%", so pode suspender "active"', v_status
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.agency_workspaces
       SET status = 'suspended'
     WHERE id = p_agency_workspace_id;
END;
$$;

COMMENT ON FUNCTION public.suspend_agency_workspace(UUID) IS
'Admin/owner da agencia: suspende uma sub-conta (agency_workspaces) que esteja "active". Guard de estado — nao suspende de novo uma ja suspensa/pending.';

REVOKE ALL ON FUNCTION public.suspend_agency_workspace(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_agency_workspace(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reativacao — exige confirmacao explicita (secao 3.6: NUNCA automatica)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivate_agency_workspace(
    p_agency_workspace_id UUID,
    p_confirmed BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agency_id UUID;
    v_status TEXT;
BEGIN
    SELECT agency_id, status
      INTO v_agency_id, v_status
      FROM public.agency_workspaces
     WHERE id = p_agency_workspace_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'agency_workspace nao encontrado: %', p_agency_workspace_id
            USING ERRCODE = '22023';
    END IF;

    -- Guarda de papel: somente admin/owner DESTA agencia reativa a sub-conta.
    IF NOT public.is_agency_admin(v_agency_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner da agencia'
            USING ERRCODE = '42501';
    END IF;

    IF v_status <> 'suspended' THEN
        RAISE EXCEPTION 'estado invalido: sub-conta esta "%", so pode reativar "suspended"', v_status
            USING ERRCODE = '22023';
    END IF;

    IF p_confirmed IS NOT TRUE THEN
        RAISE EXCEPTION 'reativacao exige confirmacao explicita (p_confirmed=true) — secao 3.6 do plano-mae: NUNCA reativar automaticamente'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.agency_workspaces
       SET status = 'active'
     WHERE id = p_agency_workspace_id;
END;
$$;

COMMENT ON FUNCTION public.reactivate_agency_workspace(UUID, BOOLEAN) IS
'Admin/owner da agencia: reativa uma sub-conta (agency_workspaces) que esteja "suspended", exigindo p_confirmed=true (nunca automatico — secao 3.6 do plano-mae).';

REVOKE ALL ON FUNCTION public.reactivate_agency_workspace(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_agency_workspace(UUID, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
