-- ============================================================
-- Migration: Backfill retroativo das datas invertidas (mês/dia)
-- Contexto: parse_safe_date usava DD/MM/YYYY antes de MM/DD/YYYY.
--           GHL envia campos customizados em MM/DD/YYYY.
--           Datas com dia ≤ 12 foram armazenadas com mês e dia trocados.
--
-- Estratégia: Re-extrair todas as datas de oportunidades a partir
--             do webhook mais recente de cada oportunidade,
--             usando a função parse_safe_date() já corrigida.
--
-- ATENÇÃO: Execute APÓS a migration 20260311120000 (correção da função).
-- Data: 2026-03-11
-- ============================================================

-- ============================================
-- PASSO 1: Backfill de oportunidades
-- Usa o webhook mais recente por oportunidade
-- ============================================

UPDATE oportunidades o
SET
    -- data_lead_recebido
    data_lead_recebido = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlleads_recebidos }}',
            '{{opportunity.mqlleads_recebidos}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlleads_recebidos }}',
            '{{opportunity.d_mqlleads_recebidos}}'
        ]),
        parse_safe_date(latest_w.payload->>'date_created')
    ),

    -- data_tentativa_1
    data_tentativa_1 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato1 }}',
            '{{opportunity.mqlcontato1}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato1 }}',
            '{{opportunity.d_mqlcontato1}}'
        ])
    ),

    -- data_tentativa_2
    data_tentativa_2 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato2 }}',
            '{{opportunity.mqlcontato2}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato2 }}',
            '{{opportunity.d_mqlcontato2}}'
        ])
    ),

    -- data_tentativa_3
    data_tentativa_3 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato3 }}',
            '{{opportunity.mqlcontato3}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato3 }}',
            '{{opportunity.d_mqlcontato3}}'
        ])
    ),

    -- data_tentativa_4
    data_tentativa_4 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato4 }}',
            '{{opportunity.mqlcontato4}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato4 }}',
            '{{opportunity.d_mqlcontato4}}'
        ])
    ),

    -- data_tentativa_5
    data_tentativa_5 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato5 }}',
            '{{opportunity.mqlcontato5}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato5 }}',
            '{{opportunity.d_mqlcontato5}}'
        ])
    ),

    -- data_tentativa_6
    data_tentativa_6 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato6 }}',
            '{{opportunity.mqlcontato6}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato6 }}',
            '{{opportunity.d_mqlcontato6}}'
        ])
    ),

    -- data_tentativa_7
    data_tentativa_7 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato7 }}',
            '{{opportunity.mqlcontato7}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato7 }}',
            '{{opportunity.d_mqlcontato7}}'
        ])
    ),

    -- data_tentativa_8
    data_tentativa_8 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato8 }}',
            '{{opportunity.mqlcontato8}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato8 }}',
            '{{opportunity.d_mqlcontato8}}'
        ])
    ),

    -- data_no_show (pré-venda)
    data_no_show = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlno_show }}',
            '{{opportunity.mqlno_show}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlno_show }}',
            '{{opportunity.d_mqlno_show}}'
        ])
    ),

    -- data_conectado
    data_conectado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlconectado }}',
            '{{opportunity.mqlconectado}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlconectado }}',
            '{{opportunity.d_mqlconectado}}'
        ])
    ),

    -- data_perdido (pré-venda)
    data_perdido = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlperdido }}',
            '{{opportunity.mqlperdido}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlperdido }}',
            '{{opportunity.d_mqlperdido}}'
        ])
    ),

    -- data_qualificado
    data_qualificado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlqualificado }}',
            '{{opportunity.mqlqualificado}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlqualificado }}',
            '{{opportunity.d_mqlqualificado}}'
        ])
    ),

    -- data_agendamento_reuniao
    data_agendamento_reuniao = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlreunio_marcada }}',
            '{{opportunity.mqlreunio_marcada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlreunio_marcada }}',
            '{{opportunity.d_mqlreunio_marcada}}'
        ])
    ),

    -- data_pendencias_preenchimento
    data_pendencias_preenchimento = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlpendencias_preenchimento }}',
            '{{opportunity.sqlpendencias_preenchimento}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d__sqlpendencias_preenchimento }}',
            '{{opportunity.d__sqlpendencias_preenchimento}}'
        ])
    ),

    -- data_no_show_vendas
    data_no_show_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlno_show }}',
            '{{opportunity.sqlno_show}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlno_show }}',
            '{{opportunity.d_sqlno_show}}'
        ])
    ),

    -- data_perdido_vendas
    data_perdido_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlperdida }}',
            '{{opportunity.sqlperdida}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlperdida }}',
            '{{opportunity.d_sqlperdida}}'
        ])
    ),

    -- data_agendamento_vendas
    data_agendamento_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_agendada }}',
            '{{opportunity.sqlreunio_agendada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_agendada }}',
            '{{opportunity.d_sqlreunio_agendada}}'
        ])
    ),

    -- data_realizacao_vendas
    data_realizacao_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_realizada }}',
            '{{opportunity.sqlreunio_realizada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_realizada }}',
            '{{opportunity.d_sqlreunio_realizada}}'
        ])
    ),

    -- data_negociacao
    data_negociacao = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlnegociao }}',
            '{{opportunity.sqlnegociao}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlnegociao }}',
            '{{opportunity.d_sqlnegociao}}'
        ])
    ),

    -- data_fechado
    data_fechado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlfechada }}',
            '{{opportunity.sqlfechada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlfechada }}',
            '{{opportunity.d_sqlfechada}}'
        ])
    ),

    -- data_reuniao_agendada
    data_reuniao_agendada = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.data_da_reunio }}',
            '{{opportunity.data_da_reunio}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_data_da_reunio }}',
            '{{opportunity.d_data_da_reunio}}'
        ])
    ),

    -- data_reuniao_realizada
    data_reuniao_realizada = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.reuniao_realizada }}',
            '{{opportunity.reuniao_realizada}}',
            '{{ opportunity.data_da_reunio_realizada }}',
            '{{opportunity.data_da_reunio_realizada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_reuniao_realizada }}',
            '{{opportunity.d_reuniao_realizada}}'
        ])
    ),

    -- data_criacao_contato
    data_criacao_contato = parse_safe_date(latest_w.payload->>'date_created'),

    updated_at = NOW()

