-- ============================================================================
-- RPC create_agency_for_owner_service_role — cria a PRIMEIRA agência de uma
-- instância (bootstrap do modelo Agency).
-- docs/PLANO-MULTI-TENANT-AGENCY.md (seção 3) + docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md
--
-- ACHADO desta sessão: existe RPC de bootstrap para credencial GHL
-- (seed_workspace_ghl_credential_service_role, migration 20260809000000) e
-- para provisionar SUB-CONTAS dentro de uma agência (provision-new-client.ts
-- --mode=agency-subaccount), mas nenhuma via segura para criar a AGÊNCIA em
-- si — as policies de `agencies`/`agency_members` são `service_role`-only
-- (por design: criar agência é ato do operador da plataforma, não
-- self-service do cliente), mas sem RPC o único jeito de fazer isso hoje
-- seria SQL solto no editor do Supabase — proibido pela regra 20 do
-- CLAUDE.md (toda alteração de banco via migration).
--
-- Esta RPC fecha esse gap: idempotente (se o usuário já for owner de uma
-- agência, retorna o id existente em vez de duplicar), fail-closed (usuário
-- precisa existir em auth.users), sempre cria o registro de membership
-- (agency_members, role='owner') no mesmo INSERT lógico — nunca uma agência
-- "orfã" sem nenhum membro.
--
-- Uso em produção: docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md, passo 1.
--
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- Idempotente: CREATE OR REPLACE, checagem de existência antes do INSERT.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.create_agency_for_owner_service_role(
    p_owner_id UUID,
    p_agency_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agency_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_id) THEN
        RAISE EXCEPTION 'usuário % não encontrado em auth.users', p_owner_id;
    END IF;

    IF p_agency_name IS NULL OR length(trim(p_agency_name)) = 0 THEN
        RAISE EXCEPTION 'p_agency_name não pode ser vazio';
    END IF;

    -- Idempotente: se o usuário já é owner de uma agência, não duplica.
    SELECT id INTO v_agency_id FROM public.agencies WHERE owner_id = p_owner_id;
    IF v_agency_id IS NOT NULL THEN
        RETURN v_agency_id;
    END IF;

    INSERT INTO public.agencies (name, owner_id)
    VALUES (p_agency_name, p_owner_id)
    RETURNING id INTO v_agency_id;

    INSERT INTO public.agency_members (agency_id, user_id, role, invited_by, is_active)
    VALUES (v_agency_id, p_owner_id, 'owner', p_owner_id, true)
    ON CONFLICT (agency_id, user_id) DO NOTHING;

    RETURN v_agency_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agency_for_owner_service_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_agency_for_owner_service_role(UUID, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_agency_for_owner_service_role(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_agency_for_owner_service_role(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.create_agency_for_owner_service_role IS
    'Bootstrap: cria a primeira agência de uma instância + membership owner. '
    'service_role only (ato do operador da plataforma, não self-service). '
    'Idempotente por owner_id. Ver docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md.';

NOTIFY pgrst, 'reload schema';
