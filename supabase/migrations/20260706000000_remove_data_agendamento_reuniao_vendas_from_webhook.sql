-- ============================================================
-- Migration: 20260706000000
-- Remove data_agendamento_reuniao e data_agendamento_vendas da função
-- extrair_dados_ghl — mesmo bug que data_reuniao_agendada tinha (corrigido
-- em 20260326110000), nunca replicado pra esses dois campos irmãos.
--
-- MOTIVO (achado por auditoria real, 2026-07-06):
--   Usuário reportou que adicionar uma tag manualmente em leads no GHL
--   mudou o "número de agendamentos nos últimos 7 dias" no dashboard.
--   Investigação encontrou que data_agendamento_reuniao (usada nesse KPI
--   em GeralTab/AquisicaoPage/useProdutividadeMatrix) é sobrescrita SEM
--   NENHUMA guarda a cada webhook — se o payload não trouxer o customData
--   esperado (mqlreunio_marcada/sqlreunio_agendada), o valor correto
--   gravado por uma sincronização anterior é apagado ou substituído por
--   um snapshot desatualizado.
--
--   Query real em produção (últimos 90 dias, 2026-07-06):
--     - 44 opps só com data_agendamento_reuniao (API nunca confirmou)
--     - 42 opps só com data_reuniao_agendada (API confirma, webhook nunca preencheu)
--     - 205 opps com AMBOS os campos preenchidos só que DIVERGENTES
--     - 20 opps com os dois campos batendo
--   Ou seja: de 271 oportunidades com algum sinal de agendamento, só 20
--   tinham as duas fontes concordando. O campo webhook-driven está errado
--   na maioria dos casos.
--
-- SOLUÇÃO (aprovada pelo usuário): em vez de um trigger novo baseado em
-- tag (que só corrigiria leads tageados manualmente), a fonte de verdade
-- que JÁ FUNCIONA BEM (edge function sync-appointment-dates, cron a cada
-- 5 min, sempre reconfirma com a API GHL) passa a escrever também em
-- data_agendamento_reuniao e data_agendamento_vendas — os 3 campos ficam
-- sempre o mesmo valor, sempre confiável, pra qualquer lead, automaticamente.
--
-- MUDANÇAS NA FUNÇÃO:
--   1. INSERT novas_oportunidades: remove data_agendamento_reuniao e
--      data_agendamento_vendas do SELECT e do INSERT (ficam NULL até o
--      próximo ciclo do sync-appointment-dates, igual já acontece com
--      data_reuniao_agendada pra leads novos)
--   2. UPDATE oportunidades: remove os dois campos do SET
--
-- Padrão idêntico ao aplicado em 20260326110000 pra data_reuniao_agendada.
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

    -- UPDATE contatos — webhook é fonte de verdade para campos de atribuição
    WITH ultimos_webhooks AS (
        SELECT DISTINCT ON (TRIM(payload->>'contact_id'))
            id,
            payload,
            TRIM(payload->>'contact_id') as ghl_id
        FROM webhooks_ghl
        WHERE payload->>'contact_id' IS NOT NULL
          AND TRIM(payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR id = p_webhook_id)
        ORDER BY TRIM(payload->>'contact_id'), created_at DESC
    ),
    atualizados AS (
        UPDATE contatos c
        SET
            nome     = NULLIF(TRIM(w.payload->>'full_name'), ''),
            email    = NULLIF(LOWER(TRIM(w.payload->>'email')), ''),
            telefone = NULLIF(TRIM(w.payload->>'phone'), ''),
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
            owner_name  = NULLIF(TRIM(w.payload->>'owner'), ''),
            owner_email = NULLIF(TRIM(w.payload->>'E-mail Owner'), ''),
            updated_at  = NOW()
        FROM ultimos_webhooks w
        WHERE c.ghl_id = w.ghl_id
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
            parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}'
            ])) as data_ultima_atividade,
            NULL::TIMESTAMPTZ as data_lead_recebido,
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
            -- data_agendamento_reuniao: NÃO extraída do webhook — fonte de verdade
            -- é a API GHL via sync-appointment-dates. Ver migration 20260706000000.
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))) as data_pendencias_preenchimento,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))) as data_no_show_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))) as data_perdido_vendas,
            -- data_agendamento_vendas: idem — NÃO extraída do webhook.
            -- data_realizacao_vendas: prioridade 1=data_da_reunio_realizada, 2=sqlreunio_realizada, 3=d_sqlreunio_realizada
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))
            ) as data_realizacao_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))) as data_negociacao,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))) as data_fechado,
            -- data_reuniao_agendada: NÃO extraída do webhook (desde 20260326110000)
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))) as data_reuniao_realizada,
            -- data_auto_agendamento — lead agendou sozinho com SDR (campo mqlauto_agendamento)
            parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.mqlauto_agendamento }}', '{{opportunity.mqlauto_agendamento}}'
            ])) as data_auto_agendamento,
            (w.payload->>'date_created')::TIMESTAMPTZ as data_criacao_contato,
            extract_ghl_tags(w.payload->'tags') as tags_contato
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
    ),
    opp_inseridas AS (
        INSERT INTO oportunidades (
            ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
            -- data_agendamento_reuniao, data_agendamento_vendas, data_reuniao_agendada
            -- omitidos: preenchidos pelo sync-appointment-dates
        )
        SELECT opp_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
        FROM novas_oportunidades
        ON CONFLICT (ghl_opportunity_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_inseridas FROM opp_inseridas;

    -- UPDATE oportunidades — webhook é fonte de verdade para a maioria dos campos
    -- EXCEÇÕES que preservam valor anterior com COALESCE:
    --   pipeline_id / pipeline_name: webhooks de atualização de data não incluem esses
    --     campos → NULLIF aqui zeraria o pipeline de leads que movimentam de stage
    --   data_lead_recebido: gerenciada exclusivamente por sync-opp-dates (edge function)
    --   sdr_name: gerenciada exclusivamente por sync-opp-sdr (edge function + followers API)
    --   data_reuniao_agendada, data_agendamento_reuniao, data_agendamento_vendas:
    --     gerenciadas exclusivamente por sync-appointment-dates (edge function) —
    --     ver migration 20260706000000. Sem essa exclusão, um webhook sem o
    --     customData esperado apagava/desatualizava esses campos silenciosamente.
    WITH ultimos_webhooks_opp AS (
        SELECT DISTINCT ON (TRIM(payload->>'id'))
            id,
            payload,
            TRIM(payload->>'id') as ghl_opportunity_id
        FROM webhooks_ghl
        WHERE payload->>'id' IS NOT NULL
          AND TRIM(payload->>'id') != ''
          AND (p_webhook_id IS NULL OR id = p_webhook_id)
        ORDER BY TRIM(payload->>'id'), created_at DESC
    ),
    atualizados AS (
        UPDATE oportunidades o
        SET
            nome_contato       = NULLIF(TRIM(w.payload->>'full_name'), ''),
            email_contato      = NULLIF(LOWER(TRIM(w.payload->>'email')), ''),
            titulo             = NULLIF(TRIM(w.payload->>'opportunity_name'), ''),
            valor              = (w.payload->>'lead_value')::DECIMAL,
            status             = NULLIF(TRIM(w.payload->>'status'), ''),
            -- COALESCE aqui: webhook de "data alterada" não traz pipeline_id
            -- Se vier NULL/vazio, mantém o valor já gravado
            pipeline_id        = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_id'), ''), o.pipeline_id),
            pipeline_stage_id  = NULLIF(TRIM(w.payload->>'pipleline_stage'), ''),
            pipeline_name      = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_name'), ''), o.pipeline_name),
            opportunity_source = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.source }}', '{{opportunity.source}}']),
            vendedor_closer    = extract_custom_field(w.payload->'customData', ARRAY['{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}']),
            lost_reason        = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}']),
            resumo_ia          = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}']),
            percepcao_closer   = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}']),
            data_ultima_atividade = parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}'])),
            data_tentativa_1         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}']))),
            data_tentativa_2         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}']))),
            data_tentativa_3         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}']))),
            data_tentativa_4         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}']))),
            data_tentativa_5         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}']))),
            data_tentativa_6         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}']))),
            data_tentativa_7         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}']))),
            data_tentativa_8         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}']))),
            data_no_show             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}', '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_conectado           = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}']))),
            data_perdido             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}']))),
            data_qualificado         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}']))),
            -- data_agendamento_reuniao: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            data_pendencias_preenchimento = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))),
            data_no_show_vendas      = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_perdido_vendas      = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))),
            -- data_agendamento_vendas: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            -- data_realizacao_vendas: prioridade 1=data_da_reunio_realizada, 2=sqlreunio_realizada, 3=d_sqlreunio_realizada
            data_realizacao_vendas   = COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))
            ),
            data_negociacao          = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))),
            data_fechado             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))),
            -- data_reuniao_agendada: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            data_reuniao_realizada   = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))),
            -- data_auto_agendamento — lead agendou sozinho com SDR
            data_auto_agendamento    = parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlauto_agendamento }}', '{{opportunity.mqlauto_agendamento}}'])),
            updated_at = NOW()
        FROM ultimos_webhooks_opp w
        WHERE o.ghl_opportunity_id = w.ghl_opportunity_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

    -- ============================================
    -- PASSO 2.6: Enfileirar job de followers para opp(s) deste webhook
    -- ============================================
    -- Só executa para webhooks específicos (p_webhook_id IS NOT NULL).
    -- Quando chamada sem webhook_id (backfill bulk), o cron sync-opp-sdr
    -- cuida do reprocessamento de opps com sdr_name IS NULL.
    --
    -- Prioridade 1 = urgente: o follower mudou em tempo real.
    -- Idempotência: 'sync-opp-sdr:<opp.id>' — se já existe job pending/processing,
    -- a inserção é ignorada silenciosamente (ON CONFLICT DO NOTHING).
    IF p_webhook_id IS NOT NULL THEN
        PERFORM enqueue_ghl_api_job(
            p_url             => 'https://services.leadconnectorhq.com/opportunities/' || o.ghl_opportunity_id || '/followers',
            p_method          => 'GET',
            p_body            => NULL,
            p_priority        => 1,
            p_caller          => 'sync-opp-sdr',
            p_idempotency_key => 'sync-opp-sdr:' || o.id::text,
            p_context         => jsonb_build_object(
                'opportunity_id',     o.id::text,
                'ghl_opportunity_id', o.ghl_opportunity_id,
                'contato_id',         o.contato_id::text
            ),
            p_max_attempts    => 4
        )
        FROM oportunidades o
        INNER JOIN webhooks_ghl w ON w.id = p_webhook_id
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          AND TRIM(w.payload->>'id') IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND o.ghl_opportunity_id IS NOT NULL;
    END IF;

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
