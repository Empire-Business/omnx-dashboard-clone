-- Migration: Expandir notion_creatives para suportar gestão nativa de criativos
-- Descrição: Adiciona campos de conteúdo, responsáveis, gestão, teste e assets
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- 1. Tornar notion_page_id opcional (criativos nativos não têm Notion)
-- ============================================================
ALTER TABLE notion_creatives
  ALTER COLUMN notion_page_id DROP NOT NULL;

-- ============================================================
-- 2. Origem do criativo
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'notion' 
    CHECK (source IN ('notion', 'native', 'import'));

-- ============================================================
-- 3. Campos de conteúdo (copy, hook, CTA)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS copy_text TEXT,
  ADD COLUMN IF NOT EXISTS hook_text TEXT,
  ADD COLUMN IF NOT EXISTS cta_text TEXT,
  ADD COLUMN IF NOT EXISTS content_pillar TEXT,
  ADD COLUMN IF NOT EXISTS funnel_stage TEXT;

-- ============================================================
-- 4. Responsáveis e gestão
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- ============================================================
-- 5. Assets (arquivo bruto = raw_asset_url)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS raw_asset_url TEXT;

-- ============================================================
-- 6. Campos de teste (complementares aos já existentes: creative_tested, test_started_at, aprovado)
-- ============================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS test_ended_at DATE,
  ADD COLUMN IF NOT EXISTS cpl_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS observations TEXT,
  ADD COLUMN IF NOT EXISTS budget_spent NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS test_status TEXT DEFAULT 'nao_testado'
    CHECK (test_status IN ('nao_testado', 'em_teste', 'testado')),
  ADD COLUMN IF NOT EXISTS test_result TEXT
    CHECK (test_result IN ('aprovado', 'reprovado', 'pendente', 'retestar'));

-- ============================================================
-- 7. Índices para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notion_creatives_source 
  ON notion_creatives(workspace_id, source);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_assigned 
  ON notion_creatives(workspace_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_test_status 
  ON notion_creatives(workspace_id, test_status);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_tags 
  ON notion_creatives USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_external_id_workspace 
  ON notion_creatives(workspace_id, external_id);

-- ============================================================
-- 8. Atualizar RLS policy para permitir UPDATE por membros do workspace
-- (já existe policy de SELECT; garantimos UPDATE para o app OMNX Criativos)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notion_creatives'
      AND policyname = 'Workspace members can update notion_creatives'
  ) THEN
    CREATE POLICY "Workspace members can update notion_creatives"
      ON notion_creatives
      FOR UPDATE
      TO authenticated
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      )
      WITH CHECK (
        workspace_id IN (
          SELECT workspace_id
          FROM workspace_members
          WHERE user_id = auth.uid()
            AND is_active = true
        )
      );
  END IF;
END $$;

-- ============================================================
-- 9. Trigger para atualizar updated_at
-- (já existe trigger_notion_creatives_updated_at, mas garantimos)
-- ============================================================
CREATE OR REPLACE FUNCTION update_notion_creatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_notion_creatives_updated_at'
      AND tgrelid = 'notion_creatives'::regclass
  ) THEN
    CREATE TRIGGER trigger_notion_creatives_updated_at
      BEFORE UPDATE ON notion_creatives
      FOR EACH ROW
      EXECUTE FUNCTION update_notion_creatives_updated_at();
  END IF;
END $$;

-- ============================================================
-- 10. Notificar PostgREST para recarregar schema
-- ============================================================
NOTIFY pgrst, 'reload schema';
