-- Libera o provider OpenRouter no porteiro BYOK já existente. A credencial
-- permanece somente no Vault; owner/admin recebe apenas status/versão.
CREATE OR REPLACE FUNCTION public.save_workspace_credential(
  p_workspace_id uuid, p_provider text, p_secret text, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret_id uuid; v_new_version int; v_location_id text;
BEGIN
  IF NOT public.is_workspace_admin(p_workspace_id) THEN RAISE EXCEPTION 'forbidden: somente admin/owner do workspace' USING ERRCODE = '42501'; END IF;
  IF p_provider IS NULL OR p_provider NOT IN ('ghl', 'meta', 'notion', 'openrouter') THEN RAISE EXCEPTION 'provider invalido' USING ERRCODE = '22023'; END IF;
  IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NULL THEN RAISE EXCEPTION 'secret obrigatorio' USING ERRCODE = '22023'; END IF;
  v_secret_id := vault.create_secret(p_secret, p_provider || '@' || p_workspace_id::text || '@' || replace(gen_random_uuid()::text, '-', ''), 'workspace credential');
  INSERT INTO public.workspace_integration_credentials (workspace_id, provider, secret_key_id, metadata, rotation_version)
  VALUES (p_workspace_id, p_provider, v_secret_id, COALESCE(p_metadata, '{}'::jsonb), 1)
  ON CONFLICT (workspace_id, provider) DO UPDATE SET secret_key_id = EXCLUDED.secret_key_id, metadata = EXCLUDED.metadata, rotation_version = public.workspace_integration_credentials.rotation_version + 1
  RETURNING rotation_version INTO v_new_version;
  IF p_provider = 'ghl' THEN
    v_location_id := NULLIF(TRIM(COALESCE(p_metadata->>'location_id', '')), '');
    IF v_location_id IS NOT NULL THEN
      INSERT INTO public.ghl_integration_settings (workspace_id, ghl_location_id) VALUES (p_workspace_id, v_location_id)
      ON CONFLICT (workspace_id) DO UPDATE SET ghl_location_id = EXCLUDED.ghl_location_id, updated_at = now();
    END IF;
  END IF;
  RETURN v_new_version;
END;
$$;
COMMENT ON FUNCTION public.save_workspace_credential(uuid, text, text, jsonb) IS 'Admin/owner salva credencial GHL, Meta, Notion ou OpenRouter no Vault; nunca retorna plaintext.';
NOTIFY pgrst, 'reload schema';
