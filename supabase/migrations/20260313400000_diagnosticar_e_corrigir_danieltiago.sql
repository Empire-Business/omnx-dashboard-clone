-- ============================================================
-- Migration: Diagnóstico e Correção Final — danieltiago107@gmail.com
--
-- Problema: Lead ainda não aparece no painel de fevereiro
--
-- Diagnóstico:
--   1. Verificar se lead existe em contatos
--   2. Verificar se tem oportunidades
--   3. Verificar estado de data_lead_recebido
--   4. Fazer correção adequada
-- ============================================================

DO $$
DECLARE
    v_contato_count INTEGER;
    v_opp_count INTEGER;
    v_sample_data RECORD;
BEGIN
    -- ============================================
    -- DIAGNÓSTICO: Verificar existência do lead
    -- ============================================

    SELECT COUNT(*) INTO v_contato_count
    FROM contatos
    WHERE LOWER(TRIM(email)) = LOWER('danieltiago107@gmail.com');

    RAISE NOTICE '=== DIAGNÓSTICO ===';
    RAISE NOTICE 'Contatos encontrados com email "danieltiago107@gmail.com": %', v_contato_count;

    IF v_contato_count > 0 THEN
        -- Contar oportunidades
        SELECT COUNT(*) INTO v_opp_count
        FROM contatos c
        LEFT JOIN oportunidades o ON c.id = o.contato_id
        WHERE LOWER(TRIM(c.email)) = LOWER('danieltiago107@gmail.com');

        RAISE NOTICE 'Oportunidades para este contato: %', v_opp_count;

        -- Mostrar amostra dos dados
        FOR v_sample_data IN
            SELECT
                c.id as c_id,
                c.email,
                c.date_created,
                o.id as o_id,
                o.pipeline_name,
                o.data_lead_recebido,
                o.data_conectado,
                o.data_fechado,
                o.valor
            FROM contatos c
            LEFT JOIN oportunidades o ON c.id = o.contato_id
            WHERE LOWER(TRIM(c.email)) = LOWER('danieltiago107@gmail.com')
            LIMIT 5
        LOOP
            RAISE NOTICE 'Contato ID: %, Email: %, Data criação: %', v_sample_data.c_id, v_sample_data.email, v_sample_data.date_created;
            IF v_sample_data.o_id IS NOT NULL THEN
                RAISE NOTICE '  → Opp: %, Pipeline: %, Data Lead: %, Data Fechado: %, Valor: %',
                    v_sample_data.o_id, v_sample_data.pipeline_name, v_sample_data.data_lead_recebido,
                    v_sample_data.data_fechado, v_sample_data.valor;
            ELSE
                RAISE NOTICE '  → Sem oportunidades';
            END IF;
        END LOOP;

        -- ============================================
        -- CORREÇÃO: Restaurar data_lead_recebido
        -- ============================================
        -- Se data_lead_recebido está NULL ou inválida, restaurar para a data de criação do contato

        UPDATE oportunidades o
        SET data_lead_recebido = COALESCE(o.data_lead_recebido, c.date_created)
        FROM contatos c
        WHERE c.id = o.contato_id
          AND LOWER(TRIM(c.email)) = LOWER('danieltiago107@gmail.com')
          AND o.data_lead_recebido IS NULL;

        RAISE NOTICE '';
        RAISE NOTICE 'Correção: Restaurado data_lead_recebido para data de criação do contato';

        -- Verificar resultado
        SELECT
            COUNT(*) FILTER (WHERE data_lead_recebido IS NOT NULL) as com_data,
            COUNT(*) FILTER (WHERE data_lead_recebido IS NULL) as sem_data,
            MIN(data_lead_recebido) as min_date,
            MAX(data_lead_recebido) as max_date
        INTO v_opp_count, v_contato_count, v_sample_data.data_lead_recebido, v_sample_data.data_conectado
        FROM oportunidades o
        WHERE o.contato_id IN (
            SELECT id FROM contatos
            WHERE LOWER(TRIM(email)) = LOWER('danieltiago107@gmail.com')
        );

        RAISE NOTICE 'Resultado: % opps com data_lead_recebido, % sem data', v_opp_count, v_contato_count;
        RAISE NOTICE 'Range de datas: % até %', v_sample_data.data_lead_recebido, v_sample_data.data_conectado;

    ELSE
        RAISE NOTICE '❌ ERRO: Nenhum contato encontrado com esse email!';
    END IF;

END $$;
