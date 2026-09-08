-- Atualiza extrair_dados_ghl para extrair campos faltantes em oportunidades
-- Problema: PASSO 2 só extraia 9 colunas. As colunas pipeline_name, vendedor_closer,
--           datas MQL/SQL e outros campos de customData nunca eram preenchidas.
-- PASSOs 1, 3 e 4 mantidos idênticos ao original.

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
    -- ============================================
    -- PASSO 1: Extrair Contatos (inalterado)
    -- ============================================

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
            (w.payload->>'date_created')::TIMESTAMPTZ,
            TRIM(w.payload->>'contact_type'),
            TRIM(w.payload->>'contact_source'),
            TRIM(w.payload->>'pipeline_id'),
            TRIM(w.payload->>'pipeline_name'),
            TRIM(w.payload->>'Owner ID'),
            TRIM(w.payload->>'owner'),
            TRIM(w.payload->>'E-mail Owner')
        FROM webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (
              SELECT 1 FROM contatos c
              WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
          )
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
            updated_at = NOW()
        FROM webhooks_ghl w
        WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- ============================================
    -- PASSO 2: Extrair Oportunidades (ATUALIZADO)
    -- Agora inclui pipeline_name, vendedor_closer, lost_reason,
    -- resumo_ia, percepcao_closer, data_ultima_atividade,
    -- e todas as datas MQL/SQL/reuniao de customData.
    -- ============================================

    WITH novas_oportunidades AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id') as opp_id,
            c.id as contato_id,
            TRIM(w.payload->>'full_name') as nome_contato,
            LOWER(TRIM(w.payload->>'email')) as email_contato,
            TRIM(w.payload->>'opportunity_name') as titulo,
            COALESCE((w.payload->>'lead_value')::DECIMAL, 0) as valor,
            COALESCE(NULLIF(TRIM(w.payload->>'status'), ''), 'open') as status,
            TRIM(w.payload->>'pipeline_id') as pipeline_id,
            TRIM(w.payload->>'pipleline_stage') as pipeline_stage_id,
            -- Campos novos: diretos do payload
            NULLIF(TRIM(w.payload->>'pipeline_name'), '') as pipeline_name,
            -- Campos novos: de customData
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.source }}'), '') as opportunity_source,
            NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.assignedToUsersName}}'), '') as vendedor_closer,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.lost_reason }}'), '') as lost_reason,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.resumo_ia }}'), '') as resumo_ia,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.percepo_do_closer }}{{ opportunity.percepo_do_closer }}'), '') as percepcao_closer,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.ltima_atividade }}'), '') as data_ultima_atividade,
            -- Datas MQL
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'), '')::DATE::TIMESTAMPTZ as data_mql_lead_recebido,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato1 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_1,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato2 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_2,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato3 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_3,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato4 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_4,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato5 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_5,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato6 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_6,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato7 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_7,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato8 }}'), '')::DATE::TIMESTAMPTZ as data_mql_contato_8,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlno_show }}'), '')::DATE::TIMESTAMPTZ as data_mql_no_show,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlconectado }}'), '')::DATE::TIMESTAMPTZ as data_mql_conectado,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlperdido }}'), '')::DATE::TIMESTAMPTZ as data_mql_perdido,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlqualificado }}'), '')::DATE::TIMESTAMPTZ as data_mql_qualificado,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlreunio_marcada }}'), '')::DATE::TIMESTAMPTZ as data_mql_reuniao_marcada,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d__sqlpendencias_preenchimento }}'), '')::DATE::TIMESTAMPTZ as data_pendencias_preenchimento,
            -- Datas SQL
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlno_show }}'), '')::DATE::TIMESTAMPTZ as data_sql_no_show,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlperdida }}'), '')::DATE::TIMESTAMPTZ as data_sql_perdido,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_agendada }}'), '')::DATE::TIMESTAMPTZ as data_sql_reuniao_agendada,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_realizada }}'), '')::DATE::TIMESTAMPTZ as data_sql_reuniao_realizada,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlnegociao }}'), '')::DATE::TIMESTAMPTZ as data_sql_negociacao,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlfechada }}'), '')::DATE::TIMESTAMPTZ as data_sql_fechada,
            -- Datas de reunião
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio }}'), '')::DATE::TIMESTAMPTZ as data_reuniao_agendada,
            NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio_realizada }}'), '')::DATE::TIMESTAMPTZ as data_reuniao_realizada
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (
              SELECT 1 FROM oportunidades o
              WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          )
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    inseridos_opp AS (
        INSERT INTO oportunidades (
            ghl_opportunity_id, contato_id, nome_contato, email_contato,
            titulo, valor, status, pipeline_id, pipeline_stage_id,
            pipeline_name, opportunity_source, vendedor_closer, lost_reason,
            resumo_ia, percepcao_closer, data_ultima_atividade,
            data_mql_lead_recebido,
            data_mql_contato_1, data_mql_contato_2, data_mql_contato_3,
            data_mql_contato_4, data_mql_contato_5, data_mql_contato_6,
            data_mql_contato_7, data_mql_contato_8,
            data_mql_no_show, data_mql_conectado, data_mql_perdido,
            data_mql_qualificado, data_mql_reuniao_marcada,
            data_pendencias_preenchimento,
            data_sql_no_show, data_sql_perdido, data_sql_reuniao_agendada,
            data_sql_reuniao_realizada, data_sql_negociacao, data_sql_fechada,
            data_reuniao_agendada, data_reuniao_realizada
        )
        SELECT
            opp_id, contato_id, nome_contato, email_contato,
            titulo, valor, status, pipeline_id, pipeline_stage_id,
            pipeline_name, opportunity_source, vendedor_closer, lost_reason,
            resumo_ia, percepcao_closer, data_ultima_atividade,
            data_mql_lead_recebido,
            data_mql_contato_1, data_mql_contato_2, data_mql_contato_3,
            data_mql_contato_4, data_mql_contato_5, data_mql_contato_6,
            data_mql_contato_7, data_mql_contato_8,
            data_mql_no_show, data_mql_conectado, data_mql_perdido,
            data_mql_qualificado, data_mql_reuniao_marcada,
            data_pendencias_preenchimento,
            data_sql_no_show, data_sql_perdido, data_sql_reuniao_agendada,
            data_sql_reuniao_realizada, data_sql_negociacao, data_sql_fechada,
            data_reuniao_agendada, data_reuniao_realizada
        FROM novas_oportunidades
        ON CONFLICT (ghl_opportunity_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_inseridas FROM inseridos_opp;

    WITH atualizados_opp AS (
        UPDATE oportunidades o
        SET
            nome_contato              = TRIM(w.payload->>'full_name'),
            email_contato             = LOWER(TRIM(w.payload->>'email')),
            titulo                    = TRIM(w.payload->>'opportunity_name'),
            valor                     = COALESCE((w.payload->>'lead_value')::DECIMAL, 0),
            status                    = COALESCE(NULLIF(TRIM(w.payload->>'status'), ''), 'open'),
            pipeline_id               = TRIM(w.payload->>'pipeline_id'),
            pipeline_stage_id         = TRIM(w.payload->>'pipleline_stage'),
            -- Campos novos
            pipeline_name             = NULLIF(TRIM(w.payload->>'pipeline_name'), ''),
            opportunity_source        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.source }}'), ''),
            vendedor_closer           = NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.assignedToUsersName}}'), ''),
            lost_reason               = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.lost_reason }}'), ''),
            resumo_ia                 = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.resumo_ia }}'), ''),
            percepcao_closer          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.percepo_do_closer }}{{ opportunity.percepo_do_closer }}'), ''),
            data_ultima_atividade     = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.ltima_atividade }}'), ''),
            -- Datas MQL
            data_mql_lead_recebido    = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_1        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato1 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_2        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato2 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_3        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato3 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_4        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato4 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_5        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato5 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_6        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato6 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_7        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato7 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_contato_8        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlcontato8 }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_no_show          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlno_show }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_conectado        = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlconectado }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_perdido          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlperdido }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_qualificado      = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlqualificado }}'), '')::DATE::TIMESTAMPTZ,
            data_mql_reuniao_marcada  = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_mqlreunio_marcada }}'), '')::DATE::TIMESTAMPTZ,
            data_pendencias_preenchimento = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d__sqlpendencias_preenchimento }}'), '')::DATE::TIMESTAMPTZ,
            -- Datas SQL
            data_sql_no_show          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlno_show }}'), '')::DATE::TIMESTAMPTZ,
            data_sql_perdido          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlperdida }}'), '')::DATE::TIMESTAMPTZ,
            data_sql_reuniao_agendada = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_agendada }}'), '')::DATE::TIMESTAMPTZ,
            data_sql_reuniao_realizada= NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlreunio_realizada }}'), '')::DATE::TIMESTAMPTZ,
            data_sql_negociacao       = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlnegociao }}'), '')::DATE::TIMESTAMPTZ,
            data_sql_fechada          = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.d_sqlfechada }}'), '')::DATE::TIMESTAMPTZ,
            -- Datas de reunião
            data_reuniao_agendada     = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio }}'), '')::DATE::TIMESTAMPTZ,
            data_reuniao_realizada    = NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_da_reunio_realizada }}'), '')::DATE::TIMESTAMPTZ,
            updated_at = NOW()
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados_opp;

    -- ============================================
    -- PASSO 3: Extrair Vendas Fechamento (inalterado)
    -- ============================================

    WITH vendas_para_inserir AS (
        SELECT DISTINCT ON (o.id)
            o.id as oportunidade_id,
            c.id as contato_id,
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
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}', '')) != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY o.id, w.created_at DESC
    ),
    inseridos_vendas AS (
        INSERT INTO vendas_fechamento (
            oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante,
            logradouro_rua_avenida, numero_endereco, complemento_endereco,
            bairro, municipio, estado_uf, cep,
            produto_vendido, observacoes_venda, forma_pagamento,
            valor_entrada, numero_parcelas, valor_parcela, data_pagamento_entrada
        )
        SELECT
            oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante,
            logradouro_rua_avenida, numero_endereco, complemento_endereco,
            bairro, municipio, estado_uf, cep,
            produto_vendido, observacoes_venda, forma_pagamento,
            COALESCE(valor_entrada, 0), COALESCE(numero_parcelas, 0), COALESCE(valor_parcela, 0), data_pagamento_entrada
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

    -- ============================================
    -- PASSO 4: Extrair Comunicações (inalterado)
    -- ============================================

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
            NULL::TEXT as phone_call_dispositions
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{message.body}}', '')) != ''
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
            TRIM(w.payload->'customData'->>'{{phoneCall.dispositions}}') as phone_call_dispositions
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{phoneCall.duration}}', '')) != ''
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
            NULL::TEXT as phone_call_dispositions
        FROM webhooks_ghl w
        JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE TRIM(COALESCE(w.payload->'customData'->>'{{conversations_ai.summary}}', '')) != ''
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
            phone_call_status, phone_call_dispositions
        )
        SELECT
            contato_id, tipo,
            mensagem_body, mensagem_subject, mensagem_attachments,
            ai_summary, ai_transcript,
            phone_call_from, phone_call_to, phone_call_duration,
            phone_call_from_city, phone_call_from_state,
            phone_call_answered_by_phone, phone_call_answered_by_name,
            phone_call_start_time, phone_call_end_time,
            phone_call_status, phone_call_dispositions
        FROM todas_comunicacoes
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_comunicacoes_inseridas FROM inseridos_comunicacoes;

    RETURN QUERY SELECT
        v_contatos_inseridos,
        v_contatos_atualizados,
        v_oportunidades_inseridas,
        v_oportunidades_atualizadas,
        v_vendas_inseridas,
        v_comunicacoes_inseridas,
        v_reunioes_inseridas;
END;
$function$;
