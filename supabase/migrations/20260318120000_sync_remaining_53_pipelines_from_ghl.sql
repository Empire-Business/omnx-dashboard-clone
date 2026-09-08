-- Migration: sincronizar pipeline_id para as últimas 53 oportunidades ainda com NULL
--
-- Problema: 53 oportunidades têm pipeline_id=NULL em TODAS as fontes (webhook + API GHL anterior)
-- Estratégia:
-- 1. Enfileirar essas 53 opps em contact_opp_sync_queue para re-sincronização via API GHL
-- 2. Edge function sync-contact-opportunities buscará os dados atualizados
-- 3. Se mesmo assim pipeline ficar NULL, adicionar tag "VERIFICAR_PIPELINE" ao lead
--
-- OBS: Essa migration apenas enfileira. A sincronização real depende da edge function.
--
-- Estatísticas:
-- - Total ainda com NULL: 53
-- - Ações esperadas: re-sincronizar via API GHL

-- 1. Verificar que ainda há 53
-- SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL;

-- 2. Marcar essas opps para re-sincronização posterior
-- (comentado por enquanto — depende de implementar fluxo de re-sync)

-- Para diagnóstico:
SELECT
    COUNT(*) as opps_pipeline_null,
    COUNT(DISTINCT contato_id) as contatos_afetados,
    MIN(data_lead_recebido) as data_minima,
    MAX(data_lead_recebido) as data_maxima
FROM oportunidades
WHERE pipeline_id IS NULL;

-- Top 5 contatos com mais opps sem pipeline
SELECT
    c.email,
    COUNT(*) as opps_sem_pipeline
FROM oportunidades o
INNER JOIN contatos c ON c.id = o.contato_id
WHERE o.pipeline_id IS NULL
GROUP BY c.id, c.email
ORDER BY COUNT(*) DESC
LIMIT 5;
