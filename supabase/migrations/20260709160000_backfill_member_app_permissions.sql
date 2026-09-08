-- Migration: Backfill member app permissions for existing workspaces
-- Resolve o problema de usuários "member" verem "Nenhum app disponível"
-- em workspaces antigos criados antes da migration 20260705000009.
--
-- Contexto:
-- - A migration 20260626151259 criou workspace_apps e app_role_permissions,
--   mas só seedou permissões para 'owner' e 'admin'.
-- - A migration 20260705000009 adicionou permissões para 'member' e fez
--   backfill, mas APENAS para workspaces que ainda não tinham nenhum
--   workspace_apps configurado (WHERE wa.id IS NULL).
-- - Portanto, workspaces que já tinham apps ativos nunca receberam
--   app_role_permissions.role = 'member'.
-- - Esta migration corrige isso garantindo que todo app ativo em um
--   workspace também tenha permissão de visualização para 'member'.

INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
SELECT DISTINCT wa.workspace_id, wa.app_slug, 'member', true
FROM workspace_apps wa
WHERE wa.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM app_role_permissions arp
    WHERE arp.workspace_id = wa.workspace_id
      AND arp.app_slug = wa.app_slug
      AND arp.role = 'member'
  )
ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;
