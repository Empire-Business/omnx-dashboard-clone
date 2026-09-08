-- ============================================================
-- Migration: Backfill de datas usando parse_safe_date()
-- Problema: Dados históricos com datas incorretas (inversão mês/dia)
-- Solução: Reprocessar todos os webhooks para corrigir datas
-- Data: 2026-02-27
-- ============================================================

-- ============================================
-- PASSO 1: Criar função auxiliar para extrair e parsear data
-- ============================================

CREATE OR REPLACE FUNCTION extract_and_parse_date(
    p_custom_data jsonb,
    p_field_variations text[]
) RETURNS timestamptz AS $$
DECLARE
    v_value text;
BEGIN
    v_value := extract_custom_field(p_custom_data, p_field_variations);
    RETURN parse_safe_date(v_value);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extract_and_parse_date IS 
'Extrai campo de customData e converte para timestamptz usando parse_safe_date()';

-- ============================================
-- PASSO 2: Backfill da tabela oportunidades
-- ============================================

-- Atualizar todas as datas das oportunidades existentes
UPDATE oportunidades o
SET
    -- Datas MQL
    data_mql_lead_recebido = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlleads_recebidos }}',
            '{{opportunity.mqlleads_recebidos}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlleads_recebidos }}',
            '{{opportunity.d_mqlleads_recebidos}}'
        ]),
        parse_safe_date(w.payload->>'date_created')
    ),
    
    data_mql_contato_1 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato1 }}',
            '{{opportunity.mqlcontato1}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato1 }}',
            '{{opportunity.d_mqlcontato1}}'
        ])
    ),
    
    data_mql_contato_2 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato2 }}',
            '{{opportunity.mqlcontato2}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato2 }}',
            '{{opportunity.d_mqlcontato2}}'
        ])
    ),
    
    data_mql_contato_3 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato3 }}',
            '{{opportunity.mqlcontato3}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato3 }}',
            '{{opportunity.d_mqlcontato3}}'
        ])
    ),
    
    data_mql_contato_4 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato4 }}',
            '{{opportunity.mqlcontato4}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato4 }}',
            '{{opportunity.d_mqlcontato4}}'
        ])
    ),
    
    data_mql_contato_5 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato5 }}',
            '{{opportunity.mqlcontato5}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato5 }}',
            '{{opportunity.d_mqlcontato5}}'
        ])
    ),
    
    data_mql_contato_6 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato6 }}',
            '{{opportunity.mqlcontato6}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato6 }}',
            '{{opportunity.d_mqlcontato6}}'
        ])
    ),
    
    data_mql_contato_7 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato7 }}',
            '{{opportunity.mqlcontato7}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato7 }}',
            '{{opportunity.d_mqlcontato7}}'
        ])
    ),
    
    data_mql_contato_8 = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlcontato8 }}',
            '{{opportunity.mqlcontato8}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlcontato8 }}',
            '{{opportunity.d_mqlcontato8}}'
        ])
    ),
    
    data_mql_no_show = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlno_show }}',
            '{{opportunity.mqlno_show}}',
            '{{ opportunity.sqlno_show }}',
            '{{opportunity.sqlno_show}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlno_show }}',
            '{{opportunity.d_mqlno_show}}',
            '{{ opportunity.d_sqlno_show }}',
            '{{opportunity.d_sqlno_show}}'
        ])
    ),
    
    data_mql_conectado = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlconectado }}',
            '{{opportunity.mqlconectado}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlconectado }}',
            '{{opportunity.d_mqlconectado}}'
        ])
    ),
    
    data_mql_perdido = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlperdido }}',
            '{{opportunity.mqlperdido}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlperdido }}',
            '{{opportunity.d_mqlperdido}}'
        ])
    ),
    
    data_mql_qualificado = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlqualificado }}',
            '{{opportunity.mqlqualificado}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlqualificado }}',
            '{{opportunity.d_mqlqualificado}}'
        ])
    ),
    
    data_mql_reuniao_marcada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.mqlreunio_marcada }}',
            '{{opportunity.mqlreunio_marcada}}',
            '{{ opportunity.sqlreunio_agendada }}',
            '{{opportunity.sqlreunio_agendada}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_mqlreunio_marcada }}',
            '{{opportunity.d_mqlreunio_marcada}}'
        ])
    ),
    
    data_pendencias_preenchimento = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlpendencias_preenchimento }}',
            '{{opportunity.sqlpendencias_preenchimento}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d__sqlpendencias_preenchimento }}',
            '{{opportunity.d__sqlpendencias_preenchimento}}'
        ])
    ),
    
    -- Datas SQL
    data_sql_no_show = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlno_show }}',
            '{{opportunity.sqlno_show}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlno_show }}',
            '{{opportunity.d_sqlno_show}}'
        ])
    ),
    
    data_sql_perdido = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlperdida }}',
            '{{opportunity.sqlperdida}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlperdida }}',
            '{{opportunity.d_sqlperdida}}'
        ])
    ),
    
    data_sql_reuniao_agendada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_agendada }}',
            '{{opportunity.sqlreunio_agendada}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_agendada }}',
            '{{opportunity.d_sqlreunio_agendada}}'
        ])
    ),
    
    data_sql_reuniao_realizada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlreunio_realizada }}',
            '{{opportunity.sqlreunio_realizada}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlreunio_realizada }}',
            '{{opportunity.d_sqlreunio_realizada}}'
        ])
    ),
    
    data_sql_negociacao = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlnegociao }}',
            '{{opportunity.sqlnegociao}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlnegociao }}',
            '{{opportunity.d_sqlnegociao}}'
        ])
    ),
    
    data_sql_fechada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.sqlfechada }}',
            '{{opportunity.sqlfechada}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_sqlfechada }}',
            '{{opportunity.d_sqlfechada}}'
        ])
    ),
    
    -- Datas de reunião
    data_reuniao_agendada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.data_da_reunio }}',
            '{{opportunity.data_da_reunio}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_data_da_reunio }}',
            '{{opportunity.d_data_da_reunio}}'
        ])
    ),
    
    data_reuniao_realizada = COALESCE(
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.reuniao_realizada }}',
            '{{opportunity.reuniao_realizada}}',
            '{{ opportunity.data_da_reunio_realizada }}',
            '{{opportunity.data_da_reunio_realizada}}'
        ]),
        extract_and_parse_date(w.payload->'customData', ARRAY[
            '{{ opportunity.d_reuniao_realizada }}',
            '{{opportunity.d_reuniao_realizada}}'
        ])
    ),
    
    data_criacao_contato = parse_safe_date(w.payload->>'date_created'),
    
    updated_at = NOW()
