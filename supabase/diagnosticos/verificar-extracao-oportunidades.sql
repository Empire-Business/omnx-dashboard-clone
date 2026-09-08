-- Diagnóstico: Verificar extração de oportunidades
-- Projeto: qzesffnkqgelmtfblzkr
-- Objetivo: Entender por que muitas colunas não são populadas

-- ============================================
-- 1. Ver exemplo de webhook com oportunidade
-- ============================================
SELECT 
    '=== EXEMPLO DE WEBHOOK ===' as secao,
    id,
    created_at,
    payload->>'id' as opportunity_id,
    payload->>'contact_id' as contact_id,
    payload->>'opportunity_name' as opportunity_name,
    payload->>'pipeline_name' as pipeline_name,
    payload->'customData' as custom_data_keys
FROM webhooks_ghl 
WHERE payload->>'id' IS NOT NULL 
  AND payload->>'id' != ''
ORDER BY created_at DESC 
LIMIT 1;

-- ============================================
-- 2. Ver estrutura de customData
-- ============================================
SELECT 
    '=== CUSTOM DATA KEYS ===' as secao,
    jsonb_object_keys(payload->'customData') as custom_field
FROM webhooks_ghl 
WHERE payload->'customData' IS NOT NULL
  AND payload->>'id' IS NOT NULL
LIMIT 50;

-- ============================================
-- 3. Verificar oportunidades com colunas vazias
-- ============================================
SELECT 
    '=== OPORTUNIDADES COM COLUNAS VAZIAS ===' as secao,
    COUNT(*) as total_oportunidades,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor_closer,
    COUNT(opportunity_source) as com_opportunity_source,
    COUNT(data_mql_lead_recebido) as com_data_mql_lead_recebido,
    COUNT(data_mql_contato_1) as com_data_mql_contato_1,
    COUNT(data_mql_conectado) as com_data_mql_conectado,
    COUNT(data_mql_reuniao_marcada) as com_data_mql_reuniao_marcada,
    COUNT(data_sql_reuniao_agendada) as com_data_sql_reuniao_agendada,
    COUNT(resumo_ia) as com_resumo_ia,
    COUNT(percepcao_closer) as com_percepcao_closer
FROM oportunidades;

-- ============================================
-- 4. Ver exemplo de oportunidade
-- ============================================
SELECT 
    '=== EXEMPLO DE OPORTUNIDADE ===' as secao,
    ghl_opportunity_id,
    titulo,
    status,
    pipeline_name,
    vendedor_closer,
    opportunity_source,
    data_mql_lead_recebido,
    data_mql_contato_1,
    data_mql_conectado,
    data_mql_reuniao_marcada,
    updated_at
FROM oportunidades
ORDER BY updated_at DESC
LIMIT 3;

-- ============================================
-- 5. Comparar webhook vs oportunidade
-- ============================================
SELECT 
    '=== COMPARAÇÃO WEBHOOK VS OPORTUNIDADE ===' as secao,
    w.payload->>'id' as webhook_opportunity_id,
    w.payload->>'pipeline_name' as webhook_pipeline_name,
    w.payload->'customData'->>'{{opportunity.assignedToUsersName}}' as webhook_vendedor,
    w.payload->'customData'->>'{{ opportunity.source }}' as webhook_source,
    w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}' as webhook_mql_recebido,
    o.ghl_opportunity_id as opp_id,
    o.pipeline_name as opp_pipeline_name,
    o.vendedor_closer as opp_vendedor,
    o.opportunity_source as opp_source,
    o.data_mql_lead_recebido as opp_mql_recebido
FROM webhooks_ghl w
LEFT JOIN oportunidades o ON o.ghl_opportunity_id = TRIM(w.payload->>'id')
WHERE w.payload->>'id' IS NOT NULL
  AND w.payload->>'id' != ''
ORDER BY w.created_at DESC
LIMIT 5;

-- ============================================
-- 6. Ver todas as chaves de customData disponíveis
-- ============================================
SELECT DISTINCT
    '=== TODAS AS CHAVES CUSTOM DATA ===' as secao,
    jsonb_object_keys(payload->'customData') as chave
FROM webhooks_ghl
WHERE payload->'customData' IS NOT NULL
ORDER BY chave;
