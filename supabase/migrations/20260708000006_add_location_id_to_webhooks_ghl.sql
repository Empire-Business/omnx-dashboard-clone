-- Migration: Adiciona location_id em webhooks_ghl para rastreamento multi-conta
-- Fase 5: credenciais GHL configuráveis por workspace + rastreamento de webhooks por location

-- Coluna opcional para armazenar o locationId que enviou o webhook.
-- É TEXT e nullable para manter compatibilidade com webhooks históricos.
ALTER TABLE webhooks_ghl ADD COLUMN IF NOT EXISTS location_id TEXT;

-- Índice para consultas por location (auditoria, debug, resolução de workspace)
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_location_id ON webhooks_ghl(location_id);

-- Nota: backfill de webhooks antigos foi removido desta migration para evitar
-- statement timeout em tabelas grandes. Webhooks históricos permanecem com
-- location_id NULL; novos webhooks passam a gravar o location_id automaticamente
-- pela edge function webhook-ghl. Se necessário, um backfill pode ser executado
-- manualmente em lotes pequenos fora do horário de pico.
