-- Migration: Create dashboard_user_lead_filters table
-- Part of Dashboard Empire Phase 1 infrastructure
-- Reference: docs/DASHBOARD-CONTROLE-ACESSO.md Section 4

-- =============================================================================
-- Table: dashboard_user_lead_filters
-- =============================================================================
CREATE TABLE dashboard_user_lead_filters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    filter_name TEXT,
    logic TEXT NOT NULL CHECK (logic IN ('AND', 'OR')) DEFAULT 'AND',
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_lead_filters_workspace_user
    ON dashboard_user_lead_filters(workspace_id, user_id);
CREATE INDEX idx_lead_filters_active
    ON dashboard_user_lead_filters(workspace_id, user_id, is_active);

-- =============================================================================
-- Trigger: auto-update updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_lead_filters_updated_at
    BEFORE UPDATE ON dashboard_user_lead_filters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS: dashboard_user_lead_filters
-- =============================================================================
ALTER TABLE dashboard_user_lead_filters ENABLE ROW LEVEL SECURITY;

-- Users can view their own filters
CREATE POLICY "Users can view own lead filters"
    ON dashboard_user_lead_filters FOR SELECT
    TO authenticated
    USING (
        user_id = auth.uid()
        AND workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Owner/admin can view all filters in workspace
CREATE POLICY "Owner and admin can view all lead filters"
    ON dashboard_user_lead_filters FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner/admin can create filters for users
CREATE POLICY "Owner and admin can create lead filters"
    ON dashboard_user_lead_filters FOR INSERT
    TO authenticated
    WITH CHECK (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Only owner/admin can update filters
CREATE POLICY "Owner and admin can update lead filters"
    ON dashboard_user_lead_filters FOR UPDATE
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

-- Only owner/admin can delete filters
CREATE POLICY "Owner and admin can delete lead filters"
    ON dashboard_user_lead_filters FOR DELETE
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Service role has full access
CREATE POLICY "Service role full access on lead filters"
    ON dashboard_user_lead_filters FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
