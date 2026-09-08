-- Migration: ativa o app 'criativos' em todos os workspaces que já têm 'trafego' ativo
-- O ranking de criativos era parte do app 'trafego' e agora é um app independente.
-- Workspaces que tinham acesso ao tráfego mantêm acesso ao módulo de criativos automaticamente.

INSERT INTO workspace_apps (workspace_id, app_slug, is_active, settings, created_at, updated_at)
SELECT
  workspace_id,
  'criativos'      AS app_slug,
  true             AS is_active,
  '{}'::jsonb      AS settings,
  NOW()            AS created_at,
  NOW()            AS updated_at
FROM workspace_apps
WHERE app_slug = 'trafego'
  AND is_active = true
ON CONFLICT (workspace_id, app_slug) DO NOTHING;

-- Libera visualização para owner e admin nos workspaces onde o app foi ativado
INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view, created_at)
SELECT
  workspace_id,
  'criativos' AS app_slug,
  role,
  true,
  NOW()
FROM app_role_permissions
WHERE app_slug = 'trafego'
  AND can_view = true
  AND role IN ('owner', 'admin')
ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;
