-- Corrige RLS de disparos/disparo_tags pra respeitar o sistema granular de
-- permissões por feature (app_feature_role_permissions / app_feature_user_overrides).
--
-- Bug encontrado em auditoria (2026-07-05): hasFeaturePermission('disparos',
-- 'configuracao') no client pode liberar edição pra um usuário 'member' via
-- override (app_feature_user_overrides.can_edit = true), fazendo os botões
-- de criar/editar aparecerem habilitados na UI. Mas as policies de escrita
-- em disparos/disparo_tags exigiam só is_workspace_admin(workspace_id)
-- (owner/admin), ignorando completamente o sistema de override — resultado:
-- a escrita falhava com erro de RLS mesmo pra quem tinha permissão
-- explicitamente concedida pela tela de permissões.

CREATE OR REPLACE FUNCTION can_write_disparos(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        is_workspace_admin(p_workspace_id)
        OR EXISTS (
            SELECT 1 FROM app_feature_user_overrides
            WHERE workspace_id = p_workspace_id
              AND app_slug = 'disparos'
              AND feature_key = 'configuracao'
              AND user_id = auth.uid()
              AND can_edit = true
        )
        OR EXISTS (
            SELECT 1
            FROM app_feature_role_permissions afrp
            JOIN workspace_members wm
              ON wm.workspace_id = afrp.workspace_id
             AND wm.role = afrp.role
            WHERE afrp.workspace_id = p_workspace_id
              AND afrp.app_slug = 'disparos'
              AND afrp.feature_key = 'configuracao'
              AND afrp.can_edit = true
              AND wm.user_id = auth.uid()
              AND wm.is_active = true
        );
$$;

COMMENT ON FUNCTION can_write_disparos(UUID) IS
    'Permite escrita em disparos/disparo_tags pra owner/admin OU qualquer usuário/role com can_edit=true explicitamente concedido na feature disparos.configuracao.';

-- disparos
DROP POLICY IF EXISTS "workspace_admins_insert_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_admins_update_disparos" ON disparos;
DROP POLICY IF EXISTS "workspace_admins_delete_disparos" ON disparos;

CREATE POLICY "workspace_admins_insert_disparos"
    ON disparos FOR INSERT
    TO authenticated
    WITH CHECK (can_write_disparos(workspace_id));

CREATE POLICY "workspace_admins_update_disparos"
    ON disparos FOR UPDATE
    TO authenticated
    USING (can_write_disparos(workspace_id))
    WITH CHECK (can_write_disparos(workspace_id));

CREATE POLICY "workspace_admins_delete_disparos"
    ON disparos FOR DELETE
    TO authenticated
    USING (can_write_disparos(workspace_id));

-- disparo_tags
DROP POLICY IF EXISTS "workspace_admins_insert_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_admins_update_disparo_tags" ON disparo_tags;
DROP POLICY IF EXISTS "workspace_admins_delete_disparo_tags" ON disparo_tags;

CREATE POLICY "workspace_admins_insert_disparo_tags"
    ON disparo_tags FOR INSERT
    TO authenticated
    WITH CHECK (can_write_disparos(workspace_id));

CREATE POLICY "workspace_admins_update_disparo_tags"
    ON disparo_tags FOR UPDATE
    TO authenticated
    USING (can_write_disparos(workspace_id))
    WITH CHECK (can_write_disparos(workspace_id));

CREATE POLICY "workspace_admins_delete_disparo_tags"
    ON disparo_tags FOR DELETE
    TO authenticated
    USING (can_write_disparos(workspace_id));

NOTIFY pgrst, 'reload schema';
