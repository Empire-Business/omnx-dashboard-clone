-- Migration: triggers de auditoria para permission_audit_log
-- Audita mudanças em dashboard_user_permissions, app_feature_role_permissions e app_feature_user_overrides.

-- =============================================================================
-- Função trigger para dashboard_user_permissions
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_dashboard_user_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_target_user_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.module_key;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.module_key;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_target_user_id := OLD.user_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.module_key;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_target_user_id,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================================================
-- Função trigger para app_feature_role_permissions
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_app_feature_role_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.app_slug || '.' || OLD.feature_key || ':role=' || OLD.role;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_performed_by,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================================================
-- Função trigger para app_feature_user_overrides
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_app_feature_user_overrides()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_target_user_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.app_slug || '.' || NEW.feature_key;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.app_slug || '.' || NEW.feature_key;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_target_user_id := OLD.user_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.app_slug || '.' || OLD.feature_key;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_target_user_id,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- =============================================================================
-- Criação dos triggers
-- =============================================================================
DROP TRIGGER IF EXISTS audit_dashboard_user_permissions_trigger ON dashboard_user_permissions;
CREATE TRIGGER audit_dashboard_user_permissions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON dashboard_user_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_dashboard_user_permissions();

DROP TRIGGER IF EXISTS audit_app_feature_role_permissions_trigger ON app_feature_role_permissions;
CREATE TRIGGER audit_app_feature_role_permissions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON app_feature_role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_app_feature_role_permissions();

DROP TRIGGER IF EXISTS audit_app_feature_user_overrides_trigger ON app_feature_user_overrides;
CREATE TRIGGER audit_app_feature_user_overrides_trigger
    AFTER INSERT OR UPDATE OR DELETE ON app_feature_user_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_app_feature_user_overrides();
