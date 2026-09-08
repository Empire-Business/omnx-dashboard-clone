-- Migration: Proteção contra timeout no webhook
-- Adiciona webhook_dispatched_at para rastrear se o webhook chamou o orchestrator
-- mas o orchestrator ainda não confirmou processamento.
-- O cron do orchestrator verifica conversas com webhook_dispatched_at > 45s
-- e reprocessa automaticamente.

ALTER TABLE public.sdr_ia_conversas
  ADD COLUMN IF NOT EXISTS webhook_dispatched_at TIMESTAMPTZ;

COMMENT ON COLUMN public.sdr_ia_conversas.webhook_dispatched_at IS
  'Timestamp em que o webhook handler disparou o orchestrator. NULL = processado com sucesso ou nunca disparado.';
