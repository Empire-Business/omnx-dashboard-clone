-- ============================================================
-- Migration: Torna contato_id nullable em comunicacoes
-- Motivo: A API GHL retorna comunicações de contatos que ainda
--         não passaram pelo webhook (contatos históricos).
--         Queremos salvar TODAS as comunicações, linkando ao
--         contato quando possível.
-- Data: 2026-03-11
-- ============================================================

-- Dropar constraint NOT NULL de contato_id
-- A FK (contato_id → contatos.id) continua válida para registros
-- que tenham contato_id preenchido.
ALTER TABLE comunicacoes
  ALTER COLUMN contato_id DROP NOT NULL;

COMMENT ON COLUMN comunicacoes.contato_id IS
  'FK para contatos.id. Pode ser NULL para comunicações importadas via API GHL '
  'de contatos que ainda não passaram pelo webhook ou cujo registro não foi '
  'encontrado no momento do sync.';
