-- Move controle da Clara de ghl_users para workspace_members
-- workspace_members.user_id = auth.users.id diretamente — sem depender de auth_user_id
-- Isso resolve o caso onde o usuário tem login mas não tem auth_user_id em ghl_users

-- 1. Adicionar coluna em workspace_members
ALTER TABLE workspace_members ADD COLUMN IF NOT EXISTS clara_habilitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workspace_members.clara_habilitado IS
  'Se true, o membro pode usar a Clara no dashboard. Gerenciado em Settings > Usuários > Sistema.';

-- 2. Habilitar Clara para os dois usuários pelo email
UPDATE workspace_members wm
SET clara_habilitado = true
FROM auth.users au
WHERE au.id = wm.user_id
  AND au.email IN ('ferramentas@aliancadealtovalor.com.br', 'sandro@wtrade.com.br');

-- 3. Atualizar RPC para expor clara_habilitado (DROP necessário pois o tipo de retorno muda)
DROP FUNCTION IF EXISTS get_workspace_members_with_profile(UUID);
CREATE FUNCTION get_workspace_members_with_profile(p_workspace_id UUID)
RETURNS TABLE (
  id               UUID,
  workspace_id     UUID,
  user_id          UUID,
  role             TEXT,
  invited_by       UUID,
  joined_at        TIMESTAMPTZ,
  is_active        BOOLEAN,
  clara_habilitado BOOLEAN,
  email            TEXT,
  full_name        TEXT
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
    wm.clara_habilitado,
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
    AND p_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  ORDER BY wm.joined_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_workspace_members_with_profile(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
