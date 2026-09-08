-- ============================================================
-- Migration: 20260326110001
-- Limpa data_reuniao_agendada incorretos (vindos do webhook)
-- no pipeline Vendas SQL
--
-- CONTEXTO:
--   Antes da implementação do sync-appointment-dates (2026-03-26),
--   o campo data_reuniao_agendada era populado pelo webhook GHL via
--   extrair_dados_ghl — fonte não confiável. Os valores podem estar
--   errados (formato incorreto, desatualizados, etc.).
--
-- ESCOPO:
--   Apenas oportunidades do pipeline Vendas SQL (ZWuCjEXM2VDyLCx8CtGU)
--   onde last_appointment_sync_at IS NULL — ou seja, que AINDA não
--   foram corrigidas pelo novo sync via API GHL.
--
--   Opps com last_appointment_sync_at preenchido já têm o valor
--   correto da API e NÃO são tocadas.
--
-- APÓS ESTA MIGRATION:
--   O backfill do sync-appointment-dates re-popula todos os NULLs
--   com o valor correto da API GHL.
-- ============================================================

UPDATE oportunidades
SET data_reuniao_agendada = NULL
WHERE pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
  AND last_appointment_sync_at IS NULL
  AND data_reuniao_agendada IS NOT NULL;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'data_reuniao_agendada limpa em % oportunidades (pipeline Vendas SQL, não sincronizadas pela API)', v_count;
END;
$$;
