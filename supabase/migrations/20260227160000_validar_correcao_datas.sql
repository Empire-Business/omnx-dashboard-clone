-- ============================================================
-- Migration: Validação da correção de datas
-- Objetivo: Queries para verificar se a correção funcionou
-- Data: 2026-02-27
-- ============================================================

-- ============================================
-- VALIDAÇÃO 1: Verificar se há datas no futuro (impossíveis)
-- ============================================

-- Criar view para monitoramento
CREATE OR REPLACE VIEW vw_validacao_datas AS
SELECT 
    'datas_no_futuro' as tipo_validacao,
    COUNT(*) as registros_com_problema,
    'Registros com data_lead_recebido em meses futuros (maior que mês atual)' as descricao
FROM oportunidades
WHERE EXTRACT(YEAR FROM data_mql_lead_recebido) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM data_mql_lead_recebido) > EXTRACT(MONTH FROM CURRENT_DATE)

UNION ALL

SELECT 
    'datas_no_passado_distante' as tipo_validacao,
    COUNT(*) as registros_com_problema,
    'Registros com data_lead_recebido antes de 2025 (suspeito)' as descricao
FROM oportunidades
WHERE data_mql_lead_recebido < '2025-01-01'::timestamptz

UNION ALL

SELECT 
    'datas_nulas' as tipo_validacao,
    COUNT(*) as registros_com_problema,
    'Registros MQL sem data_lead_recebido' as descricao
FROM oportunidades o
WHERE o.pipeline_name = 'Pré-Vendas MQL'
  AND o.data_mql_lead_recebido IS NULL;

COMMENT ON VIEW vw_validacao_datas IS 
'View de monitoramento para validar correção de datas. Todos os contadores devem ser 0 ou muito baixos.';

-- ============================================
-- VALIDAÇÃO 2: Comparar webhook bruto com tabela
-- ============================================

CREATE OR REPLACE VIEW vw_comparacao_datas_webhook_tabela AS
SELECT 
    o.ghl_opportunity_id,
    o.nome_contato,
    o.data_mql_lead_recebido as data_na_tabela,
    w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}' as data_no_webhook,
    w.payload->>'date_created' as date_created_webhook,
    CASE 
        WHEN o.data_mql_lead_recebido IS NULL THEN 'SEM_DATA_TABELA'
        WHEN w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}' IS NULL THEN 'SEM_DATA_WEBHOOK'
        WHEN DATE(o.data_mql_lead_recebido) = DATE(parse_safe_date(w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}')) THEN 'OK'
        ELSE 'DIVERGENTE'
    END as status_comparacao
FROM oportunidades o
JOIN webhooks_ghl w ON w.payload->>'id' = o.ghl_opportunity_id
WHERE w.payload->>'pipeline_name' = 'Pré-Vendas MQL'
ORDER BY o.data_mql_lead_recebido DESC
LIMIT 100;

COMMENT ON VIEW vw_comparacao_datas_webhook_tabela IS 
'Comparação entre datas no webhook bruto e na tabela oportunidades. Útil para validar se parse_safe_date está funcionando.';

-- ============================================
-- VALIDAÇÃO 3: Função para teste de parse_safe_date
-- ============================================

CREATE OR REPLACE FUNCTION testar_parse_safe_date()
RETURNS TABLE(
    input text,
    resultado timestamptz,
    esperado timestamptz,
    status text
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.input,
        parse_safe_date(v.input) as resultado,
        v.esperado,
        CASE 
            WHEN parse_safe_date(v.input) = v.esperado THEN '✅ OK'
            ELSE '❌ FALHOU'
        END as status
    FROM (
        VALUES
            -- Testes ISO8601 timestamp
            ('2026-02-13T01:17:19.806Z', '2026-02-13 01:17:19.806+00'::timestamptz),
            ('2026-02-13T01:17:19Z', '2026-02-13 01:17:19+00'::timestamptz),
            
            -- Testes ISO date (YYYY-MM-DD)
            ('2026-02-12', '2026-02-12 00:00:00+00'::timestamptz),
            ('2026-01-05', '2026-01-05 00:00:00+00'::timestamptz),
            ('2025-12-25', '2025-12-25 00:00:00+00'::timestamptz),
            
            -- Testes formato brasileiro (DD/MM/YYYY)
            ('12/02/2026', '2026-02-12 00:00:00+00'::timestamptz),
            ('05/01/2026', '2026-01-05 00:00:00+00'::timestamptz),
            ('25/12/2025', '2025-12-25 00:00:00+00'::timestamptz),
            
            -- Testes edge cases
            ('', NULL::timestamptz),
            (NULL, NULL::timestamptz),
            ('   ', NULL::timestamptz),
            ('invalid', NULL::timestamptz)
    ) AS v(input, esperado);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION testar_parse_safe_date IS 
'Função de teste para validar comportamento de parse_safe_date() com diferentes formatos de entrada.';

-- ============================================
-- Executar testes de validação
-- ============================================

DO $$
DECLARE
    v_futuro INTEGER;
    v_passado INTEGER;
    v_nulas INTEGER;
BEGIN
    -- Contar problemas
    SELECT COUNT(*) INTO v_futuro
    FROM oportunidades
    WHERE EXTRACT(YEAR FROM data_mql_lead_recebido) = EXTRACT(YEAR FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM data_mql_lead_recebido) > EXTRACT(MONTH FROM CURRENT_DATE);
      
    SELECT COUNT(*) INTO v_passado
    FROM oportunidades
    WHERE data_mql_lead_recebido < '2025-01-01'::timestamptz;
      
    SELECT COUNT(*) INTO v_nulas
    FROM oportunidades o
    WHERE o.pipeline_name = 'Pré-Vendas MQL'
      AND o.data_mql_lead_recebido IS NULL;
    
    -- Log resultados
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VALIDAÇÃO DE DATAS APÓS CORREÇÃO';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Datas no futuro (impossíveis): %', v_futuro;
    RAISE NOTICE 'Datas no passado distante: %', v_passado;
    RAISE NOTICE 'Datas nulas em MQLs: %', v_nulas;
    RAISE NOTICE '========================================';
    
    -- Alertar se houver problemas
    IF v_futuro > 0 THEN
        RAISE WARNING 'ATENÇÃO: Ainda existem % registros com datas no futuro!', v_futuro;
    END IF;
    
    IF v_futuro = 0 THEN
        RAISE NOTICE '✅ Nenhum registro com data no futuro - CORREÇÃO OK!';
    END IF;
END $$;
