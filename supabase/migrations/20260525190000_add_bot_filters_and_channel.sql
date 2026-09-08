-- Migration: Add bot communication channel and advanced lead filters
-- App: SDR IA — suporte a WhatsApp, SMS e filtros avançados de segmentação
-- Reference: docs/SDR-IA-ARQUITETURA.md

-- =============================================================================
-- Table: sdr_ia_bots
-- =============================================================================

-- Canal de comunicação (whatsapp | sms | ambos)
ALTER TABLE sdr_ia_bots
ADD COLUMN IF NOT EXISTS canal_comunicacao TEXT DEFAULT 'whatsapp'
CHECK (canal_comunicacao IN ('whatsapp', 'sms', 'ambos'));

-- Filtros avançados de leads
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_pipeline_id TEXT;
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_stage_id TEXT;
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_sdr_id TEXT;
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_origem TEXT;
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_custom_field_key TEXT;
ALTER TABLE sdr_ia_bots ADD COLUMN IF NOT EXISTS filtro_custom_field_value TEXT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sdr_ia_bots_canal ON sdr_ia_bots(canal_comunicacao);

-- =============================================================================
-- Table: contatos — campos necessários para os filtros avançados funcionarem
-- =============================================================================

ALTER TABLE contatos
ADD COLUMN IF NOT EXISTS origem TEXT,
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS sdr_id TEXT,
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

-- =============================================================================
-- Comentários
-- =============================================================================

COMMENT ON COLUMN sdr_ia_bots.canal_comunicacao IS
  'Canal preferencial do bot: whatsapp, sms ou ambos. Default whatsapp para compatibilidade retroativa.';

COMMENT ON COLUMN sdr_ia_bots.filtro_pipeline_id IS
  'Filtrar leads por oportunidades.pipeline_id (NULL = sem filtro)';

COMMENT ON COLUMN sdr_ia_bots.filtro_stage_id IS
  'Filtrar leads por oportunidades.stage_id (NULL = sem filtro)';

COMMENT ON COLUMN sdr_ia_bots.filtro_sdr_id IS
  'Filtrar leads por contatos.sdr_id ou oportunidades.assigned_to (NULL = sem filtro)';

COMMENT ON COLUMN sdr_ia_bots.filtro_origem IS
  'Filtrar leads por contatos.origem, source ou contact_source (NULL = sem filtro)';

COMMENT ON COLUMN sdr_ia_bots.filtro_custom_field_key IS
  'Chave do custom field em contatos.custom_fields (NULL = sem filtro)';

COMMENT ON COLUMN sdr_ia_bots.filtro_custom_field_value IS
  'Valor esperado do custom field em contatos.custom_fields (NULL = sem filtro)';