FROM webhooks_ghl w
WHERE o.ghl_opportunity_id = w.payload->>'id';

-- ============================================
-- PASSO 3: Backfill da tabela contatos
-- ============================================

UPDATE contatos c
SET
    date_created = parse_safe_date(w.payload->>'date_created'),
    updated_at = NOW()
FROM webhooks_ghl w
WHERE c.ghl_id = w.payload->>'contact_id'
  AND c.date_created IS NULL;

-- ============================================
-- PASSO 4: Log do backfill
-- ============================================

-- Nota: ROW_COUNT é capturado por statement, então usamos queries separadas para contagem
DO $$
DECLARE
    v_oportunidades_atualizadas INTEGER;
    v_contatos_atualizados INTEGER;
BEGIN
    -- Contar oportunidades que foram atualizadas (têm data_mql_lead_recebido preenchido)
    SELECT COUNT(*) INTO v_oportunidades_atualizadas
    FROM oportunidades o
    WHERE o.data_mql_lead_recebido IS NOT NULL;
    
    -- Contar contatos que foram atualizados
    SELECT COUNT(*) INTO v_contatos_atualizados
    FROM contatos c
    WHERE c.date_created IS NOT NULL;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Backfill de datas concluído!';
    RAISE NOTICE 'Oportunidades com data_lead_recebido: %', v_oportunidades_atualizadas;
    RAISE NOTICE 'Contatos com date_created: %', v_contatos_atualizados;
    RAISE NOTICE '========================================';
END $$;
