-- Migration: adiciona índice em oportunidades.data_lead_recebido
-- Motivo: a edge function audit-leads-fev e outras queries por período
-- fazem scan sequencial na tabela, causando timeout (IDLE_TIMEOUT de 150s).
CREATE INDEX IF NOT EXISTS idx_oportunidades_data_lead_recebido
  ON oportunidades(data_lead_recebido);
