-- ============================================================================
-- FASE 2 — Isolamento de credenciais — fatia 2: RPCs de resolucao (service_role)
-- docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md (Fatia 2)
-- docs/PLANO-MULTI-TENANT-AGENCY.md (secao 5.3)
--
-- Duas funcoes SECURITY DEFINER, acessiveis SOMENTE a service_role
-- (GRANT EXECUTE revogado de PUBLIC):
--   - get_workspace_credential_meta(ws, provider): leitura LEVE de metadados
--     (secret_key_id + rotation_version + metadata). Chamada a CADA request pelo
--     helper para recompor a chave de cache (decisao 5.3.1).
--   - get_decrypted_secret(secret_key_id): decifra o segredo no Vault. Chamada
--     so no cache MISS (cara). Le vault.decrypted_secrets como dono da funcao.
--
-- Por que SECURITY DEFINER + GRANT: a tabela workspace_integration_credentials
-- e vault.decrypted_secrets sao service_role-only (RLS/GRANT). A funcao roda
-- como o dono (bypassa RLS) mas so pode ser CHAMADA por service_role — e o
-- "gate" controlado por GRANT EXECUTE. authenticated nao tem EXECUTE => negado.
--
-- Idempotente: OR REPLACE / REVOKE / GRANT.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.get_workspace_credential_meta(
    p_workspace_id uuid,
    p_provider text
)
RETURNS TABLE(secret_key_id uuid, rotation_version int, metadata jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT secret_key_id, rotation_version, metadata
    FROM public.workspace_integration_credentials
    WHERE workspace_id = p_workspace_id
      AND provider = p_provider
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_workspace_credential_meta(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_credential_meta(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_decrypted_secret(p_secret_key_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE id = p_secret_key_id
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_decrypted_secret(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_decrypted_secret(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
