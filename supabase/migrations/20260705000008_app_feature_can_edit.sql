-- Adiciona controle de edição (can_edit) às permissões de feature
-- O frontend resolve o fallback via FEATURES_CATALOG.defaultEditRoles quando
-- não existe override ou permissão de papel explícita para can_edit.

-- =============================================================================
-- Table: app_feature_role_permissions
-- =============================================================================
ALTER TABLE app_feature_role_permissions
ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT false NOT NULL;

-- =============================================================================
-- Table: app_feature_user_overrides
-- =============================================================================
ALTER TABLE app_feature_user_overrides
ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT false NOT NULL;
