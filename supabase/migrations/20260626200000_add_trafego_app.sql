-- Migration: ativa o app 'trafego' em todos os workspaces que já têm 'aquisicao-vendas' ativo
-- O tráfego era parte de 'aquisicao-vendas' e agora é um app independente.
-- Workspaces que tinham acesso ao tráfego mantêm esse acesso automaticamente.

INSERT INTO workspace_apps (workspace_id, app_slug, is_active, settings, created_at, updated_at)
SELECT
  workspace_id,
  'trafego'        AS app_slug,
  true             AS is_active,
  '{}'::jsonb      AS settings,
  NOW()            AS created_at,
  NOW()            AS updated_at
FROM workspace_apps
WHERE app_slug = 'aquisicao-vendas'
  AND is_active = true
ON CONFLICT (workspace_id, app_slug) DO NOTHING;
