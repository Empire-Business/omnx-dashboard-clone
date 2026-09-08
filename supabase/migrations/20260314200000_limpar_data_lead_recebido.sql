-- ============================================================
-- Migration: Limpar data_lead_recebido de todas as oportunidades
--
-- Motivo:
--   data_lead_recebido histórica foi extraída do webhook com fallbacks
--   imprecisos (campos customizados + date_created). Resultado: datas
--   incorretas para centenas de oportunidades (inversão MM/DD, webhooks
--   com date_created errado, etc).
--
--   A edge function sync-opp-dates irá repopular via API GHL (campo
--   `createdAt` da oportunidade) — data confiável e imutável.
--
-- AVISO DE DOWNTIME:
--   Após esta migration, data_lead_recebido ficará NULL para TODAS as
--   oportunidades. Os dashboards ficarão sem dados de data até o
--   backfill completar (~5307 opps / 100 por execução / 10 min = ~9h).
--
--   Para acelerar: rodar manualmente sync-opp-dates com batch_size=500
--   (~2 horas para completar). Ver docs/SYNC-OPP-DATES.md.
-- ============================================================

-- Limpa todos os data_lead_recebido — serão repopulados via API GHL
UPDATE oportunidades SET data_lead_recebido = NULL;

-- Verificação: quantas oportunidades estão pendentes
DO $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM oportunidades WHERE data_lead_recebido IS NULL;
  RAISE NOTICE 'data_lead_recebido zerado. Pendentes para sync-opp-dates: %', v_total;
END;
$$;
