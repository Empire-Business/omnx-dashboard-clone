-- Migration: Create permission_audit_log table
-- Part of Dashboard Empire Phase 1 infrastructure
-- Reference: docs/DASHBOARD-CONTROLE-ACESSO.md Section 8

-- =============================================================================
-- Table: permission_audit_log
-- =============================================================================
CREATE TABLE permission_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('granted', 'revoked', 'updated')),
    target_user_id UUID NOT NULL REFERENCES auth.users(id),
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    module_key TEXT,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_audit_log_workspace ON permission_audit_log(workspace_id);
CREATE INDEX idx_audit_log_target ON permission_audit_log(workspace_id, target_user_id);
CREATE INDEX idx_audit_log_performed_by ON permission_audit_log(workspace_id, performed_by);
CREATE INDEX idx_audit_log_created_at ON permission_audit_log(workspace_id, created_at DESC);

-- =============================================================================
-- RLS: permission_audit_log
-- =============================================================================
ALTER TABLE permission_audit_log ENABLE ROW LEVEL SECURITY;

-- Only owner/admin can view audit logs
CREATE POLICY "Owner and admin can view audit logs"
    ON permission_audit_log FOR SELECT
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members
            WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
        )
    );

-- Insertions happen via service role or triggers, not directly from clients
CREATE POLICY "Service role can insert audit logs"
    ON permission_audit_log FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Audit logs are append-only - no updates or deletes
CREATE POLICY "Service role full access on audit logs"
    ON permission_audit_log FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
