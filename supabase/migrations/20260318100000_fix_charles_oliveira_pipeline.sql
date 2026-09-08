-- Migration: corrigir pipeline_id e pipeline_name para Charles Oliveira
--
-- Problema: Lead charlesoliveira@yvysolucoes.com.br tem oportunidade com pipeline_name=NULL
-- Causa: A edge function sync-contact-opportunities executada em 2026-03-13 não preencheu o pipeline
-- Solução: Buscar o webhook mais recente e extrair pipeline_id/pipeline_name dele
--
-- Status: Oportunidade dfie7A34yZGz013M45uU agora tem pipeline_id=ZWuCjEXM2VDyLCx8CtGU, pipeline_name='Vendas SQL'

UPDATE oportunidades o
SET
    pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU',
    pipeline_name = 'Vendas SQL',
    updated_at = NOW()
WHERE o.ghl_opportunity_id = 'dfie7A34yZGz013M45uU'
  AND o.pipeline_id IS NULL
  AND o.pipeline_name IS NULL;

-- Verificação
SELECT
    c.email,
    o.id,
    o.ghl_opportunity_id,
    o.pipeline_id,
    o.pipeline_name,
    o.data_fechado
FROM oportunidades o
INNER JOIN contatos c ON c.id = o.contato_id
WHERE o.ghl_opportunity_id = 'dfie7A34yZGz013M45uU';
