-- ============================================================
-- Migration: Garante existência das colunas desnormalizadas em comunicacoes
-- Motivo: As colunas do migration 20260303170000 não estão presentes no banco
--         de produção (migration marcada como aplicada mas SQL não executou).
--         Usando IF NOT EXISTS para ser seguro em qualquer estado.
-- Data: 2026-03-11
-- ============================================================

ALTER TABLE comunicacoes
  ADD COLUMN IF NOT EXISTS contato_nome     TEXT,
  ADD COLUMN IF NOT EXISTS contato_email    TEXT,
  ADD COLUMN IF NOT EXISTS contato_telefone TEXT,
  ADD COLUMN IF NOT EXISTS sdr_name         TEXT,
  ADD COLUMN IF NOT EXISTS sdr_email        TEXT,
  ADD COLUMN IF NOT EXISTS closer_name      TEXT;

COMMENT ON COLUMN comunicacoes.contato_nome     IS 'Nome do contato (desnormalizado de contatos.nome)';
COMMENT ON COLUMN comunicacoes.contato_email    IS 'Email do contato (desnormalizado de contatos.email)';
COMMENT ON COLUMN comunicacoes.contato_telefone IS 'Telefone do contato (desnormalizado de contatos.telefone)';
COMMENT ON COLUMN comunicacoes.sdr_name         IS 'Nome do SDR responsável (desnormalizado de contatos.owner_name)';
COMMENT ON COLUMN comunicacoes.sdr_email        IS 'Email do SDR (reservado para uso futuro)';
COMMENT ON COLUMN comunicacoes.closer_name      IS 'Nome do Closer/Vendedor (reservado para uso futuro)';

-- Recarregar schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