FROM (
    SELECT DISTINCT ON (TRIM(payload->>'id'))
        TRIM(payload->>'id') AS opp_id,
        payload
    FROM webhooks_ghl
    WHERE payload->>'id' IS NOT NULL
      AND TRIM(payload->>'id') != ''
    ORDER BY TRIM(payload->>'id'), created_at DESC
) AS latest_w

WHERE o.ghl_opportunity_id = latest_w.opp_id;

-- ============================================
-- PASSO 2: Log e verificação pós-backfill
-- ============================================

DO $$
DECLARE
    v_total_opps          INTEGER;
    v_opps_com_data       INTEGER;
    v_datas_futuras_lead  INTEGER;
    v_datas_futuras_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_opps FROM oportunidades;

    SELECT COUNT(*) INTO v_opps_com_data
    FROM oportunidades
    WHERE data_lead_recebido IS NOT NULL;

    -- Datas de data_lead_recebido mais de 30 dias no futuro (suspeitas)
    SELECT COUNT(*) INTO v_datas_futuras_lead
    FROM oportunidades
    WHERE data_lead_recebido > NOW() + INTERVAL '30 days';

    -- Qualquer coluna de data suspeita (mais de 30 dias no futuro)
    SELECT COUNT(*) INTO v_datas_futuras_total
    FROM oportunidades
    WHERE data_lead_recebido       > NOW() + INTERVAL '30 days'
       OR data_tentativa_1         > NOW() + INTERVAL '30 days'
       OR data_tentativa_2         > NOW() + INTERVAL '30 days'
       OR data_tentativa_3         > NOW() + INTERVAL '30 days'
       OR data_tentativa_4         > NOW() + INTERVAL '30 days'
       OR data_tentativa_5         > NOW() + INTERVAL '30 days'
       OR data_tentativa_6         > NOW() + INTERVAL '30 days'
       OR data_tentativa_7         > NOW() + INTERVAL '30 days'
       OR data_tentativa_8         > NOW() + INTERVAL '30 days'
       OR data_no_show             > NOW() + INTERVAL '30 days'
       OR data_conectado           > NOW() + INTERVAL '30 days'
       OR data_perdido             > NOW() + INTERVAL '30 days'
       OR data_qualificado         > NOW() + INTERVAL '30 days'
       OR data_agendamento_reuniao > NOW() + INTERVAL '30 days'
       OR data_no_show_vendas      > NOW() + INTERVAL '30 days'
       OR data_perdido_vendas      > NOW() + INTERVAL '30 days'
       OR data_agendamento_vendas  > NOW() + INTERVAL '30 days'
       OR data_realizacao_vendas   > NOW() + INTERVAL '30 days'
       OR data_negociacao          > NOW() + INTERVAL '30 days'
       OR data_fechado             > NOW() + INTERVAL '30 days';

    RAISE NOTICE '========================================================';
    RAISE NOTICE 'Backfill datas (correc¸a~o invers~ao me^s/dia) concluido!';
    RAISE NOTICE 'Total de oportunidades:                  %', v_total_opps;
    RAISE NOTICE 'Oportunidades com data_lead_recebido:    %', v_opps_com_data;
    RAISE NOTICE '--------------------------------------------------------';
    RAISE NOTICE 'Datas futuras em data_lead_recebido:     %', v_datas_futuras_lead;
    RAISE NOTICE 'Colunas com datas futuras (qualquer):    %', v_datas_futuras_total;
    IF v_datas_futuras_lead > 0 THEN
        RAISE WARNING 'ATENC¸A~O: ainda existem % data_lead_recebido no futuro (>30d). Verificar manualmente.', v_datas_futuras_lead;
    ELSE
        RAISE NOTICE 'OK: nenhuma data_lead_recebido suspeita no futuro.';
    END IF;
    RAISE NOTICE '========================================================';
END $$;
