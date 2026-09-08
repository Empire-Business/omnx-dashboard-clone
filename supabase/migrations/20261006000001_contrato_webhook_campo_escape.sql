-- ============================================================
-- Migration: 20261005000000
-- CONTRATO DE WEBHOOK CRM OMNX — campo de escape para dados extras
-- (ver docs/CONTRATO-WEBHOOK-CRM.md)
--
-- CONTEXTO (decisão do dono, 2026-10-05): o mapeamento de campos deixa de
-- ser reativo (o sistema tenta adivinhar o significado de cada campo
-- customizado que a conta GHL do cliente já tem) e passa a ser um CONTRATO
-- fixo — publicamos a lista exata de chaves que o webhook deve enviar
-- (docs/CONTRATO-WEBHOOK-CRM.md) e o cliente configura o CRM dele para
-- respeitar essa lista. Isso não elimina a possibilidade de o cliente ter
-- campos próprios fora do contrato — para esses, existe o campo de escape.
--
-- DECISÃO DE DESIGN — onde vive o campo de escape:
--   1. contatos.custom_fields (jsonb) já existe desde a Fase 6
--      (20260710000000) e desde 20260827000000 já é populada com pares
--      "extra.<slug>" configurados manualmente por workspace via
--      ghl_field_mappings. Mantido como está — cobre extras no nível de
--      CONTATO quando o dono quiser mapear um campo específico.
--   2. NOVO nesta migration: oportunidades.custom_extra (jsonb). A grande
--      maioria dos campos customizados de um CRM GHL fica em
--      payload->'customData' (nível OPORTUNIDADE, formato "{{opportunity.x}}"),
--      não no contato — e não existia nenhuma coluna de escape para
--      oportunidade. Diferente de contatos.custom_fields (que exige uma
--      linha de mapeamento pré-configurada por campo), custom_extra é
--      preenchido AUTOMATICAMENTE: qualquer chave de customData que não
--      bate com nenhuma chave conhecida do contrato (lista fixa abaixo) cai
--      aqui sem precisar de configuração prévia por workspace. É o que
--      torna o modelo "zero-config" de fato: cliente novo manda o payload,
--      o que bate com o contrato vira coluna, o que sobra vira custom_extra
--      — nada é descartado silenciosamente.
--   3. custom_extra é SÓ EXIBIÇÃO PASSIVA (mesmo princípio de
--      docs/GHL-CAMPOS-EXTRAS.md para contatos.custom_fields) — nunca entra
--      em métrica, funil ou cálculo. Isso evita que um campo não revisado
--      pelo time vire, sem querer, uma fonte de verdade de negócio.
-- ============================================================
SET search_path = public, pg_catalog;

-- ------------------------------------------------------------------
-- 1. Coluna de escape em oportunidades
-- ------------------------------------------------------------------
ALTER TABLE public.oportunidades
    ADD COLUMN IF NOT EXISTS custom_extra JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.oportunidades.custom_extra IS
'Campos de payload->customData que não batem com nenhuma chave conhecida do contrato de webhook (docs/CONTRATO-WEBHOOK-CRM.md). Preenchido automaticamente por extract_ghl_extra_opportunity_fields(). Só exibição passiva — nunca métrica/funil.';

-- ------------------------------------------------------------------
-- 2. Lista fixa das chaves de customData que o CONTRATO já consome hoje
--    (extrair_dados_ghl_v2 via template Empire Default + trigger de
--    vendas_fechamento). Função IMMUTABLE — é o "vocabulário conhecido"
--    contra o qual qualquer chave nova é comparada. Comparação é feita
--    ignorando espaços internos (mesma normalização de
--    resolve_ghl_field_value), porque o GHL grava a mesma chave lógica
--    ora com espaço ("{{ opportunity.x }}"), ora sem ("{{opportunity.x}}").
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_contract_known_customdata_keys()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT '[
        "{{opportunity.mqlcontato1}}","{{opportunity.d_mqlcontato1}}",
        "{{opportunity.mqlcontato2}}","{{opportunity.d_mqlcontato2}}",
        "{{opportunity.mqlcontato3}}","{{opportunity.d_mqlcontato3}}",
        "{{opportunity.mqlcontato4}}","{{opportunity.d_mqlcontato4}}",
        "{{opportunity.mqlcontato5}}","{{opportunity.d_mqlcontato5}}",
        "{{opportunity.mqlcontato6}}","{{opportunity.d_mqlcontato6}}",
        "{{opportunity.mqlcontato7}}","{{opportunity.d_mqlcontato7}}",
        "{{opportunity.mqlcontato8}}","{{opportunity.d_mqlcontato8}}",
        "{{opportunity.mqlno_show}}","{{opportunity.d_mqlno_show}}",
        "{{opportunity.mqlconectado}}","{{opportunity.d_mqlconectado}}",
        "{{opportunity.mqlperdido}}","{{opportunity.d_mqlperdido}}",
        "{{opportunity.mqlqualificado}}","{{opportunity.d_mqlqualificado}}",
        "{{opportunity.mqlreunio_marcada}}","{{opportunity.d_mqlreunio_marcada}}",
        "{{opportunity.sqlpendencias_preenchimento}}","{{opportunity.d__sqlpendencias_preenchimento}}",
        "{{opportunity.sqlno_show}}","{{opportunity.d_sqlno_show}}",
        "{{opportunity.sqlperdida}}","{{opportunity.d_sqlperdida}}",
        "{{opportunity.sqlreunio_agendada}}","{{opportunity.d_sqlreunio_agendada}}",
        "{{opportunity.sqlreunio_realizada}}","{{opportunity.d_sqlreunio_realizada}}",
        "{{opportunity.data_da_reunio_realizada}}",
        "{{opportunity.sqlnegociao}}","{{opportunity.d_sqlnegociao}}",
        "{{opportunity.sqlfechada}}","{{opportunity.d_sqlfechada}}",
        "{{opportunity.data_da_reunio}}","{{opportunity.d_data_da_reunio}}",
        "{{opportunity.reuniao_realizada}}","{{opportunity.d_reuniao_realizada}}",
        "{{opportunity.mqlauto_agendamento}}",
        "{{opportunity.assignedToUsersName}}",
        "{{opportunity.lost_reason}}",
        "{{opportunity.resumo_ia}}",
        "{{opportunity.percepo_do_closer}}",
        "{{opportunity.ltima_atividade}}",
        "{{opportunity.source}}",
        "{{opportunity.valor_a_ser_pago_de_entrada}}",
        "{{opportunity.numero_parcelas}}",
        "{{opportunity.valor_parcela}}",
        "{{opportunity.data_pagamento_entrada}}",
        "{{opportunity.nome_contratante}}",
        "{{opportunity.cpf_ou_cnpj_do_contratante}}",
        "{{opportunity.produto_que_foi_vendido}}",
        "{{opportunity.forma_de_pagamento}}",
        "{{opportunity.logradouro_rua_avenida}}",
        "{{opportunity.numero_endereco}}",
        "{{opportunity.complemento_do_endereo}}",
        "{{opportunity.bairro}}",
        "{{opportunity.municipio}}",
        "{{opportunity.estado_uf}}",
        "{{opportunity.cep}}",
        "{{opportunity.observacoes_venda}}",
        "{{opportunity.op_vencimentos_e_parcelas}}",
        "{{opportunity.op_link_do_contrato_assinado}}",
        "{{opportunity.data_da_assinatura_do_contrato}}",
        "{{opportunity.link_da_gravao_da_call_de_vendas}}"
    ]'::jsonb;
