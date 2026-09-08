-- Migration: backfill pipeline_id e pipeline_name para todas as 745 oportunidades com pipeline_id NULL
--
-- Problema: 745 oportunidades (743 válidas, 2 vendas fechadas) têm pipeline_id e pipeline_name NULL.
-- Causa: Edge function sync-contact-opportunities criou opps via API GHL, mas API retornou pipeline=null
-- Solução: Buscar webhook mais recente e extrair pipeline_id/pipeline_name dela
--
-- Estatísticas:
-- - Total com NULL: 745
-- - Com data_lead_recebido (válidas): 743
-- - Com data_fechado (vendas invisíveis): 2
-- - Esperado atualizar: ~740-745 registros

WITH webhook_pipelines AS (
    -- Para cada oportunidade com pipeline NULL, busca o webhook mais recente
    -- e extrai pipeline_id + pipeline_name
    SELECT DISTINCT ON (o.id)
        o.id as opp_id,
        TRIM(w.payload->>'pipeline_id') as webhook_pipeline_id,
        TRIM(w.payload->>'pipeline_name') as webhook_pipeline_name
    FROM oportunidades o
    INNER JOIN webhooks_ghl w ON w.payload->>'id' = o.ghl_opportunity_id
    WHERE o.pipeline_id IS NULL
      AND w.payload->>'pipeline_id' IS NOT NULL
      AND TRIM(w.payload->>'pipeline_id') != ''
    ORDER BY o.id, w.created_at DESC
)
UPDATE oportunidades o
SET
    pipeline_id = wp.webhook_pipeline_id,
    pipeline_name = wp.webhook_pipeline_name,
    updated_at = NOW()
FROM webhook_pipelines wp
WHERE o.id = wp.opp_id
  AND o.pipeline_id IS NULL
  AND wp.webhook_pipeline_id IS NOT NULL;

-- Verificação pós-atualização
SELECT
    COUNT(*) as ainda_com_pipeline_null,
    COUNT(CASE WHEN data_fechado IS NOT NULL THEN 1 END) as vendas_ainda_nulas
FROM oportunidades
WHERE pipeline_id IS NULL;

-- Exemplos de registros corrigidos
SELECT
    c.email,
    o.ghl_opportunity_id,
    o.pipeline_id,
    o.pipeline_name,
    o.data_fechado,
    o.data_lead_recebido,
    o.status
FROM oportunidades o
INNER JOIN contatos c ON c.id = o.contato_id
WHERE o.pipeline_id IS NOT NULL
  AND o.pipeline_name IS NOT NULL
  AND o.updated_at >= NOW() - INTERVAL '5 minutes'
LIMIT 10;
