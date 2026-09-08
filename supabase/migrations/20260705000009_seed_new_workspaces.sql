-- Migration: Seed apps and permissions for new workspaces
-- Garante que todo workspace novo receba apps ativos e permissões default
-- e faz backfill para workspaces criados antes desta migration.

-- =============================================================================
-- Function: setup_workspace_apps_and_permissions
-- Idempotente — pode ser chamada pela trigger, pela edge function ou para
-- backfill de workspaces antigos.
-- =============================================================================
CREATE OR REPLACE FUNCTION setup_workspace_apps_and_permissions(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    app_slugs TEXT[] := ARRAY[
        'aquisicao-vendas',
        'trafego',
        'traqueamento',
        'pre-vendas',
        'relatorios',
        'sdr-ia',
        'metas',
        'leads',
        'criativos',
        'disparos'
    ];
    slug TEXT;
BEGIN
    -- Ativa todos os apps do APP_CATALOG
    FOREACH slug IN ARRAY app_slugs LOOP
        INSERT INTO workspace_apps (workspace_id, app_slug, is_active, settings)
        VALUES (p_workspace_id, slug, true, '{}'::jsonb)
        ON CONFLICT (workspace_id, app_slug) DO NOTHING;
    END LOOP;

    -- Permissões de app: owner/admin sempre veem todos os apps
    INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
    SELECT p_workspace_id, unnest(app_slugs), r, true
    FROM (VALUES ('owner'), ('admin')) AS roles(r)
    ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;

    -- Permissões de app: member vê todos os apps do catálogo atual
    -- (todos possuem ao menos uma feature liberada para member)
    INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
    SELECT p_workspace_id, unnest(app_slugs), 'member', true
    ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;

    -- Permissões de feature por role conforme FEATURES_CATALOG.defaultRoles
    INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
    VALUES
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'dados-financeiros', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'dados-financeiros', 'admin', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'owner', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'admin', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'member', true),
        (p_workspace_id, 'trafego', 'matriz', 'owner', true),
        (p_workspace_id, 'trafego', 'matriz', 'admin', true),
        (p_workspace_id, 'trafego', 'matriz', 'member', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'owner', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'admin', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'member', true),
        (p_workspace_id, 'trafego', 'leads', 'owner', true),
        (p_workspace_id, 'trafego', 'leads', 'admin', true),
        (p_workspace_id, 'trafego', 'leads', 'member', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'owner', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'admin', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'member', true),
        (p_workspace_id, 'traqueamento', 'origem', 'owner', true),
        (p_workspace_id, 'traqueamento', 'origem', 'admin', true),
        (p_workspace_id, 'traqueamento', 'origem', 'member', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'owner', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'admin', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'member', true),
        (p_workspace_id, 'traqueamento', 'organico', 'owner', true),
        (p_workspace_id, 'traqueamento', 'organico', 'admin', true),
        (p_workspace_id, 'traqueamento', 'organico', 'member', true),
        (p_workspace_id, 'traqueamento', 'funis', 'owner', true),
        (p_workspace_id, 'traqueamento', 'funis', 'admin', true),
        (p_workspace_id, 'traqueamento', 'funis', 'member', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'member', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'member', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'member', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'member', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'member', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'member', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'member', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'member', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'member', true),
        (p_workspace_id, 'relatorios', 'cohort', 'owner', true),
        (p_workspace_id, 'relatorios', 'cohort', 'admin', true),
        (p_workspace_id, 'relatorios', 'cohort', 'member', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'owner', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'admin', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'member', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'owner', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'admin', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'member', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'owner', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'admin', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'member', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'owner', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'admin', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'member', true),
        (p_workspace_id, 'metas', 'overview', 'owner', true),
        (p_workspace_id, 'metas', 'overview', 'admin', true),
        (p_workspace_id, 'metas', 'overview', 'member', true),
        (p_workspace_id, 'metas', 'tracking', 'owner', true),
        (p_workspace_id, 'metas', 'tracking', 'admin', true),
        (p_workspace_id, 'metas', 'tracking', 'member', true),
        (p_workspace_id, 'metas', 'registry', 'owner', true),
        (p_workspace_id, 'metas', 'registry', 'admin', true),
        (p_workspace_id, 'metas', 'history', 'owner', true),
        (p_workspace_id, 'metas', 'history', 'admin', true),
        (p_workspace_id, 'metas', 'history', 'member', true),
        (p_workspace_id, 'leads', 'lista', 'owner', true),
        (p_workspace_id, 'leads', 'lista', 'admin', true),
        (p_workspace_id, 'leads', 'lista', 'member', true),
        (p_workspace_id, 'leads', 'limpeza', 'owner', true),
        (p_workspace_id, 'leads', 'limpeza', 'admin', true),
        (p_workspace_id, 'criativos', 'dashboard', 'owner', true),
        (p_workspace_id, 'criativos', 'dashboard', 'admin', true),
        (p_workspace_id, 'criativos', 'dashboard', 'member', true),
        (p_workspace_id, 'criativos', 'ranking', 'owner', true),
        (p_workspace_id, 'criativos', 'ranking', 'admin', true),
        (p_workspace_id, 'criativos', 'ranking', 'member', true),
        (p_workspace_id, 'criativos', 'biblioteca', 'owner', true),
        (p_workspace_id, 'criativos', 'biblioteca', 'admin', true),
        (p_workspace_id, 'criativos', 'kanban', 'owner', true),
        (p_workspace_id, 'criativos', 'kanban', 'admin', true),
        (p_workspace_id, 'criativos', 'testes', 'owner', true),
        (p_workspace_id, 'criativos', 'testes', 'admin', true),
        (p_workspace_id, 'criativos', 'testes', 'member', true),
        (p_workspace_id, 'disparos', 'dashboard', 'owner', true),
        (p_workspace_id, 'disparos', 'dashboard', 'admin', true),
        (p_workspace_id, 'disparos', 'dashboard', 'member', true),
        (p_workspace_id, 'disparos', 'configuracao', 'owner', true),
        (p_workspace_id, 'disparos', 'configuracao', 'admin', true)
    ON CONFLICT (workspace_id, app_slug, feature_key, role) DO NOTHING;
END;
$$;

-- =============================================================================
-- Trigger: setup apps on new workspace
-- =============================================================================
CREATE OR REPLACE FUNCTION on_new_workspace_setup_apps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM setup_workspace_apps_and_permissions(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_workspace_setup_apps ON workspaces;

CREATE TRIGGER trg_new_workspace_setup_apps
AFTER INSERT ON workspaces
FOR EACH ROW
EXECUTE FUNCTION on_new_workspace_setup_apps();

-- =============================================================================
-- Backfill: workspaces existentes sem apps configurados
-- =============================================================================
DO $$
DECLARE
    ws RECORD;
BEGIN
    FOR ws IN
        SELECT w.id
        FROM workspaces w
        LEFT JOIN workspace_apps wa ON wa.workspace_id = w.id
        WHERE wa.id IS NULL
    LOOP
        PERFORM setup_workspace_apps_and_permissions(ws.id);
    END LOOP;
END $$;
