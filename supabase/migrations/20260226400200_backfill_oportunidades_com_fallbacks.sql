-- Backfill: Aplicar extração corrigida em todas as oportunidades existentes
-- Contexto: Função extrair_dados_ghl foi corrigida com fallbacks
-- Este script reprocessa todos os webhooks para preencher campos faltantes

-- ============================================
-- Executar extração completa
-- ============================================

-- Reprocessar todos os webhooks existentes
SELECT extrair_dados_ghl();

-- ============================================
-- Verificar resultado
-- ============================================

DO $$
DECLARE
    v_total INTEGER;
    v_com_pipeline_name INTEGER;
    v_com_vendedor INTEGER;
    v_com_source INTEGER;
    v_com_datas INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM oportunidades;
    SELECT COUNT(*) INTO v_com_pipeline_name FROM oportunidades WHERE pipeline_name IS NOT NULL;
    SELECT COUNT(*) INTO v_com_vendedor FROM oportunidades WHERE vendedor_closer IS NOT NULL;
    SELECT COUNT(*) INTO v_com_source FROM oportunidades WHERE opportunity_source IS NOT NULL;
    SELECT COUNT(*) INTO v_com_datas FROM oportunidades WHERE data_mql_lead_recebido IS NOT NULL;
    
    RAISE NOTICE '=== RESULTADO DO BACKFILL ===';
    RAISE NOTICE 'Total de oportunidades: %', v_total;
    RAISE NOTICE 'Com pipeline_name: % (%.1f%%)', v_com_pipeline_name, (v_com_pipeline_name::FLOAT / v_total * 100);
    RAISE NOTICE 'Com vendedor_closer: % (%.1f%%)', v_com_vendedor, (v_com_vendedor::FLOAT / v_total * 100);
    RAISE NOTICE 'Com opportunity_source: % (%.1f%%)', v_com_source, (v_com_source::FLOAT / v_total * 100);
    RAISE NOTICE 'Com data_mql_lead_recebido: % (%.1f%%)', v_com_datas, (v_com_datas::FLOAT / v_total * 100);
END $$;
