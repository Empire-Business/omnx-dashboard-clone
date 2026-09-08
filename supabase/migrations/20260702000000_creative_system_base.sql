-- Base do sistema completo de criativos (Kanban, Testes, Dashboard, Configurações)

-- 1. Configurações por workspace para o app de criativos
CREATE TABLE IF NOT EXISTS workspace_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_slug text NOT NULL DEFAULT 'criativos',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, app_slug)
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_members_view_settings ON workspace_settings;
CREATE POLICY workspace_members_view_settings ON workspace_settings
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.is_active = true
  ));

DROP POLICY IF EXISTS workspace_members_update_settings ON workspace_settings;
CREATE POLICY workspace_members_update_settings ON workspace_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.is_active = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.is_active = true
  ));

DROP POLICY IF EXISTS workspace_members_insert_settings ON workspace_settings;
CREATE POLICY workspace_members_insert_settings ON workspace_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = workspace_settings.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.is_active = true
  ));

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_workspace_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workspace_settings_updated_at ON workspace_settings;
CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW EXECUTE FUNCTION update_workspace_settings_updated_at();

-- 2. Garante critérios padrão por workspace
INSERT INTO creative_test_criteria (
  workspace_id,
  cpl_target,
  budget_min,
  budget_max,
  window_min_days,
  window_max_days,
  early_stop_threshold,
  early_stop_spend,
  no_lead_max_days,
  weekly_goal_reels,
  weekly_goal_static,
  weekly_goal_carousel,
  weekly_goal_stories
)
SELECT
  w.id,
  150,    -- cpl_target
  300,    -- budget_min
  1500,   -- budget_max
  3,      -- window_min_days
  7,      -- window_max_days
  1.5,    -- early_stop_threshold (CPLx)
  200,    -- early_stop_spend
  2,      -- no_lead_max_days
  5,      -- weekly_goal_reels
  3,      -- weekly_goal_static
  2,      -- weekly_goal_carousel
  4       -- weekly_goal_stories
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM creative_test_criteria ctc WHERE ctc.workspace_id = w.id
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_notion_creatives_source ON notion_creatives(workspace_id, source);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_status ON notion_creatives(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_test_status ON notion_creatives(workspace_id, test_status);
CREATE INDEX IF NOT EXISTS idx_creative_tests_status ON creative_tests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_creative ON creative_test_history(creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_validations_creative ON creative_validations(creative_id);

-- 4. View simplificada para status counts (usada no Dashboard)
CREATE OR REPLACE VIEW v_creative_status_counts AS
SELECT
  workspace_id,
  status,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE source = 'notion') AS from_notion,
  COUNT(*) FILTER (WHERE source = 'native') AS from_native
FROM notion_creatives
GROUP BY workspace_id, status;

COMMENT ON TABLE workspace_settings IS 'Configurações por workspace para cada sub-app, incluindo dia da reunião de criativos e critérios padrão.';
COMMENT ON VIEW v_creative_status_counts IS 'Contagem de criativos por status e origem (notion/native) por workspace.';
