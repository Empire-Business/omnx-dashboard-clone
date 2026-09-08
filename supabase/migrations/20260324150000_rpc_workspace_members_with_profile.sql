-- RPC: retorna workspace_members com email e full_name de auth.users
-- Necessário porque auth.users não é acessível diretamente via PostgREST
-- SECURITY DEFINER com security check: só retorna se o chamador é membro do workspace

CREATE OR REPLACE FUNCTION get_workspace_members_with_profile(p_workspace_id UUID)
RETURNS TABLE (
  id          UUID,
  workspace_id UUID,
  user_id     UUID,
  role        TEXT,
  invited_by  UUID,
  joined_at   TIMESTAMPTZ,
  is_active   BOOLEAN,
  email       TEXT,
  full_name   TEXT
)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE sql
AS $$
  SELECT
    wm.id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.invited_by,
    wm.joined_at,
    wm.is_active,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      split_part(u.email::TEXT, '@', 1)
    ) AS full_name
  FROM public.workspace_members wm
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
    AND wm.is_active = true
    -- Security: apenas membros ativos do workspace podem chamar
    AND p_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  ORDER BY wm.joined_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_workspace_members_with_profile(UUID) TO authenticated;
