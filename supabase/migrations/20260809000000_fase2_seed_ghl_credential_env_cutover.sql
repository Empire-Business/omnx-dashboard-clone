-- Migration: RPC de seed (service_role-only) para o cutover da chave GHL —
-- do env global (GHL_API_KEY) para o Vault por workspace.
--
-- CONTEXTO
--   A Fase 2 (isolamento de credenciais) já migrou TODAS as edge functions GHL
--   para resolver a credencial POR WORKSPACE via workspace_integration_credentials
--   (Vault) + helper resolve-workspace-credentials.ts — nenhuma function lê mais
--   GHL_API_KEY/GHL_LOCATION_ID de env (confirmado: grep em supabase/functions/
--   não encontra nenhuma leitura desses nomes). O que ficou pendente: a
--   credencial real do workspace único desta instância (Single-Tenant Lock, ver
--   docs/SINGLE-TENANT-LOCK.md) nunca foi de fato SEMEADA na tabela — o cutover
--   documentado em docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md ficou como um
--   bloco de SQL manual (WITH ... INSERT) que o operador colaria à mão a cada
--   execução, sem guarda de papel nem validação de input.
--
-- O QUE ESTA MIGRATION FAZ
--   Cria `seed_workspace_ghl_credential_service_role(workspace_id, ghl_api_key,
--   ghl_location_id)` — mesmo padrão de `save_workspace_credential` (Fase 4),
--   mas SEM a guarda de `is_workspace_admin` (não há usuário logado nesse
--   fluxo) e restrita por GRANT a `service_role` (nunca `anon`/`authenticated`).
--   É "migração seed" no sentido pedido: a FUNÇÃO (schema) é versionada em git
--   normalmente; o SEGREDO REAL nunca entra em uma migration nem em qualquer
--   arquivo versionado — é passado em tempo de execução pelo operador via
--   `psql -v` ou por uma chamada RPC autenticada como service_role, exatamente
--   como toda credencial neste projeto (regra 17 do CLAUDE.md: segredo nunca no
--   git). Ver docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md (seção atualizada)
--   para o comando exato do cutover em produção.
--
-- Idempotente: ON CONFLICT (workspace_id, provider) atualiza e incrementa
-- rotation_version (mesmo comportamento de save_workspace_credential).

CREATE OR REPLACE FUNCTION public.seed_workspace_ghl_credential_service_role(
  p_workspace_id uuid,
  p_ghl_api_key text,
  p_ghl_location_id text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
DECLARE
  v_secret_id uuid;
  v_new_version int;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_ghl_api_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ghl_api_key obrigatoria' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(TRIM(COALESCE(p_ghl_location_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'ghl_location_id obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % nao encontrado', p_workspace_id USING ERRCODE = '22023';
  END IF;

  -- Nonce no nome do segredo: vault.create_secret tem UNIQUE(name) — cada
  -- rotação (mesmo provider/workspace) precisa de um nome novo (armadilha já
  -- depurada em save_workspace_credential, Fase 4).
  v_secret_id := vault.create_secret(
    p_ghl_api_key,
    'ghl@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''),
    'workspace credential (seed do cutover env->vault)'
  );

  INSERT INTO public.workspace_integration_credentials
    (workspace_id, provider, secret_key_id, metadata, rotation_version)
  VALUES
    (p_workspace_id, 'ghl', v_secret_id, jsonb_build_object('location_id', p_ghl_location_id), 1)
  ON CONFLICT (workspace_id, provider) DO UPDATE
    SET secret_key_id    = EXCLUDED.secret_key_id,
        metadata         = EXCLUDED.metadata,
        rotation_version = public.workspace_integration_credentials.rotation_version + 1
  RETURNING rotation_version INTO v_new_version;

  RETURN v_new_version; -- NUNCA o segredo
END;
$function$;

COMMENT ON FUNCTION public.seed_workspace_ghl_credential_service_role(uuid, text, text) IS
  'Seed/cutover service_role-only da credencial GHL de um workspace (env global -> '
  'Vault). Sem guarda de is_workspace_admin (fluxo sem usuario logado) — a guarda '
  'real é o GRANT restrito a service_role abaixo. Nunca chamar com anon/authenticated.';

-- Guarda real: só service_role executa (nunca anon/authenticated).
REVOKE ALL ON FUNCTION public.seed_workspace_ghl_credential_service_role(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_workspace_ghl_credential_service_role(uuid, text, text)
  TO service_role;
