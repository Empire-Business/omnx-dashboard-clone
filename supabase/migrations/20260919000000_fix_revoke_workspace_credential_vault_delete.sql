-- Fix: revoke_workspace_credential quebrava em runtime com
--   "function vault.delete_secret(uuid) does not exist" (42883)
-- porque a extensao supabase_vault 0.3.1 (versao em producao E no banco de
-- teste, verificado em 2026-07-15) nao expoe vault.delete_secret.
-- A funcao vault.delete_secret(uuid), nas versoes em que existe, e definida
-- como DELETE FROM vault.secrets WHERE id = $1 — o DELETE direto abaixo e
-- semanticamente identico e funciona em todas as versoes do vault.
-- Unico ponto alterado em relacao a 20260830000000: a linha do PERFORM.

CREATE OR REPLACE FUNCTION public.revoke_workspace_credential(
  p_workspace_id uuid,
  p_provider text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  IF NOT public.is_workspace_admin(p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden: somente admin/owner do workspace'
      USING ERRCODE = '42501';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion', 'openrouter') THEN
    RAISE EXCEPTION 'provider invalido' USING ERRCODE = '22023';
  END IF;

  SELECT secret_key_id INTO v_secret_id
  FROM public.workspace_integration_credentials
  WHERE workspace_id = p_workspace_id AND provider = p_provider
  FOR UPDATE;

  IF v_secret_id IS NULL THEN
    RAISE EXCEPTION 'credencial nao encontrada' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.workspace_integration_credentials
  WHERE workspace_id = p_workspace_id AND provider = p_provider;

  -- vault.delete_secret(v_secret_id) nao existe no vault 0.3.1; o DELETE
  -- direto e o que a funcao faz internamente nas versoes em que existe.
  DELETE FROM vault.secrets WHERE id = v_secret_id;
END;
$$;

COMMENT ON FUNCTION public.revoke_workspace_credential(uuid, text) IS
'Admin/owner remove a credencial da propria conta e o segredo associado no Vault; nunca retorna plaintext.';

REVOKE ALL ON FUNCTION public.revoke_workspace_credential(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_workspace_credential(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
