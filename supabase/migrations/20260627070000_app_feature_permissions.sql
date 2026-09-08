-- Permissões por feature dentro de cada app
-- Permite controlar o que aparece DENTRO de um app por papel ou usuário

-- =============================================================================
-- Table: app_feature_role_permissions
-- =============================================================================
CREATE TABLE app_feature_role_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    app_slug TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    role TEXT NOT NULL,
    can_view BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, app_slug, feature_key, role)
);

CREATE INDEX idx_app_feature_role_perms_lookup ON app_feature_role_permissions(workspace_id, app_slug, feature_key, role);

-- =============================================================================
-- Table: app_feature_user_overrides
-- =============================================================================
CREATE TABLE app_feature_user_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    app_slug TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, app_slug, feature_key, user_id)
);

CREATE INDEX idx_app_feature_user_overrides_lookup ON app_feature_user_overrides(workspace_id, app_slug, feature_key, user_id);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE app_feature_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_feature_user_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_role_perms: members can read"
    ON app_feature_role_permissions FOR SELECT TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "feature_role_perms: admin can write"
    ON app_feature_role_permissions FOR ALL TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner','admin')))
    WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner','admin')));

CREATE POLICY "feature_user_overrides: members can read own"
    ON app_feature_user_overrides FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner','admin')));

CREATE POLICY "feature_user_overrides: admin can write"
    ON app_feature_user_overrides FOR ALL TO authenticated
    USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner','admin')))
    WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner','admin')));

CREATE POLICY "feature_role_perms: service role"
    ON app_feature_role_permissions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "feature_user_overrides: service role"
    ON app_feature_user_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- Seed: defaults por role
-- =============================================================================
DO $$
DECLARE
    ws RECORD;
BEGIN
    FOR ws IN SELECT id FROM workspaces LOOP
        -- leads.limpeza → owner, admin only
        INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
        VALUES
            (ws.id, 'leads', 'limpeza', 'owner', true),
            (ws.id, 'leads', 'limpeza', 'admin', true),
            (ws.id, 'leads', 'limpeza', 'member', false)
        ON CONFLICT DO NOTHING;

        -- pre-vendas.sdr-leaderboard → todos
        INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
        VALUES
            (ws.id, 'pre-vendas', 'sdr-leaderboard', 'owner', true),
            (ws.id, 'pre-vendas', 'sdr-leaderboard', 'admin', true),
            (ws.id, 'pre-vendas', 'sdr-leaderboard', 'member', true)
        ON CONFLICT DO NOTHING;

        -- pre-vendas.auditoria-ia → todos
        INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
        VALUES
            (ws.id, 'pre-vendas', 'auditoria-ia', 'owner', true),
            (ws.id, 'pre-vendas', 'auditoria-ia', 'admin', true),
            (ws.id, 'pre-vendas', 'auditoria-ia', 'member', true)
        ON CONFLICT DO NOTHING;

        -- aquisicao-vendas.dados-financeiros → owner, admin only
        INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
        VALUES
            (ws.id, 'aquisicao-vendas', 'dados-financeiros', 'owner', true),
            (ws.id, 'aquisicao-vendas', 'dados-financeiros', 'admin', true),
            (ws.id, 'aquisicao-vendas', 'dados-financeiros', 'member', false)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
