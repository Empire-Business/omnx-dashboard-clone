-- Migration: Adiciona workspace_id à tabela ghl_users
-- Objetivo: isolar usuários GHL por workspace/tenant e corrigir vazamento
-- de informações de time entre workspaces na RLS.
--
-- Ações:
--   1. Adiciona coluna workspace_id (UUID, nullable para backfill).
--   2. Cria FK para workspaces(id).
--   3. Cria índice em workspace_id.
--   4. Backfill: preenche workspace_id dos registros legados com o workspace
--      mais antigo existente (garante que não fiquem órfãos após a migration).
--   5. Atualiza policies RLS para filtrar por workspace_id, permitindo NULL
--      legado durante a transição.
--   6. Mantém policy de service_role com acesso total.

-- =============================================================================
-- 1. Coluna e constraints
-- =============================================================================
ALTER TABLE ghl_users
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ghl_users_workspace_id ON ghl_users(workspace_id);

COMMENT ON COLUMN ghl_users.workspace_id IS
    'Workspace ao qual o usuário GHL pertence. Isolamento por tenant.';

-- =============================================================================
-- 2. Backfill de registros legados
-- =============================================================================
DO $$
DECLARE
    default_workspace_id UUID;
BEGIN
    SELECT id INTO default_workspace_id
    FROM workspaces
    ORDER BY created_at ASC
    LIMIT 1;

    IF default_workspace_id IS NOT NULL THEN
        UPDATE ghl_users
        SET workspace_id = default_workspace_id
        WHERE workspace_id IS NULL;
    END IF;
END $$;

-- =============================================================================
-- 3. RLS por workspace (permitindo NULL legado durante transição)
-- =============================================================================
ALTER TABLE ghl_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_members_select_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_users" ON ghl_users;
DROP POLICY IF EXISTS "service_role_all_ghl_users" ON ghl_users;

CREATE POLICY "workspace_members_select_ghl_users"
    ON ghl_users FOR SELECT
    TO authenticated
    USING (
        workspace_id IS NULL
        OR is_workspace_member(workspace_id)
    );

CREATE POLICY "workspace_admins_update_ghl_users"
    ON ghl_users FOR UPDATE
    TO authenticated
    USING (
        workspace_id IS NULL
        OR is_workspace_admin(workspace_id)
    )
    WITH CHECK (
        workspace_id IS NULL
        OR is_workspace_admin(workspace_id)
    );

CREATE POLICY "workspace_admins_insert_ghl_users"
    ON ghl_users FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IS NULL
        OR is_workspace_admin(workspace_id)
    );

CREATE POLICY "service_role_all_ghl_users"
    ON ghl_users FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- 4. Grants
-- =============================================================================
GRANT ALL ON ghl_users TO service_role;
GRANT SELECT ON ghl_users TO authenticated;

NOTIFY pgrst, 'reload schema';
