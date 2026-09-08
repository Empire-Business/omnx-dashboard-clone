-- Migration: Sub-apps Modulares — Foundation
-- Cria tabelas de controle de apps por workspace, permissões por role e overrides por usuário.
-- Branch: feat/sub-apps-modulares

-- =============================================================================
-- Table: workspace_apps
-- =============================================================================
CREATE TABLE workspace_apps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    app_slug TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, app_slug)
);

CREATE INDEX idx_workspace_apps_workspace_slug ON workspace_apps(workspace_id, app_slug);
CREATE INDEX idx_workspace_apps_workspace_id ON workspace_apps(workspace_id);

-- =============================================================================
-- Table: app_role_permissions
-- =============================================================================
CREATE TABLE app_role_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    app_slug TEXT NOT NULL,
    role TEXT NOT NULL,
    can_view BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, app_slug, role)
);

CREATE INDEX idx_app_role_permissions_lookup ON app_role_permissions(workspace_id, app_slug, role);
CREATE INDEX idx_app_role_permissions_workspace_id ON app_role_permissions(workspace_id);

-- =============================================================================
-- Table: app_user_overrides
-- =============================================================================
CREATE TABLE app_user_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    app_slug TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, app_slug, user_id)
);

CREATE INDEX idx_app_user_overrides_lookup ON app_user_overrides(workspace_id, app_slug, user_id);
CREATE INDEX idx_app_user_overrides_workspace_id ON app_user_overrides(workspace_id);
CREATE INDEX idx_app_user_overrides_user_id ON app_user_overrides(user_id);

-- =============================================================================
-- RLS: workspace_apps
-- =============================================================================
ALTER TABLE workspace_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_apps: members can read"
    ON workspace_apps FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "workspace_apps: owner/admin can insert"
    ON workspace_apps FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "workspace_apps: owner/admin can update"
    ON workspace_apps FOR UPDATE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "workspace_apps: owner/admin can delete"
    ON workspace_apps FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "workspace_apps: service role full access"
    ON workspace_apps FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: app_role_permissions
-- =============================================================================
ALTER TABLE app_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_role_permissions: members can read"
    ON app_role_permissions FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

CREATE POLICY "app_role_permissions: owner/admin can insert"
    ON app_role_permissions FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_role_permissions: owner/admin can update"
    ON app_role_permissions FOR UPDATE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_role_permissions: owner/admin can delete"
    ON app_role_permissions FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_role_permissions: service role full access"
    ON app_role_permissions FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: app_user_overrides
-- =============================================================================
ALTER TABLE app_user_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_user_overrides: members can read own or workspace overrides"
    ON app_user_overrides FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        OR workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_user_overrides: owner/admin can insert"
    ON app_user_overrides FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_user_overrides: owner/admin can update"
    ON app_user_overrides FOR UPDATE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_user_overrides: owner/admin can delete"
    ON app_user_overrides FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

CREATE POLICY "app_user_overrides: service role full access"
    ON app_user_overrides FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- Seed: ativar todos os apps para workspaces existentes e liberar owner/admin
-- =============================================================================
DO $$
DECLARE
    app_slugs TEXT[] := ARRAY[
        'aquisicao-vendas',
        'traqueamento',
        'pre-vendas',
        'relatorios',
        'sdr-ia',
        'metas',
        'leads'
    ];
    ws RECORD;
    slug TEXT;
BEGIN
    FOR ws IN SELECT id FROM workspaces LOOP
        FOR slug IN SELECT unnest(app_slugs) LOOP
            INSERT INTO workspace_apps (workspace_id, app_slug, is_active, settings)
            VALUES (ws.id, slug, true, '{}'::jsonb)
            ON CONFLICT (workspace_id, app_slug) DO NOTHING;

            INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
            VALUES
                (ws.id, slug, 'owner', true),
                (ws.id, slug, 'admin', true)
            ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
