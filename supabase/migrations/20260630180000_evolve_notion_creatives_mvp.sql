-- Migration: evolui notion_creatives para o MVP do sub-app Criativos
-- Adiciona campos semânticos de controle e teste sem quebrar o Painel de Tráfego.

-- =============================================================================
-- 1. Campos do MVP do sub-app Criativos
-- =============================================================================
ALTER TABLE notion_creatives
  ADD COLUMN IF NOT EXISTS creative_type TEXT
    CHECK (creative_type IN ('copy', 'imagem', 'video', 'hook', 'cta')),
  ADD COLUMN IF NOT EXISTS mvp_status TEXT
    CHECK (mvp_status IN ('testando', 'aprovado', 'reprovado')),
  ADD COLUMN IF NOT EXISTS learning TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES ads_campaigns(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. Índices para performance do novo app
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_notion_creatives_creative_type
  ON notion_creatives(workspace_id, creative_type);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_mvp_status
  ON notion_creatives(workspace_id, mvp_status);

CREATE INDEX IF NOT EXISTS idx_notion_creatives_campaign_id
  ON notion_creatives(workspace_id, campaign_id);

-- =============================================================================
-- 3. Garantir RLS para as novas colunas
-- As policies existentes já cobrem SELECT/UPDATE por workspace; garantimos
-- apenas que a tabela continue com RLS ativado.
-- =============================================================================
ALTER TABLE notion_creatives ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4. Trigger para manter updated_at
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_notion_creatives_updated_at'
      AND tgrelid = 'notion_creatives'::regclass
  ) THEN
    CREATE TRIGGER trigger_notion_creatives_updated_at
      BEFORE UPDATE ON notion_creatives
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
