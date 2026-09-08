-- ============================================================================
-- FASE 3 — Descoberta de sub-contas — fatia 2: RPCs de credencial de agencia
-- docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.2)
--
-- Espelha exatamente o par de migrations da Fase 2/Fase 4 para workspace:
--   - get_agency_credential_meta(agency): leitura leve de metadados
--     (secret_key_id + rotation_version + company_id), SOMENTE service_role
--     (mesmo gate por GRANT EXECUTE de get_workspace_credential_meta).
--     Chamada pelo helper Deno resolveAgencyCredential a cada request.
--   - save_agency_ghl_credential(agency, token, company_id): self-service —
--     o dono/admin da agencia cola o PROPRIO token de agencia pela UI. Guarda
--     de papel via is_agency_admin(p_agency_id). Grava no vault (nunca
--     plaintext) e sobe rotation_version. Retorna SO rotation_version.
--   - get_agency_ghl_credential_status(agency): para a UI saber "conectado/nao".
--
-- Reaproveita public.get_decrypted_secret(uuid) ja existente
-- (20260724000000_fase2_credential_rpcs.sql) — generica por secret_key_id,
-- sem logica especifica de workspace; serve para agencia sem alteracao.
--
-- Idempotente: OR REPLACE / REVOKE / GRANT.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- Leitura leve de metadados (service_role apenas) -----------------------------
CREATE OR REPLACE FUNCTION public.get_agency_credential_meta(
    p_agency_id uuid
)
RETURNS TABLE(secret_key_id uuid, rotation_version int, company_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT secret_key_id, rotation_version, company_id
    FROM public.agency_ghl_credentials
    WHERE agency_id = p_agency_id
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_agency_credential_meta(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_agency_credential_meta(uuid) TO service_role;

-- Self-service: dono/admin da agencia cadastra o proprio token ---------------
CREATE OR REPLACE FUNCTION public.save_agency_ghl_credential(
    p_agency_id uuid,
    p_token text,
    p_company_id text
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
    v_secret_id uuid;
    v_new_version int;
BEGIN
    -- Guarda de papel: somente admin/owner DESTA agencia grava o token.
    IF NOT public.is_agency_admin(p_agency_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner da agencia'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'token obrigatorio'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_company_id, '')), '') IS NULL THEN
        RAISE EXCEPTION 'company_id obrigatorio'
            USING ERRCODE = '22023';
    END IF;

    -- Nonce no nome do segredo (UNIQUE em vault.secrets) — mesma razao de
    -- save_workspace_credential: cada rotacao cria um segredo novo.
    v_secret_id := vault.create_secret(
        p_token,
        'agency-ghl@' || p_agency_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
        'agency ghl credential (read-only)'
    );

    INSERT INTO public.agency_ghl_credentials
        (agency_id, secret_key_id, company_id, rotation_version)
    VALUES
        (p_agency_id, v_secret_id, TRIM(p_company_id), 1)
    ON CONFLICT (agency_id) DO UPDATE
        SET secret_key_id    = EXCLUDED.secret_key_id,
            company_id       = EXCLUDED.company_id,
            rotation_version = public.agency_ghl_credentials.rotation_version + 1
    RETURNING rotation_version INTO v_new_version;

    RETURN v_new_version; -- NUNCA o token
END;
$$;

COMMENT ON FUNCTION public.save_agency_ghl_credential(uuid, text, text) IS
'Self-service (admin/owner da agencia): cadastra/atualiza o token de agencia GHL (so-leitura, secao 5 do handoff) no vault e sobe rotation_version. Retorna so rotation_version.';

REVOKE ALL ON FUNCTION public.save_agency_ghl_credential(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_agency_ghl_credential(uuid, text, text) TO authenticated, service_role;

-- Status para a UI (conectado/nao), sem token ---------------------------------
CREATE OR REPLACE FUNCTION public.get_agency_ghl_credential_status(
    p_agency_id uuid
)
RETURNS TABLE(company_id text, rotation_version int, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT agc.company_id, agc.rotation_version, agc.updated_at
    FROM public.agency_ghl_credentials agc
    WHERE agc.agency_id = p_agency_id
      AND public.is_agency_admin(p_agency_id);
$$;

COMMENT ON FUNCTION public.get_agency_ghl_credential_status(uuid) IS
'Self-service (admin/owner da agencia): status do token de agencia GHL conectado (sem o token), para a UI.';

REVOKE ALL ON FUNCTION public.get_agency_ghl_credential_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_agency_ghl_credential_status(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
