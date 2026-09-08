-- ============================================================
-- Migration: 20260907000000
-- FIX — extrair_dados_ghl_v2 perdia contatos SEM NOME no GHL
-- (full_name vazio), restaurando o comportamento da v1.
--
-- Contexto (mesmo incidente 2026-07-14/15): após o fix de location
-- aninhado (20260906000000), restaram 8 eventos da quarentena
-- falhando com "nome NULL em contatos". Inspeção: todos são
-- eventos de workflow com full_name = "" (contatos reais, com
-- email/telefone/tags, mas sem nome cadastrado no GHL).
--
-- A v1 contava esses leads: TRIM(payload->>'full_name') = '' e
-- string vazia passa no NOT NULL. A v2 (mapping-based) devolve
-- NULL para campo vazio → violação de NOT NULL → evento perdido.
-- Ou seja, contatos sem nome deixaram de ser contados na v2.
--
-- Fix (4 pontos, nenhuma outra linha alterada):
--   PASSO 1  (INSERT contatos):       nome com fallback
--             full_name → email → phone → 'Sem nome'
--   PASSO 1b (UPDATE contatos):       nome só atualiza se o webhook
--             trouxer nome; senão preserva o existente
--   PASSO 2  (INSERT oportunidades):  mesmo fallback do PASSO 1
--             (nome_contato também é NOT NULL)
--   PASSO 2b (UPDATE oportunidades):  preserva o existente
-- Base: corpo de 20260906000000, byte a byte fora os 4 pontos.
-- ============================================================
SET search_path = public, pg_catalog;

