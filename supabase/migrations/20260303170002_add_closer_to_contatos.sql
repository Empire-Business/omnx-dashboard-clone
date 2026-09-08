-- ============================================================
-- Migration: Adicionar colunas de identificação do Closer na tabela contatos
-- Motivo: Facilitar consultas sem precisar de JOIN com oportunidades
-- Data: 2026-03-03
-- ============================================================

-- Adicionar colunas do Closer/Vendedor
ALTER TABLE contatos 
ADD COLUMN IF NOT EXISTS closer_name TEXT,
ADD COLUMN IF NOT EXISTS closer_email TEXT;

-- Comentários documentando a origem dos dados
COMMENT ON COLUMN contatos.closer_name IS 'Nome do Closer/Vendedor responsável (desnormalizado de oportunidades.vendedor_closer)';
COMMENT ON COLUMN contatos.closer_email IS 'Email do Closer/Vendedor responsável';

-- ============================================================
-- Backfill: Preencher closer_name e closer_email com dados existentes
-- Usa a oportunidade mais recente para determinar o closer
-- ============================================================

UPDATE contatos c
SET 
    closer_name = (
        SELECT o.vendedor_closer 
        FROM oportunidades o 
        WHERE o.contato_id = c.id 
        ORDER BY o.created_at DESC NULLS LAST, o.id DESC
        LIMIT 1
    )
WHERE c.closer_name IS NULL
  AND EXISTS (
      SELECT 1 FROM oportunidades o WHERE o.contato_id = c.id
  );