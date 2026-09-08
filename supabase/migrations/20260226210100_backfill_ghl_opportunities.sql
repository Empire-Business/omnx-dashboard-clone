-- ============================================================
-- Migration: Backfill de oportunidades GHL com dados corretos
-- Usa webhooks armazenados em webhook_events para atualizar
-- Data: 2026-02-26
-- ============================================================

-- ============================================================
-- PASSO 1: Verificar quantos registros serão atualizados
-- ============================================================
DO $$
DECLARE
    v_total_opportunities integer;
    v_total_webhooks integer;
    v_matchable integer;
BEGIN
    -- Contar oportunidades
    SELECT COUNT(*) INTO v_total_opportunities 
    FROM public.gohighlevel_opportunities;
    
    -- Contar webhooks de oportunidade
    SELECT COUNT(*) INTO v_total_webhooks 
    FROM public.webhook_events 
    WHERE event_type IN ('OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'opportunity_created', 'opportunity_updated');
    
    -- Contar oportunidades que têm webhook correspondente
    SELECT COUNT(DISTINCT o.id) INTO v_matchable
    FROM public.gohighlevel_opportunities o
    INNER JOIN public.webhook_events w 
        ON w.payload->>'id' = o.ghl_opportunity_id
    WHERE w.event_type IN ('OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'opportunity_created', 'opportunity_updated');
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DIAGNÓSTICO PRÉ-BACKFILL';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total de oportunidades: %', v_total_opportunities;
    RAISE NOTICE 'Total de webhooks de oportunidade: %', v_total_webhooks;
    RAISE NOTICE 'Oportunidades com webhook correspondente: %', v_matchable;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- PASSO 2: Criar tabela temporária para validação
-- ============================================================
DROP TABLE IF EXISTS temp_backfill_preview;

CREATE TEMP TABLE temp_backfill_preview AS
SELECT 
    o.id as opportunity_db_id,
    o.ghl_opportunity_id,
    o.name as current_name,
    COALESCE(w.payload->>'name', o.name) as new_name,
    o.lost_reason as current_lost_reason,
    NULLIF(TRIM(w.payload->'customData'->>'Lost Reason'), '') as new_lost_reason,
    o.opportunity_source as current_source,
    NULLIF(TRIM(w.payload->'customData'->>'Opportunity Source'), '') as new_source,
    o.owner_name as current_owner,
    NULLIF(TRIM(w.payload->'customData'->>'Owner (SDR ou SS)'), '') as new_owner,
    o.custom_fields IS NULL as has_custom_fields,
    w.payload->'customData' IS NOT NULL as webhook_has_customdata
FROM public.gohighlevel_opportunities o
INNER JOIN LATERAL (
    SELECT payload 
    FROM public.webhook_events w
    WHERE w.payload->>'id' = o.ghl_opportunity_id
      AND w.event_type IN ('OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'opportunity_created', 'opportunity_updated')
    ORDER BY w.created_at DESC
    LIMIT 1
) w ON true
LIMIT 100;

-- Log de amostra
DO $$
DECLARE
    v_preview_count integer;
BEGIN
    SELECT COUNT(*) INTO v_preview_count FROM temp_backfill_preview;
    RAISE NOTICE 'Amostra de preview criada: % registros', v_preview_count;
END $$;

-- ============================================================
-- PASSO 3: Executar backfill principal
-- ============================================================

-- Atualizar oportunidades usando a função de extração corrigida
UPDATE public.gohighlevel_opportunities o
SET
    -- Campos básicos
    name = COALESCE(extracted.name, o.name),
    status = COALESCE(extracted.status, o.status),
    pipeline_name = COALESCE(extracted.pipeline_name, o.pipeline_name),
    pipeline_stage_name = COALESCE(extracted.pipeline_stage_name, o.pipeline_stage_name),
    monetary_value = COALESCE(extracted.monetary_value, o.monetary_value),
    
    -- Campos de customData
    opportunity_source = COALESCE(extracted.opportunity_source, o.opportunity_source),
    owner_name = COALESCE(extracted.owner_name, o.owner_name),
    owner_email = COALESCE(extracted.owner_email, o.owner_email),
    lost_reason = COALESCE(extracted.lost_reason, o.lost_reason),
    custom_fields = COALESCE(extracted.custom_fields, o.custom_fields),
    
    -- Campos MQL
    op_dateadded = COALESCE(extracted.op_dateadded, o.op_dateadded),
    date_mql_connected = COALESCE(extracted.date_mql_connected, o.date_mql_connected),
    date_mql_lost = COALESCE(extracted.date_mql_lost, o.date_mql_lost),
    date_no_show = COALESCE(extracted.date_no_show, o.date_no_show),
    date_meeting = COALESCE(extracted.date_meeting, o.date_meeting),
    date_meeting_completed = COALESCE(extracted.date_meeting_completed, o.date_meeting_completed),
    mql_contato_1 = COALESCE(extracted.mql_contato_1, o.mql_contato_1),
    mql_contato_2 = COALESCE(extracted.mql_contato_2, o.mql_contato_2),
    mql_contato_3 = COALESCE(extracted.mql_contato_3, o.mql_contato_3),
    mql_contato_4 = COALESCE(extracted.mql_contato_4, o.mql_contato_4),
    mql_contato_5 = COALESCE(extracted.mql_contato_5, o.mql_contato_5),
    mql_contato_6 = COALESCE(extracted.mql_contato_6, o.mql_contato_6),
    mql_contato_7 = COALESCE(extracted.mql_contato_7, o.mql_contato_7),
    mql_contato_8 = COALESCE(extracted.mql_contato_8, o.mql_contato_8),
    
    -- Campos SQL
    date_sql_scheduled = COALESCE(extracted.date_sql_scheduled, o.date_sql_scheduled),
    date_sql_completed = COALESCE(extracted.date_sql_completed, o.date_sql_completed),
    
    -- Campos UTM
    override_utm_source = COALESCE(extracted.override_utm_source, o.override_utm_source),
    
    -- Campos de venda
    op_valor_entrada = COALESCE(extracted.op_valor_entrada, o.op_valor_entrada),
    op_num_parcelas = COALESCE(extracted.op_num_parcelas, o.op_num_parcelas),
    op_valor_parcela = COALESCE(extracted.op_valor_parcela, o.op_valor_parcela),
    op_receita_total = COALESCE(extracted.op_receita_total, o.op_receita_total),
    
    -- Metadata
    updated_at = NOW()
FROM (
    SELECT 
        w.payload->>'id' as ghl_id,
        proc.*
    FROM public.webhook_events w
    CROSS JOIN LATERAL public.process_ghl_opportunity_webhook(w.payload) proc
    WHERE w.event_type IN ('OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'opportunity_created', 'opportunity_updated')
      AND w.payload->>'id' IS NOT NULL
) extracted
WHERE o.ghl_opportunity_id = extracted.ghl_id;

-- Log do resultado
DO $$
DECLARE
    v_updated integer;
BEGIN
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'BACKFILL CONCLUÍDO';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Registros atualizados: %', v_updated;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- PASSO 4: Verificar resultados pós-backfill
-- ============================================================
DO $$
DECLARE
    v_total integer;
    v_with_lost_reason integer;
    v_with_source integer;
    v_with_owner integer;
    v_with_custom_fields integer;
BEGIN
    -- Contagens pós-backfill
    SELECT COUNT(*) INTO v_total FROM public.gohighlevel_opportunities;
    SELECT COUNT(*) INTO v_with_lost_reason FROM public.gohighlevel_opportunities WHERE lost_reason IS NOT NULL AND lost_reason != '';
    SELECT COUNT(*) INTO v_with_source FROM public.gohighlevel_opportunities WHERE opportunity_source IS NOT NULL AND opportunity_source != '';
    SELECT COUNT(*) INTO v_with_owner FROM public.gohighlevel_opportunities WHERE owner_name IS NOT NULL AND owner_name != '';
    SELECT COUNT(*) INTO v_with_custom_fields FROM public.gohighlevel_opportunities WHERE custom_fields IS NOT NULL;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESULTADO PÓS-BACKFILL';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total de oportunidades: %', v_total;
    RAISE NOTICE 'Com lost_reason: % (%.1f%%)', v_with_lost_reason, (v_with_lost_reason::float / v_total * 100);
    RAISE NOTICE 'Com opportunity_source: % (%.1f%%)', v_with_source, (v_with_source::float / v_total * 100);
    RAISE NOTICE 'Com owner_name: % (%.1f%%)', v_with_owner, (v_with_owner::float / v_total * 100);
    RAISE NOTICE 'Com custom_fields: % (%.1f%%)', v_with_custom_fields, (v_with_custom_fields::float / v_total * 100);
    RAISE NOTICE '========================================';
END $$;

-- ============================================================
-- PASSO 5: Limpeza
-- ============================================================
DROP TABLE IF EXISTS temp_backfill_preview;

-- ============================================================
-- ÍNDICE para melhor performance em futuras consultas
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_webhook_events_payload_id 
ON public.webhook_events ((payload->>'id')) 
WHERE event_type IN ('OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'opportunity_created', 'opportunity_updated');

-- ============================================================
-- COMENTÁRIO
-- ============================================================
COMMENT ON THIS MIGRATION IS 'Backfill de oportunidades GHL usando webhooks armazenados. Atualiza campos customData com chaves corretas.';