CREATE OR REPLACE FUNCTION public.extrair_dados_ghl_v2(p_webhook_id uuid DEFAULT NULL::uuid)
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
    WITH webhooks AS (
        SELECT
            w.id,
            w.payload,
            w.created_at,
            public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)),
                w.payload
            ) AS mapped
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
    ),
    inseridos AS (
        INSERT INTO public.contatos (
            workspace_id, ghl_id, nome, email, telefone, primeiro_nome, ultimo_nome,
            ip, url, fbclid, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, tt_term, tt_medium, tt_source, tt_content,
            country, date_created, contact_type, contact_source,
            pipeline_id_contato, pipeline_name, owner_id, owner_name, owner_email,
            custom_fields
        )
        SELECT DISTINCT ON (TRIM(w.payload->>'contact_id'))
            w.workspace_id,
            TRIM(w.payload->>'contact_id'),
            COALESCE(NULLIF(w.mapped->>'full_name', ''), NULLIF(w.mapped->>'email', ''), NULLIF(w.mapped->>'phone', ''), 'Sem nome'),
            LOWER(w.mapped->>'email'),
            w.mapped->>'phone',
            w.mapped->>'first_name',
            w.mapped->>'last_name',
            w.mapped->>'ip',
            w.mapped->>'url',
            w.mapped->>'fbclid',
            w.mapped->>'utm_source',
            w.mapped->>'utm_medium',
            w.mapped->>'utm_campaign',
            w.mapped->>'utm_term',
            w.mapped->>'utm_content',
            w.mapped->>'tt_term',
            w.mapped->>'tt_medium',
            w.mapped->>'tt_source',
            w.mapped->>'tt_content',
            w.mapped->>'country',
            (w.payload->>'date_created')::TIMESTAMPTZ,
            w.mapped->>'contact_type',
            w.mapped->>'contact_source',
            w.mapped->>'pipeline_id_contato',
            w.mapped->>'pipeline_name_contato',
            w.mapped->>'owner_id',
            w.mapped->>'owner_name',
            w.mapped->>'owner_email',
            public.extract_ghl_extra_fields(w.mapped)
        FROM webhooks w
        WHERE NOT EXISTS (
            SELECT 1 FROM public.contatos c
            WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
        )
        ORDER BY TRIM(w.payload->>'contact_id'), w.created_at DESC
        ON CONFLICT (ghl_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_inseridos FROM inseridos;

    -- ============================================
    -- PASSO 1b: Atualizar Contatos (webhook = fonte de verdade para atribuicao)
    -- ============================================
    WITH ultimos_webhooks AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'contact_id'))
            w.id,
            w.payload,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)),
                w.payload
            ) AS mapped,
            TRIM(w.payload->>'contact_id') AS ghl_id
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY TRIM(w.payload->>'contact_id'), w.created_at DESC
    ),
    atualizados AS (
        UPDATE public.contatos c
        SET
            nome     = COALESCE(NULLIF(w.mapped->>'full_name', ''), c.nome),
            email    = LOWER(w.mapped->>'email'),
            telefone = w.mapped->>'phone',
            utm_source   = w.mapped->>'utm_source',
            utm_medium   = w.mapped->>'utm_medium',
            utm_campaign = w.mapped->>'utm_campaign',
            utm_term     = w.mapped->>'utm_term',
            utm_content  = w.mapped->>'utm_content',
            owner_name  = w.mapped->>'owner_name',
            owner_email = w.mapped->>'owner_email',
            custom_fields = public.extract_ghl_extra_fields(w.mapped),
            updated_at  = NOW()
        FROM ultimos_webhooks w
        WHERE c.ghl_id = w.ghl_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- ============================================
    -- PASSO 2: Extrair Oportunidades (INSERT)
    -- ============================================
    WITH webhooks AS (
        SELECT
            w.id,
            w.payload,
            w.created_at,
            public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)),
                w.payload
            ) AS mapped
        FROM public.webhooks_ghl w
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
    ),
    novas_oportunidades AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id') AS opp_id,
            c.id AS contato_id,
            COALESCE(NULLIF(w.mapped->>'full_name', ''), NULLIF(w.mapped->>'email', ''), NULLIF(w.mapped->>'phone', ''), 'Sem nome') AS nome_contato,
            LOWER(w.mapped->>'email') AS email_contato,
            w.mapped->>'opportunity_name' AS titulo,
            COALESCE((w.mapped->>'lead_value')::DECIMAL, 0) AS valor,
            COALESCE(w.mapped->>'status', 'open') AS status,
            w.mapped->>'pipeline_id_opp' AS pipeline_id,
            w.mapped->>'pipeline_stage_id' AS pipeline_stage_id,
            w.mapped->>'pipeline_name_opp' AS pipeline_name,
            w.mapped->>'opportunity_source' AS opportunity_source,
            w.mapped->>'vendedor_closer' AS vendedor_closer,
            w.mapped->>'lost_reason' AS lost_reason,
            w.mapped->>'resumo_ia' AS resumo_ia,
            w.mapped->>'percepcao_closer' AS percepcao_closer,
            parse_date_flexible(w.mapped->>'data_ultima_atividade') AS data_ultima_atividade,
            NULL::TIMESTAMPTZ AS data_lead_recebido,
            parse_date_flexible(w.mapped->>'data_tentativa_1') AS data_tentativa_1,
            parse_date_flexible(w.mapped->>'data_tentativa_2') AS data_tentativa_2,
            parse_date_flexible(w.mapped->>'data_tentativa_3') AS data_tentativa_3,
            parse_date_flexible(w.mapped->>'data_tentativa_4') AS data_tentativa_4,
            parse_date_flexible(w.mapped->>'data_tentativa_5') AS data_tentativa_5,
            parse_date_flexible(w.mapped->>'data_tentativa_6') AS data_tentativa_6,
            parse_date_flexible(w.mapped->>'data_tentativa_7') AS data_tentativa_7,
            parse_date_flexible(w.mapped->>'data_tentativa_8') AS data_tentativa_8,
            parse_date_flexible(w.mapped->>'data_no_show') AS data_no_show,
            parse_date_flexible(w.mapped->>'data_conectado') AS data_conectado,
            parse_date_flexible(w.mapped->>'data_perdido') AS data_perdido,
            parse_date_flexible(w.mapped->>'data_qualificado') AS data_qualificado,
            parse_date_flexible(w.mapped->>'data_pendencias_preenchimento') AS data_pendencias_preenchimento,
            parse_date_flexible(w.mapped->>'data_no_show_vendas') AS data_no_show_vendas,
            parse_date_flexible(w.mapped->>'data_perdido_vendas') AS data_perdido_vendas,
            parse_date_flexible(w.mapped->>'data_realizacao_vendas') AS data_realizacao_vendas,
            parse_date_flexible(w.mapped->>'data_negociacao') AS data_negociacao,
            parse_date_flexible(w.mapped->>'data_fechado') AS data_fechado,
            parse_date_flexible(w.mapped->>'data_reuniao_realizada') AS data_reuniao_realizada,
            parse_date_flexible(w.mapped->>'data_auto_agendamento') AS data_auto_agendamento,
            (w.payload->>'date_created')::TIMESTAMPTZ AS data_criacao_contato
        FROM webhooks w
        INNER JOIN public.contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE NOT EXISTS (
            SELECT 1 FROM public.oportunidades o
            WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
        )
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    opp_inseridas AS (
        INSERT INTO public.oportunidades (
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

    -- ============================================
    -- PASSO 2b: Atualizar Oportunidades
    -- ============================================
    -- Excecoes que preservam valor anterior com COALESCE:
    --   pipeline_id / pipeline_name: webhooks de atualizacao de data nao incluem
    --   data_conectado: bug fix 20260821000000 — uma vez confirmada a conexao,
    --     um webhook sem o campo resolvido nao pode apagar o fato
    --   data_lead_recebido: gerenciada por sync-opp-dates
    --   sdr_name: gerenciada por sync-opp-sdr
    --   data_reuniao_agendada, data_agendamento_reuniao, data_agendamento_vendas:
    --     gerenciadas por sync-appointment-dates (nao extraidas do webhook)
    --   nome_contato: bug fix 20260907000000 — webhook sem nome nao apaga
    --     o nome existente (e no INSERT usa fallback email/phone/'Sem nome')
    WITH ultimos_webhooks_opp AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            w.id,
            w.payload,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(public.ghl_payload_location_id(w.payload, w.location_id)),
                w.payload
            ) AS mapped,
            TRIM(w.payload->>'id') AS ghl_opportunity_id
        FROM public.webhooks_ghl w
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    atualizados AS (
        UPDATE public.oportunidades o
        SET
            nome_contato       = COALESCE(NULLIF(w.mapped->>'full_name', ''), o.nome_contato),
            email_contato      = LOWER(w.mapped->>'email'),
            titulo             = w.mapped->>'opportunity_name',
            valor              = (w.mapped->>'lead_value')::DECIMAL,
            status             = w.mapped->>'status',
            pipeline_id        = COALESCE(w.mapped->>'pipeline_id_opp', o.pipeline_id),
            pipeline_stage_id  = w.mapped->>'pipeline_stage_id',
            pipeline_name      = COALESCE(w.mapped->>'pipeline_name_opp', o.pipeline_name),
            opportunity_source = w.mapped->>'opportunity_source',
            vendedor_closer    = w.mapped->>'vendedor_closer',
            lost_reason        = w.mapped->>'lost_reason',
            resumo_ia          = w.mapped->>'resumo_ia',
            percepcao_closer   = w.mapped->>'percepcao_closer',
            data_ultima_atividade = parse_date_flexible(w.mapped->>'data_ultima_atividade'),
            data_tentativa_1         = parse_date_flexible(w.mapped->>'data_tentativa_1'),
            data_tentativa_2         = parse_date_flexible(w.mapped->>'data_tentativa_2'),
            data_tentativa_3         = parse_date_flexible(w.mapped->>'data_tentativa_3'),
            data_tentativa_4         = parse_date_flexible(w.mapped->>'data_tentativa_4'),
            data_tentativa_5         = parse_date_flexible(w.mapped->>'data_tentativa_5'),
            data_tentativa_6         = parse_date_flexible(w.mapped->>'data_tentativa_6'),
            data_tentativa_7         = parse_date_flexible(w.mapped->>'data_tentativa_7'),
            data_tentativa_8         = parse_date_flexible(w.mapped->>'data_tentativa_8'),
            data_no_show             = parse_date_flexible(w.mapped->>'data_no_show'),
            data_conectado           = COALESCE(parse_date_flexible(w.mapped->>'data_conectado'), o.data_conectado),
            data_perdido             = parse_date_flexible(w.mapped->>'data_perdido'),
            data_qualificado         = parse_date_flexible(w.mapped->>'data_qualificado'),
            data_pendencias_preenchimento = parse_date_flexible(w.mapped->>'data_pendencias_preenchimento'),
            data_no_show_vendas      = parse_date_flexible(w.mapped->>'data_no_show_vendas'),
            data_perdido_vendas      = parse_date_flexible(w.mapped->>'data_perdido_vendas'),
            data_realizacao_vendas   = parse_date_flexible(w.mapped->>'data_realizacao_vendas'),
            data_negociacao          = parse_date_flexible(w.mapped->>'data_negociacao'),
            data_fechado             = parse_date_flexible(w.mapped->>'data_fechado'),
            data_reuniao_realizada   = parse_date_flexible(w.mapped->>'data_reuniao_realizada'),
            data_auto_agendamento    = parse_date_flexible(w.mapped->>'data_auto_agendamento'),
            updated_at = NOW()
        FROM ultimos_webhooks_opp w
        WHERE o.ghl_opportunity_id = w.ghl_opportunity_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

    -- ============================================
    -- PASSO 2.6: Enfileirar job de followers
    -- ============================================
    IF p_webhook_id IS NOT NULL THEN
        PERFORM public.enqueue_ghl_api_job(
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
        FROM public.oportunidades o
        INNER JOIN public.webhooks_ghl w ON w.id = p_webhook_id
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

COMMENT ON FUNCTION public.extrair_dados_ghl_v2(uuid) IS
'Versao refatorada de extrair_dados_ghl que usa ghl_field_mappings por workspace. Mantem equivalencia com v1 para o template Empire Default. data_conectado protegido com COALESCE desde 20260821000000. Desde 20260827000000: popula contatos.custom_fields com campos "extra.*". Desde 20260906000000: resolve location via ghl_payload_location_id (formato nested). Desde 20260907000000: contatos sem nome no GHL voltam a ser contados — fallback full_name → email → phone → ''Sem nome'' no INSERT e preserva nome existente no UPDATE (restaura comportamento da v1).';

NOTIFY pgrst, 'reload schema';
