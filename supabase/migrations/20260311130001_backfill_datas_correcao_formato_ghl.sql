-- ============================================================
-- Migration: Backfill retroativo com parse_safe_date corrigido
--            (formato real GHL: D/M/YYYY H:MM AM/PM)
--
-- Contexto: O backfill anterior (20260311120001) usou o parser
-- com MM/DD-first, que interpretou "7/3/2026 08:40 PM" como July 3.
-- Este backfill re-executa com o parser corrigido (branch 2 DD/MM)
-- que interpreta corretamente como March 7.
--
-- EXECUTE APÓS 20260311130000 (correção do parse_safe_date).
-- ============================================================

-- ============================================
-- PASSO 1: Re-backfill de oportunidades
-- ============================================

UPDATE oportunidades o
SET
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

    data_tentativa_1 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}'
        ])
    ),
    data_tentativa_2 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}'
        ])
    ),
    data_tentativa_3 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}'
        ])
    ),
    data_tentativa_4 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}'
        ])
    ),
    data_tentativa_5 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}'
        ])
    ),
    data_tentativa_6 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}'
        ])
    ),
    data_tentativa_7 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}'
        ])
    ),
    data_tentativa_8 = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}'
        ])
    ),
    data_no_show = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}'
        ])
    ),
    data_conectado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}'
        ])
    ),
    data_perdido = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}'
        ])
    ),
    data_qualificado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}'
        ])
    ),
    data_agendamento_reuniao = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.mqlreunio_marcada }}', '{{opportunity.mqlreunio_marcada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlreunio_marcada }}', '{{opportunity.d_mqlreunio_marcada}}'
        ])
    ),
    data_pendencias_preenchimento = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}'
        ])
    ),
    data_no_show_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}'
        ])
    ),
    data_perdido_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}'
        ])
    ),
    data_agendamento_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_agendada }}', '{{opportunity.d_sqlreunio_agendada}}'
        ])
    ),
    data_realizacao_vendas = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}'
        ])
    ),
    data_negociacao = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}'
        ])
    ),
    data_fechado = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}'
        ])
    ),
    data_reuniao_agendada = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_data_da_reunio }}', '{{opportunity.d_data_da_reunio}}'
        ])
    ),
    data_reuniao_realizada = COALESCE(
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}',
            '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'
        ]),
        extract_and_parse_date(latest_w.payload->'customData', ARRAY[
            '{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}'
        ])
    ),
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
-- PASSO 2: Log e verificação
-- ============================================

DO $$
DECLARE
    v_total_opps         INTEGER;
    v_datas_futuras_lead INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total_opps FROM oportunidades;

    SELECT COUNT(*) INTO v_datas_futuras_lead
    FROM oportunidades
    WHERE data_lead_recebido > NOW() + INTERVAL '30 days';

    RAISE NOTICE '========================================================';
    RAISE NOTICE 'Backfill GHL datetime format concluido!';
    RAISE NOTICE 'Total de oportunidades:               %', v_total_opps;
    RAISE NOTICE 'data_lead_recebido no futuro (>30d):  %', v_datas_futuras_lead;
    IF v_datas_futuras_lead = 0 THEN
        RAISE NOTICE 'OK: nenhuma data_lead_recebido suspeita.';
    ELSIF v_datas_futuras_lead < 50 THEN
        RAISE NOTICE 'OK (aceitavel): poucos casos no futuro.';
    ELSE
        RAISE WARNING 'ATENCAO: % datas no futuro — verificar manualmente.', v_datas_futuras_lead;
    END IF;
    RAISE NOTICE '========================================================';
END $$;
