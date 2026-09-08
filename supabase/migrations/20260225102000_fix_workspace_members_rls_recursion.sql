-- Migration: Fix infinite recursion in workspace_members RLS policies
-- Root cause: SELECT policy on workspace_members referenced workspace_members itself,
-- causing infinite recursion and HTTP 500 errors.
-- Fix: Replace recursive subqueries with a SECURITY DEFINER helper function
--      that bypasses RLS when checking membership.

-- =============================================================================
-- Step 1: Drop all recursive policies on workspace_members
-- =============================================================================
DROP POLICY IF EXISTS "Members can view workspace members" ON workspace_members;
DROP POLICY IF EXISTS "Owner and admin can add members" ON workspace_members;
DROP POLICY IF EXISTS "Owner and admin can update members" ON workspace_members;
DROP POLICY IF EXISTS "Owner can delete members" ON workspace_members;

-- Also drop workspaces policies that reference workspace_members
-- (they are not recursive, but we recreate them consistently using the helper)
DROP POLICY IF EXISTS "Users can view their workspaces" ON workspaces;
DROP POLICY IF EXISTS "Owner and admin can update workspace" ON workspaces;

-- =============================================================================
-- Step 2: Create SECURITY DEFINER helpers (bypass RLS for internal checks)
-- =============================================================================

-- Returns true if the current user is an active member of the given workspace
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_active = true
    );
$$;

-- Returns true if the current user is an active owner or admin of the given workspace
CREATE OR REPLACE FUNCTION is_workspace_admin(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$$;

-- Returns true if the current user is the active owner of the given workspace
CREATE OR REPLACE FUNCTION is_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role = 'owner'
    );
$$;

-- =============================================================================
-- Step 3: Recreate workspace_members policies (non-recursive)
-- =============================================================================

-- Members can see other members of workspaces they belong to
CREATE POLICY "Members can view workspace members"
    ON workspace_members FOR SELECT
    TO authenticated
    USING (is_workspace_member(workspace_id));

-- Only owner/admin can invite (insert) members
CREATE POLICY "Owner and admin can add members"
    ON workspace_members FOR INSERT
    TO authenticated
    WITH CHECK (is_workspace_admin(workspace_id));

-- Only owner/admin can update members (change role, deactivate)
CREATE POLICY "Owner and admin can update members"
    ON workspace_members FOR UPDATE
    TO authenticated
    USING (is_workspace_admin(workspace_id))
    WITH CHECK (is_workspace_admin(workspace_id));

-- Only owner can remove members
CREATE POLICY "Owner can delete members"
    ON workspace_members FOR DELETE
    TO authenticated
    USING (is_workspace_owner(workspace_id));

-- =============================================================================
-- Step 4: Recreate workspaces policies using helpers
-- =============================================================================

CREATE POLICY "Users can view their workspaces"
    ON workspaces FOR SELECT
    TO authenticated
    USING (is_workspace_member(id));

CREATE POLICY "Owner and admin can update workspace"
    ON workspaces FOR UPDATE
    TO authenticated
    USING (is_workspace_admin(id))
    WITH CHECK (is_workspace_admin(id));
