-- ============================================================
-- Fix: UPDATE de oportunidades existentes faltava datas críticas
--
-- Problema identificado:
--   A função extrair_dados_ghl() ao atualizar oportunidades existentes
--   incluía algumas datas de pipeline (data_conectado, data_fechado, etc)
--   mas faltavam outras igualmente importantes:
--
--   FALTANDO NO UPDATE (mas presentes no INSERT):
--   - data_tentativa_1..8    (tentativas de contato)
--   - data_no_show           (pré-venda)
--   - data_qualificado       (pré-venda)
--   - data_reuniao_agendada  (data_da_reunio)
--   - data_reuniao_realizada (reuniao_realizada)
--   - data_pendencias_preenchimento (pré-venda)
--   - data_ultima_atividade  (informativo)
--
-- Impacto:
--   Se um webhook chega para uma oportunidade já existente com esses campos
--   preenchidos no customData, eles nunca são capturados. Ex:
--   - SDR registra tentativa 4 (mqlcontato4) → NULL no banco
--   - Lead vai para no-show (mqlno_show) → NULL
--   - Lead é qualificado (mqlqualificado) → NULL
--
-- Solução:
--   Adicionar essas datas ao UPDATE com COALESCE (não sobrescreve se já tem)
-- ============================================================

CREATE OR REPLACE FUNCTION public.extrair_dados_ghl(p_webhook_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
    contatos_inseridos integer,
    contatos_atualizados integer,
    oportunidades_inseridas integer,
    oportunidades_atualizadas integer,
    vendas_inseridas integer,
    comunicacoes_inseridas integer,
    reunioes_inseridas integer
)
LANGUAGE plpgsql AS $function$
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
    -- PASSO 1: Extrair Contatos (INSERT)
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

    -- UPDATE contatos — UTM sempre sobrescrito com valor do webhook
    -- O webhook sempre envia o utm_source correto. Não usar COALESCE com c.utm_source.
    WITH atualizados AS (
        UPDATE contatos c
        SET
            nome     = COALESCE(NULLIF(TRIM(w.payload->>'full_name'), ''), c.nome),
            email    = COALESCE(NULLIF(LOWER(TRIM(w.payload->>'email')), ''), c.email),
            telefone = COALESCE(NULLIF(TRIM(w.payload->>'phone'), ''), c.telefone),
            -- UTM: sempre sobrescreve com valor do webhook (webhook é a fonte de verdade)
            utm_source   = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_source'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmSource'), '')
            ),
            utm_medium   = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_medium'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmMedium'), '')
            ),
            utm_campaign = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_campaign'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'campaign'), '')
            ),
            utm_term     = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_term'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmTerm'), '')
            ),
            utm_content  = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_content'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmContent'), '')
            ),
            owner_name  = COALESCE(NULLIF(TRIM(w.payload->>'owner'), ''), c.owner_name),
            owner_email = COALESCE(NULLIF(TRIM(w.payload->>'E-mail Owner'), ''), c.owner_email),
            updated_at  = NOW()
        FROM webhooks_ghl w
        WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- ============================================
    -- PASSO 2: Extrair Oportunidades
    -- ============================================

    WITH novas_oportunidades AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id') as opp_id,
            c.id as contato_id,
            TRIM(w.payload->>'full_name') as nome_contato,
            LOWER(TRIM(w.payload->>'email')) as email_contato,
            TRIM(w.payload->>'opportunity_name') as titulo,
            COALESCE((w.payload->>'lead_value')::DECIMAL, 0) as valor,
            COALESCE(TRIM(w.payload->>'status'), 'open') as status,
            TRIM(w.payload->>'pipeline_id') as pipeline_id,
            TRIM(w.payload->>'pipleline_stage') as pipeline_stage_id,
            TRIM(w.payload->>'pipeline_name') as pipeline_name,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.source }}', '{{opportunity.source}}'
            ]) as opportunity_source,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}'
            ]) as vendedor_closer,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}'
            ]) as lost_reason,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}'
            ]) as resumo_ia,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}'
            ]) as percepcao_closer,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}'
            ]) as data_ultima_atividade,
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlleads_recebidos }}', '{{opportunity.mqlleads_recebidos}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlleads_recebidos }}', '{{opportunity.d_mqlleads_recebidos}}'])),
                (w.payload->>'date_created')::TIMESTAMPTZ
            ) as data_lead_recebido,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}']))) as data_tentativa_1,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}']))) as data_tentativa_2,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}']))) as data_tentativa_3,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}']))) as data_tentativa_4,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}']))) as data_tentativa_5,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}']))) as data_tentativa_6,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}']))) as data_tentativa_7,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}']))) as data_tentativa_8,
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}', '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))
            ) as data_no_show,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}']))) as data_conectado,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}']))) as data_perdido,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}']))) as data_qualificado,
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlreunio_marcada }}', '{{opportunity.mqlreunio_marcada}}', '{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlreunio_marcada }}', '{{opportunity.d_mqlreunio_marcada}}']))
            ) as data_agendamento_reuniao,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))) as data_pendencias_preenchimento,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))) as data_no_show_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))) as data_perdido_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_agendada }}', '{{opportunity.d_sqlreunio_agendada}}']))) as data_agendamento_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))) as data_realizacao_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))) as data_negociacao,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))) as data_fechado,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_data_da_reunio }}', '{{opportunity.d_data_da_reunio}}']))) as data_reuniao_agendada,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))) as data_reuniao_realizada,
            (w.payload->>'date_created')::TIMESTAMPTZ as data_criacao_contato
        FROM webhooks_ghl w
        INNER JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (
              SELECT 1 FROM oportunidades o
              WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          )
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    )
    INSERT INTO oportunidades (
        ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo,
        valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
        opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
        data_ultima_atividade,
        data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
        data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
        data_tentativa_8, data_no_show, data_conectado, data_perdido,
        data_qualificado, data_agendamento_reuniao, data_pendencias_preenchimento,
        data_no_show_vendas, data_perdido_vendas, data_agendamento_vendas,
        data_realizacao_vendas, data_negociacao, data_fechado,
        data_reuniao_agendada, data_reuniao_realizada, data_criacao_contato
    )
    SELECT * FROM novas_oportunidades
    ON CONFLICT (ghl_opportunity_id) DO NOTHING
    RETURNING 1;

    GET DIAGNOSTICS v_oportunidades_inseridas = ROW_COUNT;

    -- Atualizar oportunidades existentes (com COALESCE para não sobrescrever datas)
    -- ✅ NOVA FIX: Agora inclui TODAS as datas (data_tentativa_*, data_no_show, etc)
    WITH atualizados AS (
        UPDATE oportunidades o
        SET
            nome_contato       = COALESCE(NULLIF(TRIM(w.payload->>'full_name'), ''), o.nome_contato),
            email_contato      = COALESCE(NULLIF(LOWER(TRIM(w.payload->>'email')), ''), o.email_contato),
            titulo             = COALESCE(NULLIF(TRIM(w.payload->>'opportunity_name'), ''), o.titulo),
            valor              = COALESCE((w.payload->>'lead_value')::DECIMAL, o.valor),
            status             = COALESCE(NULLIF(TRIM(w.payload->>'status'), ''), o.status),
            pipeline_id        = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_id'), ''), o.pipeline_id),
            pipeline_stage_id  = COALESCE(NULLIF(TRIM(w.payload->>'pipleline_stage'), ''), o.pipeline_stage_id),
            pipeline_name      = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_name'), ''), o.pipeline_name),
            opportunity_source = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.source }}', '{{opportunity.source}}']),
                o.opportunity_source
            ),
            vendedor_closer    = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}']),
                o.vendedor_closer
            ),
            lost_reason        = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}']),
                o.lost_reason
            ),
            resumo_ia          = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}']),
                o.resumo_ia
            ),
            percepcao_closer   = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}']),
                o.percepcao_closer
            ),
            data_ultima_atividade = COALESCE(
                extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}']),
                o.data_ultima_atividade
            ),
            -- Datas: atualiza só se estava NULL
            data_tentativa_1         = COALESCE(o.data_tentativa_1,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}', '{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}']))),
            data_tentativa_2         = COALESCE(o.data_tentativa_2,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}', '{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}']))),
            data_tentativa_3         = COALESCE(o.data_tentativa_3,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}', '{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}']))),
            data_tentativa_4         = COALESCE(o.data_tentativa_4,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}', '{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}']))),
            data_tentativa_5         = COALESCE(o.data_tentativa_5,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}', '{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}']))),
            data_tentativa_6         = COALESCE(o.data_tentativa_6,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}', '{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}']))),
            data_tentativa_7         = COALESCE(o.data_tentativa_7,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}', '{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}']))),
            data_tentativa_8         = COALESCE(o.data_tentativa_8,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}', '{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}']))),
            data_no_show             = COALESCE(o.data_no_show,             parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}', '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}', '{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_conectado           = COALESCE(o.data_conectado,           parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}', '{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}']))),
            data_perdido             = COALESCE(o.data_perdido,             parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}', '{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}']))),
            data_qualificado         = COALESCE(o.data_qualificado,         parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}', '{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}']))),
            data_agendamento_reuniao = COALESCE(o.data_agendamento_reuniao, parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlreunio_marcada }}', '{{opportunity.mqlreunio_marcada}}', '{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.d_mqlreunio_marcada }}', '{{opportunity.d_mqlreunio_marcada}}']))),
            data_pendencias_preenchimento = COALESCE(o.data_pendencias_preenchimento, parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}', '{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))),
            data_no_show_vendas      = COALESCE(o.data_no_show_vendas,      parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_perdido_vendas      = COALESCE(o.data_perdido_vendas,      parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}', '{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))),
            data_agendamento_vendas  = COALESCE(o.data_agendamento_vendas,  parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_agendada }}', '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.d_sqlreunio_agendada }}', '{{opportunity.d_sqlreunio_agendada}}']))),
            data_realizacao_vendas   = COALESCE(o.data_realizacao_vendas,   parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}', '{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))),
            data_negociacao          = COALESCE(o.data_negociacao,          parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}', '{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))),
            data_fechado             = COALESCE(o.data_fechado,             parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}', '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))),
            data_reuniao_agendada    = COALESCE(o.data_reuniao_agendada,    parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}', '{{ opportunity.d_data_da_reunio }}', '{{opportunity.d_data_da_reunio}}']))),
            data_reuniao_realizada   = COALESCE(o.data_reuniao_realizada,   parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}', '{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))),
            updated_at = NOW()
        FROM webhooks_ghl w
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

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
