-- ============================================================
-- Migration: Adicionar colunas desnormalizadas na tabela comunicacoes
-- Motivo: Facilitar consultas sem JOINs complexos com contatos e oportunidades
-- Data: 2026-03-03
-- ============================================================

-- Adicionar colunas de dados do contato
ALTER TABLE comunicacoes 
ADD COLUMN IF NOT EXISTS contato_nome TEXT,
ADD COLUMN IF NOT EXISTS contato_email TEXT,
ADD COLUMN IF NOT EXISTS contato_telefone TEXT;

-- Adicionar colunas de dados do SDR
ALTER TABLE comunicacoes 
ADD COLUMN IF NOT EXISTS sdr_name TEXT,
ADD COLUMN IF NOT EXISTS sdr_email TEXT;

-- Adicionar coluna de dados do Closer
ALTER TABLE comunicacoes 
ADD COLUMN IF NOT EXISTS closer_name TEXT;

-- Comentários documentando a origem dos dados
COMMENT ON COLUMN comunicacoes.contato_nome IS 'Nome do contato (desnormalizado de contatos.nome)';
COMMENT ON COLUMN comunicacoes.contato_email IS 'Email do contato (desnormalizado de contatos.email)';
COMMENT ON COLUMN comunicacoes.contato_telefone IS 'Telefone do contato (desnormalizado de contatos.telefone)';
COMMENT ON COLUMN comunicacoes.sdr_name IS 'Nome do SDR responsável (desnormalizado de contatos.owner_name)';
COMMENT ON COLUMN comunicacoes.sdr_email IS 'Email do SDR (desnormalizado de contatos.owner_email)';
COMMENT ON COLUMN comunicacoes.closer_name IS 'Nome do Closer/Vendedor (desnormalizado de oportunidades.vendedor_closer)';
