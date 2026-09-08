-- ============================================================
-- Migration: Fix coluna ausente + backfill Eduardo
-- Problemas identificados:
--   1. oportunidades.created_at foi dropado (20260226210001) mas
--      extrair_dados_ghl no PASSO 2.5 ainda referenciava → crash.
--   2. contatos.closer_name pode estar ausente (20260303170002
--      marcada como aplicada mas SQL não executou no banco).
-- Solução:
--   A. Garantir colunas com IF NOT EXISTS
--   B. Redefinir extrair_dados_ghl com o.id em vez de o.created_at
--   C. Backfill do webhook 65c62932 de Eduardo Sampaio
-- Data: 2026-03-12
-- ============================================================

-- A. Garantir colunas que podem estar ausentes
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS closer_name  TEXT;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS closer_email TEXT;

-- B. Redefinir extrair_dados_ghl com PASSO 2.5 corrigido (o.id, não o.created_at)
CREATE OR REPLACE FUNCTION public.extrair_dados_ghl(p_webhook_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contatos_inseridos integer, contatos_atualizados integer, oportunidades_inseridas integer, oportunidades_atualizadas integer, vendas_inseridas integer, comunicacoes_inseridas integer, reunioes_inseridas integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_contatos_inseridos INTEGER := 0;
    v_contatos_atualizados INTEGER := 0;
    v_oportunidades_inseridas INTEGER := 0;
    v_oportunidades_atualizadas INTEGER := 0;
    v_vendas_inseridas INTEGER := 0;
    v_comunicacoes_inseridas INTEGER := 0;
    v_reunioes_inseridas INTEGER := 0;
BEGIN
    -- PASSO 1: Extrair Contatos
    WITH inseridos AS (
        INSERT INTO contatos (
            ghl_id, nome, email, telefone, primeiro_nome, ultimo_nome,
            ip, url, fbclid, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, tt_term, tt_medium, tt_source, tt_content,
            country, date_created, contact_type, contact_source,
            pipeline_id_contato, pipeline_name, owner_id, owner_name, owner_email
        )
        SELECT DISTINCT
            TRIM(w.payload->>'contact_id'),
            TRIM(w.payload->>'full_name'),
            LOWER(TRIM(w.payload->>'email')),
            TRIM(w.payload->>'phone'),
            TRIM(w.payload->>'first_name'),
            TRIM(w.payload->>'last_name'),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'ip'), ''), TRIM(w.payload->'attributionSource'->>'ip')),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'url'), ''), TRIM(w.payload->'attributionSource'->>'url')),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'fbclid'), ''), TRIM(w.payload->'attributionSource'->>'fbclid')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_source'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmSource')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_medium'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmMedium')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_campaign'), ''), TRIM(w.payload->'lastAttributionSource'->>'campaign')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_term'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmTerm')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_content'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmContent')),
            TRIM(w.payload->>'tt_term'),
            TRIM(w.payload->>'tt_medium'),
            TRIM(w.payload->>'tt_source'),
            TRIM(w.payload->>'tt_content'),
            TRIM(w.payload->>'country'),
            parse_safe_date(w.payload->>'date_created'),
            TRIM(w.payload->>'contact_type'),
            TRIM(w.payload->>'contact_source'),
            TRIM(w.payload->>'pipeline_id'),
            TRIM(w.payload->>'pipeline_name'),
            TRIM(w.payload->>'Owner ID'),
            NULLIF(TRIM(w.payload->'customData'->>'Owner (SDR ou SS)'), ''),
            NULLIF(TRIM(w.payload->'customData'->>'E-mail Owner'), '')
        FROM webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (SELECT 1 FROM contatos c WHERE c.ghl_id = TRIM(w.payload->>'contact_id'))
        ON CONFLICT (ghl_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_inseridos FROM inseridos;

    WITH atualizados AS (
        UPDATE contatos c
        SET
            nome = TRIM(w.payload->>'full_name'),
            email = LOWER(TRIM(w.payload->>'email')),
            telefone = TRIM(w.payload->>'phone'),
            owner_name = COALESCE(
                NULLIF(TRIM(w.payload->'customData'->>'Owner (SDR ou SS)'), ''),
                c.owner_name
            ),
            owner_email = COALESCE(
                NULLIF(TRIM(w.payload->'customData'->>'E-mail Owner'), ''),
                c.owner_email
            ),
            updated_at = NOW()
        FROM webhooks_ghl w
        WHERE c.ghl_id = TRIM(w.payload->>'contact_id') AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- PASSO 2: Extrair Oportunidades
    WITH inseridos_opp AS (
        INSERT INTO oportunidades (
            ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo, valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer, data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3, data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7, data_tentativa_8,
            data_no_show, data_conectado, data_perdido, data_qualificado, data_agendamento_reuniao, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas, data_agendamento_vendas, data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_agendada, data_reuniao_realizada, data_criacao_contato
        )
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id'), c.id, TRIM(w.payload->>'full_name'), LOWER(TRIM(w.payload->>'email')), TRIM(w.payload->>'opportunity_name'),
            COALESCE((w.payload->>'lead_value')::DECIMAL, 0), COALESCE(TRIM(w.payload->>'status'), 'open'), TRIM(w.payload->>'pipeline_id'), TRIM(w.payload->>'pipleline_stage'), TRIM(w.payload->>'pipeline_name'),
            extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.source }}', '{{opportunity.source}}']),
            extract_custom_field(w.payload->'customData', ARRAY['{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}']),
            extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}']),
            extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}']),
            extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}']),
            extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}']),
            COALESCE(parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlleads_recebidos }}', '{{opportunity.mqlleads_recebidos}}'])), parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlleads_recebidos }}', '{{opportunity.d_mqlleads_recebidos}}'])), parse_safe_date(w.payload->>'date_created')),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlreunio_marcada }}', '{{opportunity.mqlreunio_marcada}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}'])),
            parse_safe_date(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}'])),
            parse_safe_date(w.payload->>'date_created')
        FROM webhooks_ghl w
        INNER JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE w.payload->>'id' IS NOT NULL AND TRIM(w.payload->>'id') != '' AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (SELECT 1 FROM oportunidades o WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id'))
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
        ON CONFLICT (ghl_opportunity_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_inseridas FROM inseridos_opp;

    -- Atualizar oportunidades existentes
    WITH atualizados AS (
        UPDATE oportunidades o SET nome_contato = TRIM(w.payload->>'full_name'), email_contato = LOWER(TRIM(w.payload->>'email')), titulo = TRIM(w.payload->>'opportunity_name'),
            valor = COALESCE((w.payload->>'lead_value')::DECIMAL, 0), status = COALESCE(TRIM(w.payload->>'status'), 'open'), updated_at = NOW()
        FROM webhooks_ghl w
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id') AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

    -- PASSO 2.5: Atualizar closer_name no contatos quando houver oportunidade
    -- FIX: usar o.id em vez de o.created_at (coluna dropada em 20260226210001)
    WITH closer_update AS (
        UPDATE contatos c
        SET closer_name = (
            SELECT o.vendedor_closer
            FROM oportunidades o
            WHERE o.contato_id = c.id
              AND o.vendedor_closer IS NOT NULL
              AND o.vendedor_closer != ''
            ORDER BY o.id DESC
            LIMIT 1
        ),
        updated_at = NOW()
        WHERE c.id IN (
            SELECT DISTINCT o.contato_id
            FROM oportunidades o
            INNER JOIN webhooks_ghl w ON o.ghl_opportunity_id = TRIM(w.payload->>'id')
            WHERE (p_webhook_id IS NULL OR w.id = p_webhook_id)
              AND o.vendedor_closer IS NOT NULL
              AND o.vendedor_closer != ''
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM closer_update;

    -- PASSO 3: Extrair Vendas Fechamento
    -- Guard relaxado: dispara quando QUALQUER campo de faturamento estiver presente.
    WITH vendas_para_inserir AS (
        SELECT DISTINCT ON (o.id)
            o.id as oportunidade_id, c.id as contato_id,
            TRIM(w.payload->'customData'->>'{{ opportunity.nome_contratante }}') as nome_contratante,
            TRIM(w.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}') as cpf_cnpj_contratante,
            TRIM(w.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}') as logradouro_rua_avenida,
            TRIM(w.payload->'customData'->>'{{ opportunity.numero_endereco }}') as numero_endereco,
            TRIM(w.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}') as complemento_endereco,
            TRIM(w.payload->'customData'->>'{{ opportunity.bairro }}') as bairro,
            TRIM(w.payload->'customData'->>'{{ opportunity.municipio }}') as municipio,
            TRIM(w.payload->'customData'->>'{{ opportunity.estado_uf }}') as estado_uf,
            TRIM(w.payload->'customData'->>'{{ opportunity.cep }}') as cep,
            TRIM(w.payload->'customData'->>'{{ opportunity.produto_que_foi_vendido }}') as produto_vendido,
            TRIM(w.payload->'customData'->>'{{ opportunity.observacoes_venda }}') as observacoes_venda,
            TRIM(w.payload->'customData'->>'{{ opportunity.forma_de_pagamento }}') as forma_pagamento,
            NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}'), '')::DECIMAL as valor_entrada,
            NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.numero_parcelas}}'), '')::INTEGER as numero_parcelas,
            NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.valor_parcela}}'), '')::DECIMAL as valor_parcela,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ as data_pagamento_entrada
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        JOIN oportunidades o ON o.ghl_opportunity_id = TRIM(w.payload->>'id')
        WHERE (
            TRIM(COALESCE(w.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}', '')) NOT IN ('', 'undefined')
            OR TRIM(COALESCE(w.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}', '')) NOT IN ('', 'undefined')
            OR TRIM(COALESCE(w.payload->'customData'->>'{{opportunity.numero_parcelas}}', '')) NOT IN ('', 'undefined')
            OR TRIM(COALESCE(w.payload->'customData'->>'{{opportunity.valor_parcela}}', '')) NOT IN ('', 'undefined')
        )
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY o.id, w.created_at DESC
    ),
    inseridos_vendas AS (
        INSERT INTO vendas_fechamento (oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante, logradouro_rua_avenida, numero_endereco, complemento_endereco, bairro, municipio, estado_uf, cep, produto_vendido, observacoes_venda, forma_pagamento, valor_entrada, numero_parcelas, valor_parcela, data_pagamento_entrada)
        SELECT oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante, logradouro_rua_avenida, numero_endereco, complemento_endereco, bairro, municipio, estado_uf, cep, produto_vendido, observacoes_venda, forma_pagamento, COALESCE(valor_entrada, 0), COALESCE(numero_parcelas, 0), COALESCE(valor_parcela, 0), data_pagamento_entrada
        FROM vendas_para_inserir
        ON CONFLICT (oportunidade_id) DO UPDATE SET
            nome_contratante = EXCLUDED.nome_contratante,
            cpf_cnpj_contratante = EXCLUDED.cpf_cnpj_contratante,
            logradouro_rua_avenida = EXCLUDED.logradouro_rua_avenida,
            numero_endereco = EXCLUDED.numero_endereco,
            complemento_endereco = EXCLUDED.complemento_endereco,
            bairro = EXCLUDED.bairro,
            municipio = EXCLUDED.municipio,
            estado_uf = EXCLUDED.estado_uf,
            cep = EXCLUDED.cep,
            produto_vendido = EXCLUDED.produto_vendido,
            observacoes_venda = EXCLUDED.observacoes_venda,
            forma_pagamento = EXCLUDED.forma_pagamento,
            valor_entrada = EXCLUDED.valor_entrada,
            numero_parcelas = EXCLUDED.numero_parcelas,
            valor_parcela = EXCLUDED.valor_parcela,
            data_pagamento_entrada = EXCLUDED.data_pagamento_entrada,
            updated_at = NOW()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_vendas_inseridas FROM inseridos_vendas;

    -- PASSO 4: Extrair Comunicações (com colunas desnormalizadas do contatos)
    WITH mensagens AS (
        SELECT DISTINCT ON (c.id, w.created_at)
            c.id as contato_id,
            'mensagem'::TEXT as tipo,
            TRIM(w.payload->'customData'->>'{{message.body}}') as mensagem_body,
            TRIM(w.payload->'customData'->>'{{message.subject}}') as mensagem_subject,
            TRIM(w.payload->'customData'->>'{{message.attachments}}') as mensagem_attachments,
            NULL::TEXT as ai_summary,
            NULL::TEXT as ai_transcript,
            NULL::TEXT as phone_call_from,
            NULL::TEXT as phone_call_to,
            NULL::INTEGER as phone_call_duration,
            NULL::TEXT as phone_call_from_city,
            NULL::TEXT as phone_call_from_state,
            NULL::TEXT as phone_call_answered_by_phone,
            NULL::TEXT as phone_call_answered_by_name,
            NULL::TIMESTAMPTZ as phone_call_start_time,
            NULL::TIMESTAMPTZ as phone_call_end_time,
            NULL::TEXT as phone_call_status,
            NULL::TEXT as phone_call_dispositions,
            c.nome as contato_nome,
            c.email as contato_email,
            c.telefone as contato_telefone,
            c.owner_name as sdr_name,
            c.owner_email as sdr_email,
            c.closer_name as closer_name
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{message.body}}', '')) != ''
          AND TRIM(COALESCE(w.payload->'customData'->>'{{message.body}}', '')) != 'undefined'
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY c.id, w.created_at DESC
    ),
    ligacoes AS (
        SELECT DISTINCT ON (c.id, w.created_at)
            c.id as contato_id,
            'ligacao'::TEXT as tipo,
            NULL::TEXT as mensagem_body,
            NULL::TEXT as mensagem_subject,
            NULL::TEXT as mensagem_attachments,
            NULL::TEXT as ai_summary,
            NULL::TEXT as ai_transcript,
            TRIM(w.payload->'customData'->>'{{phoneCall.from}}') as phone_call_from,
            TRIM(w.payload->'customData'->>'{{phoneCall.to}}') as phone_call_to,
            NULLIF(TRIM(w.payload->'customData'->>'{{phoneCall.duration}}'), '')::INTEGER as phone_call_duration,
            TRIM(w.payload->'customData'->>'{{phoneCall.fromCity}}') as phone_call_from_city,
            TRIM(w.payload->'customData'->>'{{phoneCall.fromState}}') as phone_call_from_state,
            TRIM(w.payload->'customData'->>'{{phoneCall.answeredBy.phone}}') as phone_call_answered_by_phone,
            TRIM(w.payload->'customData'->>'{{phoneCall.answeredBy.user.name}}') as phone_call_answered_by_name,
            NULLIF(TRIM(w.payload->'customData'->>'{{phoneCall.startTime}}'), '')::TIMESTAMPTZ as phone_call_start_time,
            NULLIF(TRIM(w.payload->'customData'->>'{{phoneCall.endTime}}'), '')::TIMESTAMPTZ as phone_call_end_time,
            TRIM(w.payload->'customData'->>'{{phoneCall.callStatus}}') as phone_call_status,
            TRIM(w.payload->'customData'->>'{{phoneCall.dispositions}}') as phone_call_dispositions,
            c.nome as contato_nome,
            c.email as contato_email,
            c.telefone as contato_telefone,
            c.owner_name as sdr_name,
            c.owner_email as sdr_email,
            c.closer_name as closer_name
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{phoneCall.duration}}', '')) != ''
          AND TRIM(COALESCE(w.payload->'customData'->>'{{phoneCall.duration}}', '')) != 'undefined'
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY c.id, w.created_at DESC
    ),
    ai_conversations AS (
        SELECT DISTINCT ON (c.id, w.created_at)
            c.id as contato_id,
            'ai_conversation'::TEXT as tipo,
            NULL::TEXT as mensagem_body,
            NULL::TEXT as mensagem_subject,
            NULL::TEXT as mensagem_attachments,
            TRIM(w.payload->'customData'->>'{{conversations_ai.summary}}') as ai_summary,
            TRIM(w.payload->'customData'->>'{{conversations_ai.transcript}}') as ai_transcript,
            NULL::TEXT as phone_call_from,
            NULL::TEXT as phone_call_to,
            NULL::INTEGER as phone_call_duration,
            NULL::TEXT as phone_call_from_city,
            NULL::TEXT as phone_call_from_state,
            NULL::TEXT as phone_call_answered_by_phone,
            NULL::TEXT as phone_call_answered_by_name,
            NULL::TIMESTAMPTZ as phone_call_start_time,
            NULL::TIMESTAMPTZ as phone_call_end_time,
            NULL::TEXT as phone_call_status,
            NULL::TEXT as phone_call_dispositions,
            c.nome as contato_nome,
            c.email as contato_email,
            c.telefone as contato_telefone,
            c.owner_name as sdr_name,
            c.owner_email as sdr_email,
            c.closer_name as closer_name
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{conversations_ai.summary}}', '')) != ''
          AND TRIM(COALESCE(w.payload->'customData'->>'{{conversations_ai.summary}}', '')) != 'undefined'
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY c.id, w.created_at DESC
    ),
    todas_comunicacoes AS (
        SELECT * FROM mensagens
        UNION ALL
        SELECT * FROM ligacoes
        UNION ALL
        SELECT * FROM ai_conversations
    ),
    inseridos_comunicacoes AS (
        INSERT INTO comunicacoes (
            contato_id, tipo,
            mensagem_body, mensagem_subject, mensagem_attachments,
            ai_summary, ai_transcript,
            phone_call_from, phone_call_to, phone_call_duration,
            phone_call_from_city, phone_call_from_state,
            phone_call_answered_by_phone, phone_call_answered_by_name,
            phone_call_start_time, phone_call_end_time,
            phone_call_status, phone_call_dispositions,
            contato_nome, contato_email, contato_telefone,
            sdr_name, sdr_email, closer_name
        )
        SELECT
            contato_id, tipo,
            mensagem_body, mensagem_subject, mensagem_attachments,
            ai_summary, ai_transcript,
            phone_call_from, phone_call_to, phone_call_duration,
            phone_call_from_city, phone_call_from_state,
            phone_call_answered_by_phone, phone_call_answered_by_name,
            phone_call_start_time, phone_call_end_time,
            phone_call_status, phone_call_dispositions,
            contato_nome, contato_email, contato_telefone,
            sdr_name, sdr_email, closer_name
        FROM todas_comunicacoes
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_comunicacoes_inseridas FROM inseridos_comunicacoes;

    RETURN QUERY SELECT v_contatos_inseridos, v_contatos_atualizados, v_oportunidades_inseridas, v_oportunidades_atualizadas, v_vendas_inseridas, v_comunicacoes_inseridas, v_reunioes_inseridas;
END;
$function$;

COMMENT ON FUNCTION extrair_dados_ghl IS
'Extrai dados de webhooks GHL para tabelas estruturadas.
PASSO 1: Extrai Contatos (owner_name/owner_email de customData->>"Owner (SDR ou SS)")
PASSO 2: Extrai Oportunidades com parse_safe_date() para datas
PASSO 2.5: Atualiza closer_name no contatos — ORDER BY o.id DESC (created_at foi dropado em 20260226210001)
PASSO 3: Extrai Vendas Fechamento — guard relaxado: dispara quando QUALQUER campo de
         faturamento estiver presente (data_pagamento_entrada, valor_entrada,
         numero_parcelas ou valor_parcela).
PASSO 4: Extrai Comunicações (usando colunas desnormalizadas do contatos)';

-- C. Backfill: processar webhook de Eduardo Sampaio (2026-03-11 14:55 SP)
-- Chegou antes do trigger existir → vendas_fechamento ficou com parcelas=0
-- Esperado: numero_parcelas=1, valor_parcela=32500
DO $$
DECLARE
  result RECORD;
BEGIN
  SELECT * INTO result
  FROM extrair_dados_ghl('65c62932-62b4-4801-9883-1cad6b4c5f6b'::uuid);

  RAISE NOTICE 'Eduardo backfill: contatos_ins=%, contatos_upd=%, opps_ins=%, opps_upd=%, vendas=%',
    result.contatos_inseridos,
    result.contatos_atualizados,
    result.oportunidades_inseridas,
    result.oportunidades_atualizadas,
    result.vendas_inseridas;
END;
$$;
