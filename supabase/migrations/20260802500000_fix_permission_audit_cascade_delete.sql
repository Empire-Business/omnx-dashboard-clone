-- Corrige auditoria disparada depois da exclusão em cascata de um workspace.
-- DELETEs normais continuam auditados; só o cascade pós-exclusão é ignorado.

SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.audit_dashboard_user_permissions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_action text; v_old jsonb; v_new jsonb; v_workspace_id uuid; v_target_user_id uuid; v_performed_by uuid; v_module_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'granted'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_target_user_id := NEW.user_id; v_performed_by := COALESCE(NEW.granted_by, auth.uid()); v_module_key := NEW.module_key;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'updated'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_target_user_id := NEW.user_id; v_performed_by := COALESCE(NEW.granted_by, auth.uid()); v_module_key := NEW.module_key;
  ELSE v_action := 'revoked'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_workspace_id := OLD.workspace_id; v_target_user_id := OLD.user_id; v_performed_by := auth.uid(); v_module_key := OLD.module_key;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_workspace_id) THEN RETURN OLD; END IF;
  v_performed_by := COALESCE(v_performed_by, '00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.permission_audit_log (workspace_id, action, target_user_id, performed_by, module_key, old_value, new_value) VALUES (v_workspace_id, v_action, v_target_user_id, v_performed_by, v_module_key, v_old, v_new);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_app_feature_role_permissions()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_action text; v_old jsonb; v_new jsonb; v_workspace_id uuid; v_performed_by uuid; v_module_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'granted'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_performed_by := auth.uid(); v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'updated'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_performed_by := auth.uid(); v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
  ELSE v_action := 'revoked'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_workspace_id := OLD.workspace_id; v_performed_by := auth.uid(); v_module_key := OLD.app_slug || '.' || OLD.feature_key || ':role=' || OLD.role;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_workspace_id) THEN RETURN OLD; END IF;
  v_performed_by := COALESCE(v_performed_by, '00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.permission_audit_log (workspace_id, action, target_user_id, performed_by, module_key, old_value, new_value) VALUES (v_workspace_id, v_action, v_performed_by, v_performed_by, v_module_key, v_old, v_new);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_app_feature_user_overrides()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_action text; v_old jsonb; v_new jsonb; v_workspace_id uuid; v_target_user_id uuid; v_performed_by uuid; v_module_key text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_action := 'granted'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_target_user_id := NEW.user_id; v_performed_by := COALESCE(NEW.granted_by, auth.uid()); v_module_key := NEW.app_slug || '.' || NEW.feature_key;
  ELSIF TG_OP = 'UPDATE' THEN v_action := 'updated'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_new := to_jsonb(NEW) - 'created_at' - 'updated_at'; v_workspace_id := NEW.workspace_id; v_target_user_id := NEW.user_id; v_performed_by := COALESCE(NEW.granted_by, auth.uid()); v_module_key := NEW.app_slug || '.' || NEW.feature_key;
  ELSE v_action := 'revoked'; v_old := to_jsonb(OLD) - 'created_at' - 'updated_at'; v_workspace_id := OLD.workspace_id; v_target_user_id := OLD.user_id; v_performed_by := auth.uid(); v_module_key := OLD.app_slug || '.' || OLD.feature_key;
  END IF;
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_workspace_id) THEN RETURN OLD; END IF;
  v_performed_by := COALESCE(v_performed_by, '00000000-0000-0000-0000-000000000000'::uuid);
  INSERT INTO public.permission_audit_log (workspace_id, action, target_user_id, performed_by, module_key, old_value, new_value) VALUES (v_workspace_id, v_action, v_target_user_id, v_performed_by, v_module_key, v_old, v_new);
  RETURN COALESCE(NEW, OLD);
END;
$$;
