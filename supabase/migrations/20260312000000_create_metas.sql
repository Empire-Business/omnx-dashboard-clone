-- Migration: create metas table
-- Armazena metas configuráveis por workspace (ex: custo/MQL, agendamentos por SDR)

CREATE TABLE IF NOT EXISTS metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  tipo TEXT NOT NULL,       -- 'mql_count_trafego' | 'custo_mql_trafego' | 'agendamentos_sdr'
  referencia TEXT NOT NULL DEFAULT 'global',  -- SDR name ou 'global'
  valor NUMERIC(12,2) NOT NULL,
  periodo TEXT NOT NULL DEFAULT 'mensal',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, tipo, referencia)
);

ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metas_workspace_access" ON metas FOR ALL USING (
  workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true
  )
);
