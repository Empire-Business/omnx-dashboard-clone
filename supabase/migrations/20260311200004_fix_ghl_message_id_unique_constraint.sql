-- ============================================================
-- Migration: Substitui partial index por unique constraint em ghl_message_id
-- Motivo: ON CONFLICT (col) no PostgreSQL requer unique constraint completa,
--         não partial index. Sem isso, o upsert da edge function não funciona.
-- PostgreSQL: NULLs são distintos em unique constraints — múltiplos NULLs ok.
-- Data: 2026-03-11
-- ============================================================

-- Dropar o partial index criado antes
DROP INDEX IF EXISTS idx_comunicacoes_ghl_message_id;

-- Criar unique constraint real (permite múltiplos NULLs no PostgreSQL)
ALTER TABLE comunicacoes
  ADD CONSTRAINT comunicacoes_ghl_message_id_key UNIQUE (ghl_message_id);
