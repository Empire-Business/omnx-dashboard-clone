-- Migration: Criar tabela de critérios de teste configuráveis por workspace
-- Descrição: Cada workspace define seus próprios critérios de aprovação/reprovação
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- TABLE: creative_test_criteria
-- Configuração de critérios de teste por workspace
-- ============================================================
CREATE TABLE IF NOT EXISTS creative_test_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Critérios de teste
  cpl_target NUMERIC(10,2) NOT NULL DEFAULT 70,
  budget_min NUMERIC(10,2) NOT NULL DEFAULT 50,
  budget_max NUMERIC(10,2) NOT NULL DEFAULT 100,
  window_min_days INTEGER NOT NULL DEFAULT 3,
  window_max_days INTEGER NOT NULL DEFAULT 5,
  
  -- Regras de ouro
  early_stop_threshold NUMERIC(10,2) NOT NULL DEFAULT 150,  -- CPL > X após R$ 30
  early_stop_spend NUMERIC(10,2) NOT NULL DEFAULT 30,
  no_lead_max_days INTEGER NOT NULL DEFAULT 5,
  
  -- Metas de produção por semana
  weekly_goal_reels INTEGER NOT NULL DEFAULT 4,
  weekly_goal_static INTEGER NOT NULL DEFAULT 6,
  weekly_goal_carousel INTEGER NOT NULL DEFAULT 3,
  weekly_goal_stories INTEGER NOT NULL DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),
  
  UNIQUE(workspace_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_creative_test_criteria_workspace 
  ON creative_test_criteria(workspace_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_creative_test_criteria_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_creative_test_criteria_updated_at ON creative_test_criteria;
CREATE TRIGGER trigger_creative_test_criteria_updated_at
  BEFORE UPDATE ON creative_test_criteria
  FOR EACH ROW
  EXECUTE FUNCTION update_creative_test_criteria_updated_at();

-- Seed: criar registro default para workspaces existentes que ainda não têm
INSERT INTO creative_test_criteria (workspace_id)
SELECT w.id 
FROM workspaces w
LEFT JOIN creative_test_criteria ctc ON ctc.workspace_id = w.id
WHERE ctc.id IS NULL;

-- RLS
ALTER TABLE creative_test_criteria ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creative_test_criteria'
      AND policyname = 'Workspace members can view creative_test_criteria'
  ) THEN
    CREATE POLICY "Workspace members can view creative_test_criteria"
  ON creative_test_criteria FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creative_test_criteria'
      AND policyname = 'Workspace members can update creative_test_criteria'
  ) THEN
    CREATE POLICY "Workspace members can update creative_test_criteria"
  ON creative_test_criteria FOR UPDATE TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members 
    WHERE user_id = auth.uid() AND is_active = true
  ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'creative_test_criteria'
      AND policyname = 'Service role full access on creative_test_criteria'
  ) THEN
    CREATE POLICY "Service role full access on creative_test_criteria"
  ON creative_test_criteria FOR ALL TO service_role
  USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
