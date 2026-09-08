-- Migration: adicionar coluna sdr_name à tabela oportunidades
--
-- Contexto: SDR agora é por OPORTUNIDADE (não por contato).
-- A fonte de verdade é o FOLLOWER da oportunidade via API GHL:
--   GET /opportunities/{id}/followers
-- Fallback: se followers vazio → usa contatos.owner_name do último webhook.
--
-- NULL = sinal para o cron sync-opp-sdr reprocessar via API.
-- Não usar default '' — NULL é o indicador de trabalho pendente.

ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS sdr_name TEXT;
