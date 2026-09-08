-- Migration: Corrigir now_brasil() e webhooks_ghl.created_at
--
-- Problema encontrado em 2026-03-15:
--   A função now_brasil() faz timezone('America/Sao_Paulo', now()) e declara
--   RETURNS timestamptz. Em PostgreSQL, timezone(zone, timestamptz) retorna
--   timestamp SEM timezone. O cast implícito para timestamptz reinterpreta
--   o horário local como UTC → resultado 3 horas atrasado.
--
--   Exemplo: às 18:00 UTC (15:00 SP)
--     timezone('America/Sao_Paulo', now()) = '2026-03-13 15:00:00' (sem tz)
--     cast para timestamptz              = '2026-03-13 15:00:00+00' ← ERRADO
--
--   A migration 20260219093409 aplicou isso como DEFAULT em webhooks_ghl.created_at.
--   Desde então, todo webhook gravado tem created_at com 3h a menos do real.
--
-- Correção:
--   1. Resetar webhooks_ghl.created_at para DEFAULT now() (UTC correto)
--   2. Dropar now_brasil() — função errada e sem uso no restante do sistema

ALTER TABLE webhooks_ghl
  ALTER COLUMN created_at SET DEFAULT now();

DROP FUNCTION IF EXISTS now_brasil();

COMMENT ON TABLE webhooks_ghl IS 'Armazena webhooks recebidos do GoHighLevel (GHL). Timestamps em UTC (timestamptz padrão Supabase).';