$$;

COMMENT ON FUNCTION public.get_contract_known_customdata_keys() IS
'Lista fixa (vocabulário do contrato, docs/CONTRATO-WEBHOOK-CRM.md) de chaves {{opportunity.x}} já consumidas por extrair_dados_ghl_v2 e pelo trigger de vendas_fechamento. Base de comparação para extract_ghl_extra_opportunity_fields — o que não está aqui vira custom_extra.';

-- ------------------------------------------------------------------
-- 3. extract_ghl_extra_opportunity_fields — varre payload->customData e
--    devolve, em jsonb, tudo que NÃO bate (por chave normalizada, sem
--    espaços internos) com get_contract_known_customdata_keys(). A chave
--    de saída é "limpa" (sem "{{opportunity." / "}}") para ficar legível.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.extract_ghl_extra_opportunity_fields(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
    WITH known AS (
        SELECT DISTINCT REGEXP_REPLACE(jsonb_array_elements_text(public.get_contract_known_customdata_keys()), E'\\s+', '', 'g') AS k
    ),
    custom AS (
        SELECT kv.key AS raw_key, kv.value AS raw_value
        FROM jsonb_each(COALESCE(p_payload->'customData', '{}'::jsonb)) AS kv(key, value)
        WHERE kv.key LIKE '{{%'
    )
    SELECT COALESCE(
        jsonb_object_agg(
            REGEXP_REPLACE(REGEXP_REPLACE(TRIM(c.raw_key), E'^\\{\\{\\s*opportunity\\.', ''), E'\\s*\\}\\}$', ''),
            c.raw_value #>> '{}'
        ),
        '{}'::jsonb
    )
    FROM custom c
    WHERE REGEXP_REPLACE(TRIM(c.raw_key), E'\\s+', '', 'g') NOT IN (SELECT k FROM known)
      AND NULLIF(TRIM(c.raw_value #>> '{}'), '') IS NOT NULL;
$$;

COMMENT ON FUNCTION public.extract_ghl_extra_opportunity_fields(jsonb) IS
'Captura automática (zero-config): retorna as chaves de payload->customData que não fazem parte do contrato (get_contract_known_customdata_keys), prontas para oportunidades.custom_extra. Só exibição passiva — nunca métrica/funil.';

-- ------------------------------------------------------------------
-- 4. extrair_dados_ghl_v2 — acrescenta custom_extra no INSERT (PASSO 2) e
--    no UPDATE (PASSO 2b) de oportunidades. Nenhuma outra linha muda em
--    relação à versão vigente (20260827000000).
-- ------------------------------------------------------------------
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
            public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
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
            w.mapped->>'full_name',
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
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
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
            nome     = w.mapped->>'full_name',
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
            public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
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
            w.mapped->>'full_name' AS nome_contato,
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
            (w.payload->>'date_created')::TIMESTAMPTZ AS data_criacao_contato,
            public.extract_ghl_extra_opportunity_fields(w.payload) AS custom_extra
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
            data_criacao_contato,
            custom_extra
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
            data_criacao_contato,
            custom_extra
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
    WITH ultimos_webhooks_opp AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            w.id,
            w.payload,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
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
            nome_contato       = w.mapped->>'full_name',
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
            custom_extra             = public.extract_ghl_extra_opportunity_fields(w.payload),
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
'Versao do contrato de webhook (docs/CONTRATO-WEBHOOK-CRM.md). Base: 20260827000000 (custom_fields em contatos), com adicao de oportunidades.custom_extra — captura automatica de chaves customData fora do contrato (extract_ghl_extra_opportunity_fields), sem exigir mapeamento manual por workspace. data_conectado protegido com COALESCE desde 20260821000000. custom_fields/custom_extra: exibicao passiva, nunca metrica/funil.';

NOTIFY pgrst, 'reload schema';
