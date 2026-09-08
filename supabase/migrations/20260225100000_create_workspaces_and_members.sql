-- Migration: Create workspaces and workspace_members tables
-- Part of Dashboard Empire Phase 1 infrastructure
-- Reference: docs/DASHBOARD-CONTROLE-ACESSO.md Section 2

-- =============================================================================
-- Table: workspaces
-- =============================================================================
CREATE TABLE workspaces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);

-- =============================================================================
-- Table: workspace_members
-- =============================================================================
CREATE TABLE workspace_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    invited_by UUID REFERENCES auth.users(id),
    joined_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true NOT NULL,
    UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_active ON workspace_members(workspace_id, user_id, is_active);

-- =============================================================================
-- RLS: workspaces
-- =============================================================================
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Users can see workspaces they belong to
CREATE POLICY "Users can view their workspaces"
    ON workspaces FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Only the owner can insert a workspace (they create it)
CREATE POLICY "Users can create workspaces"
    ON workspaces FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

-- Only owner/admin can update workspace settings
CREATE POLICY "Owner and admin can update workspace"
    ON workspaces FOR UPDATE
    TO authenticated
    USING (
        id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner can delete workspace
CREATE POLICY "Owner can delete workspace"
    ON workspaces FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

-- Service role has full access
CREATE POLICY "Service role full access on workspaces"
    ON workspaces FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- RLS: workspace_members
-- =============================================================================
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- Members can see other members of workspaces they belong to
CREATE POLICY "Members can view workspace members"
    ON workspace_members FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Only owner/admin can invite (insert) members
CREATE POLICY "Owner and admin can add members"
    ON workspace_members FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner/admin can update members (change role, deactivate)
CREATE POLICY "Owner and admin can update members"
    ON workspace_members FOR UPDATE
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

-- Only owner can remove members
CREATE POLICY "Owner can delete members"
    ON workspace_members FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role = 'owner'
        )
    );

-- Service role has full access
CREATE POLICY "Service role full access on workspace_members"
    ON workspace_members FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- =============================================================================
-- Helper function: Create workspace + add owner as member atomically
-- =============================================================================
CREATE OR REPLACE FUNCTION create_workspace_with_owner(
    workspace_name TEXT,
    workspace_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_workspace_id UUID;
BEGIN
    INSERT INTO workspaces (name, owner_id, settings)
    VALUES (workspace_name, auth.uid(), workspace_settings)
    RETURNING id INTO new_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role, invited_by, joined_at, is_active)
    VALUES (new_workspace_id, auth.uid(), 'owner', auth.uid(), now(), true);

    RETURN new_workspace_id;
END;
$$;
