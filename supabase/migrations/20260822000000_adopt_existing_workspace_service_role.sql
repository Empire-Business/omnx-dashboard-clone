SET search_path = public, pg_catalog;

ALTER TABLE public.agency_workspaces
  DROP CONSTRAINT IF EXISTS agency_workspaces_provisioning_mode_check;

ALTER TABLE public.agency_workspaces
  ADD CONSTRAINT agency_workspaces_provisioning_mode_check
  CHECK (provisioning_mode IN ('auto_discovered', 'manual_byok', 'legacy_adopted'));

CREATE OR REPLACE FUNCTION public.adopt_existing_workspace_service_role(
  p_agency_id uuid,
  p_workspace_id uuid,
  p_confirmation_name text,
  p_ghl_location_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_workspace_name text;
  v_link_id uuid;
BEGIN
  SELECT name INTO v_workspace_name FROM public.workspaces WHERE id = p_workspace_id;
  IF v_workspace_name IS NULL OR p_confirmation_name IS DISTINCT FROM v_workspace_name THEN
    RAISE EXCEPTION 'confirmação do workspace inválida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = p_agency_id) THEN
    RAISE EXCEPTION 'agência não encontrada' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members wm JOIN public.workspaces w ON w.id = wm.workspace_id WHERE wm.workspace_id = p_workspace_id AND wm.user_id = w.owner_id AND wm.role = 'owner' AND wm.is_active) THEN
    RAISE EXCEPTION 'workspace sem owner ativo' USING ERRCODE = '23514';
  END IF;
  SELECT id INTO v_link_id FROM public.agency_workspaces WHERE workspace_id = p_workspace_id;
  IF v_link_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.agency_workspaces WHERE id = v_link_id AND agency_id = p_agency_id AND provisioning_mode = 'legacy_adopted') THEN RETURN v_link_id; END IF;
    RAISE EXCEPTION 'workspace já vinculado a outra agência' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.agency_workspaces (agency_id, workspace_id, provisioning_mode, ghl_location_id, status)
  VALUES (p_agency_id, p_workspace_id, 'legacy_adopted', p_ghl_location_id, 'active') RETURNING id INTO v_link_id;
  RETURN v_link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detach_adopted_workspace_service_role(p_workspace_id uuid, p_confirmation_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND name = p_confirmation_name) THEN RAISE EXCEPTION 'confirmação do workspace inválida' USING ERRCODE = '22023'; END IF;
  DELETE FROM public.agency_workspaces WHERE workspace_id = p_workspace_id AND provisioning_mode = 'legacy_adopted';
END;
$$;

REVOKE ALL ON FUNCTION public.adopt_existing_workspace_service_role(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.detach_adopted_workspace_service_role(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adopt_existing_workspace_service_role(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.detach_adopted_workspace_service_role(uuid, text) TO service_role;
NOTIFY pgrst, 'reload schema';
