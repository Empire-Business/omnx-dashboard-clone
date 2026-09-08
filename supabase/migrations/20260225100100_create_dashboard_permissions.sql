-- Migration: Create dashboard_user_permissions table
-- Part of Dashboard Empire Phase 1 infrastructure
-- Reference: docs/DASHBOARD-CONTROLE-ACESSO.md Section 3

-- =============================================================================
-- Table: dashboard_user_permissions
-- =============================================================================
CREATE TABLE dashboard_user_permissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    can_view BOOLEAN DEFAULT true NOT NULL,
    can_edit BOOLEAN DEFAULT false NOT NULL,
    granted_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, user_id, module_key)
);

CREATE INDEX idx_dashboard_permissions_workspace_user
    ON dashboard_user_permissions(workspace_id, user_id);
CREATE INDEX idx_dashboard_permissions_module_key
    ON dashboard_user_permissions(workspace_id, user_id, module_key);

-- =============================================================================
-- RLS: dashboard_user_permissions
-- =============================================================================
ALTER TABLE dashboard_user_permissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
    ON dashboard_user_permissions FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        AND workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Owner/admin can view all permissions in workspace
CREATE POLICY "Owner and admin can view all permissions"
    ON dashboard_user_permissions FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner/admin can grant permissions
CREATE POLICY "Owner and admin can grant permissions"
    ON dashboard_user_permissions FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner/admin can update permissions
CREATE POLICY "Owner and admin can update permissions"
    ON dashboard_user_permissions FOR UPDATE
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

-- Only owner/admin can revoke permissions
CREATE POLICY "Owner and admin can revoke permissions"
    ON dashboard_user_permissions FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Service role has full access
CREATE POLICY "Service role full access on permissions"
    ON dashboard_user_permissions FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
