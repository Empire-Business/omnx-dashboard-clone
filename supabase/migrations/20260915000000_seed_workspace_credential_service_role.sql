-- ============================================================
-- Migration: 20260915000000
-- RPC genérica de seed de credencial service_role-only
-- (bypassa is_workspace_admin, apenas service_role executa)
-- ============================================================
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.seed_workspace_credential_service_role(
    p_workspace_id uuid,
    p_provider text,
    p_secret text,
    p_metadata jsonb DEFAULT '{}'::jsonb
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
    IF p_workspace_id IS NULL THEN
        RAISE EXCEPTION 'workspace_id obrigatorio' USING ERRCODE = '22023';
    END IF;

    IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion', 'openrouter') THEN
        RAISE EXCEPTION 'provider invalido (use ghl, meta, notion ou openrouter)'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN
        RAISE EXCEPTION 'secret obrigatorio' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
        RAISE EXCEPTION 'workspace nao encontrado' USING ERRCODE = '22023';
    END IF;

    v_secret_id := vault.create_secret(
        p_secret,
        p_provider || '@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
        'workspace credential (seed via service_role)'
    );

    INSERT INTO public.workspace_integration_credentials
        (workspace_id, provider, secret_key_id, metadata, rotation_version)
    VALUES
        (p_workspace_id, p_provider, v_secret_id, COALESCE(p_metadata, '{}'::jsonb), 1)
    ON CONFLICT (workspace_id, provider) DO UPDATE
        SET secret_key_id    = EXCLUDED.secret_key_id,
            metadata         = EXCLUDED.metadata,
            rotation_version = public.workspace_integration_credentials.rotation_version + 1
    RETURNING rotation_version INTO v_new_version;

    RETURN v_new_version;
END;
$$;

COMMENT ON FUNCTION public.seed_workspace_credential_service_role(uuid, text, text, jsonb) IS
'Seed de credencial service_role-only (bypassa is_workspace_admin). Mesmo padrao de save_workspace_credential, mas sem guarda de papel. Usado para migrar credenciais de env globais para Vault por workspace.';

REVOKE ALL ON FUNCTION public.seed_workspace_credential_service_role(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_workspace_credential_service_role(uuid, text, text, jsonb) TO service_role;
