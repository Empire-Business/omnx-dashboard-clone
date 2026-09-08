-- ============================================================================
-- FASE 4 — BYOK self-service — fatia 1: porteiro seguro de credencial
-- docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md (Fatia 1)
--
-- O cliente (admin/owner do workspace), ja logado, cadastra a PROPRIA chave
-- pela UI. A chave vai direto para o Vault; a tabela guarda so o ponteiro
-- (secret_key_id) + metadata nao sensivel. Ninguem le a chave de volta.
--
-- Duas RPCs SECURITY DEFINER, abertas a `authenticated` (a seguranca e a
-- guarda interna is_workspace_admin — anon fica de fora):
--   - save_workspace_credential(ws, provider, secret, metadata): grava a chave
--     no vault e faz upsert com rotation_version+1. Retorna SO rotation_version
--     (int) — NUNCA o segredo. E a UNICA via de escrita de credencial.
--   - get_workspace_credential_status(ws): para a UI saber "conectado/nao" e
--     mostrar metadata (location_id, ad_account_id) sem ler segredo.
--
-- Por que SQL (nao edge function): menos codigo, testavel via supabase-js .rpc,
-- e aplicavel como migration versionada (pipeline Teste->Staging->Producao).
-- A prova de posse (chamar a API do provedor) fica para a Fatia 4 (botao Testar).
--
-- Idempotente: OR REPLACE / REVOKE / GRANT.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.save_workspace_credential(
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
    -- Guarda de papel: somente admin/owner DESTE workspace grava a chave.
    IF NOT public.is_workspace_admin(p_workspace_id) THEN
        RAISE EXCEPTION 'forbidden: somente admin/owner do workspace'
            USING ERRCODE = '42501';
    END IF;

    IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion') THEN
        RAISE EXCEPTION 'provider invalido (use ghl, meta ou notion)'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN
        RAISE EXCEPTION 'secret obrigatorio'
            USING ERRCODE = '22023';
    END IF;

    -- O nome do segredo no vault tem UNIQUE (secrets_name_idx): incluir um nonce
    -- garante que cada ROTACAO (mesmo provider/workspace) crie um segredo novo em
    -- vez de colidir. O rótulo legivel fica provider@workspace@<nonce>.
    v_secret_id := vault.create_secret(
        p_secret,
        p_provider || '@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
        'workspace credential'
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

    RETURN v_new_version; -- NUNCA o segredo
END;
$$;

COMMENT ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) IS
'Self-service (admin/owner do workspace): cadastra/atualiza a credencial do provider no vault (sem plaintext) e sobe rotation_version. Retorna so rotation_version. Unica via de escrita de credencial por workspace.';

REVOKE ALL ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) TO authenticated, service_role;

-- Status para a UI (conectado/nao + metadata), sem segredo -------------------
CREATE OR REPLACE FUNCTION public.get_workspace_credential_status(
    p_workspace_id uuid
)
RETURNS TABLE(provider text, rotation_version int, metadata jsonb, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT wic.provider, wic.rotation_version, wic.metadata, wic.updated_at
    FROM public.workspace_integration_credentials wic
    WHERE wic.workspace_id = p_workspace_id
      AND public.is_workspace_admin(p_workspace_id);
$$;

COMMENT ON FUNCTION public.get_workspace_credential_status(uuid) IS
'Self-service (admin/owner): lista providers conectados do workspace + metadata (sem segredo), para a UI de Integracoes.';

REVOKE ALL ON FUNCTION public.get_workspace_credential_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_credential_status(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
