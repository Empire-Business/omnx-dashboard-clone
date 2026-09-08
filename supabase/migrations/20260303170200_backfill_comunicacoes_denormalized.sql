-- ============================================================
-- Migration: Backfill colunas desnormalizadas na tabela comunicacoes
-- Data: 2026-03-03
-- ============================================================

-- Atualizar registros existentes com dados desnormalizados de contatos e oportunidades
-- Usa subquery para garantir determinismo: seleciona a oportunidade mais recente por created_at
UPDATE comunicacoes cm
SET 
    contato_nome = c.nome,
    contato_email = c.email,
    contato_telefone = c.telefone,
    sdr_name = c.owner_name,
    sdr_email = c.owner_email,
    closer_name = (
        SELECT o2.vendedor_closer 
        FROM oportunidades o2 
        WHERE o2.contato_id = c.id 
        ORDER BY o2.created_at DESC NULLS LAST, o2.id DESC
        LIMIT 1
    )
FROM contatos c
WHERE cm.contato_id = c.id
  AND cm.contato_nome IS NULL;
