-- Backfill: preencher colunas faltantes em oportunidades a partir dos webhooks_ghl
-- Contexto: a função extrair_dados_ghl foi escrita com apenas 9 colunas para oportunidades.
-- As colunas adicionais (pipeline_name, vendedor_closer, datas MQL/SQL, etc.)
-- estavam no payload mas nunca foram extraídas.
-- Este script faz o UPDATE retroativo usando o webhook mais recente de cada oportunidade.
--
-- Seguro rodar múltiplas vezes (idempotente).
-- Não afeta o cron (não reseta processado_em).

UPDATE oportunidades o
SET
    -- Campos diretos do payload (não em customData)
    pipeline_name               = NULLIF(TRIM(w.payload->>'pipeline_name'), ''),

    -- Campos de customData: textuais
    opportunity_source          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.source }}'), ''),
    vendedor_closer             = NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.assignedToUsersName}}'), ''),
    lost_reason                 = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.lost_reason }}'), ''),
    resumo_ia                   = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.resumo_ia }}'), ''),
    percepcao_closer            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.percepo_do_closer }}{{ opportunity.percepo_do_closer }}'), ''),
    data_ultima_atividade       = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.ltima_atividade }}'), ''),

    -- Datas MQL (prefixo d_ = formato ISO "YYYY-MM-DD")
    data_mql_lead_recebido      = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_1          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato1 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_2          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato2 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_3          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato3 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_4          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato4 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_5          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato5 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_6          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato6 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_7          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato7 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_contato_8          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato8 }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_no_show            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlno_show }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_conectado          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlconectado }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_perdido            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlperdido }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_qualificado        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlqualificado }}'), '')::DATE::TIMESTAMPTZ,
    data_mql_reuniao_marcada    = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlreunio_marcada }}'), '')::DATE::TIMESTAMPTZ,
    data_pendencias_preenchimento = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d__sqlpendencias_preenchimento }}'), '')::DATE::TIMESTAMPTZ,

    -- Datas SQL
    data_sql_no_show            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlno_show }}'), '')::DATE::TIMESTAMPTZ,
    data_sql_perdido            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlperdida }}'), '')::DATE::TIMESTAMPTZ,
    data_sql_reuniao_agendada   = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_agendada }}'), '')::DATE::TIMESTAMPTZ,
    data_sql_reuniao_realizada  = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_realizada }}'), '')::DATE::TIMESTAMPTZ,
    data_sql_negociacao         = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlnegociao }}'), '')::DATE::TIMESTAMPTZ,
    data_sql_fechada            = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlfechada }}'), '')::DATE::TIMESTAMPTZ,

    -- Datas de reunião
    data_reuniao_agendada       = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio }}'), '')::DATE::TIMESTAMPTZ,
    data_reuniao_realizada      = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio_realizada }}'), '')::DATE::TIMESTAMPTZ,

    updated_at = NOW()

FROM (
    -- Pega o webhook mais recente para cada ghl_opportunity_id
    SELECT DISTINCT ON (TRIM(payload->>'id'))
        payload
    FROM webhooks_ghl
    WHERE NULLIF(TRIM(payload->>'id'), '') IS NOT NULL
    ORDER BY TRIM(payload->>'id'), created_at DESC
) w

WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id');
