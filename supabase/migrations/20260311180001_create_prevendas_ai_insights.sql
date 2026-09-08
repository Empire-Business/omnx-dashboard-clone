-- Migration: Tabela de cache para análise IA do módulo Pré-Vendas
-- Cache de 24h para evitar chamadas repetidas ao OpenRouter.

CREATE TABLE IF NOT EXISTS prevendas_ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  input_hash TEXT NOT NULL,           -- SHA256 hex do payload enviado
  resultado JSONB NOT NULL,           -- { padroes, recomendacoes, grupos }
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, input_hash)
);

-- RLS: membros do workspace podem ler; apenas a edge function insere (service_role)
ALTER TABLE prevendas_ai_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_select_ai_insights"
  ON prevendas_ai_insights
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Índice para lookup de cache
CREATE INDEX IF NOT EXISTS idx_prevendas_ai_insights_lookup
  ON prevendas_ai_insights (workspace_id, input_hash, created_at DESC);
