-- ============================================================
-- Migration: 20260821000000
-- Bug fix CRÍTICO: leads conectados contabilizados como NÃO conectados.
--
-- Causa raiz (2 problemas encadeados):
--
-- 1) resolve_ghl_field_value() só removia espaços internos da VARIAÇÃO
--    cadastrada em ghl_field_mappings (ex: '{{opportunity.mqlconectado}}',
--    sem espaço), mas o payload real do GHL desta conta manda a chave
--    customData com espaços: '{{ opportunity.mqlconectado }}'. Como o
--    fallback só tentava a versão compacta da variação (que já era
--    compacta, então não mudava nada), a chave espaçada do payload nunca
--    era encontrada — data_conectado nunca resolvia para este workspace,
--    mesmo quando o GHL mandava o valor certo.
--
-- 2) extrair_dados_ghl_v2() sobrescrevia data_conectado sem COALESCE no
--    UPDATE (diferente de pipeline_id/pipeline_name, que já eram
--    protegidos). Resultado: todo webhook subsequente de uma oportunidade
--    zerava um data_conectado que porventura tivesse sido setado
--    corretamente por outro caminho (ex: trigger auto_tag_conectado_on_inbound
--    em comunicacoes).
--
-- Achado real (produção, leitura, 2026-07-12): lead robertdantasml@gmail.com
-- tem a tag "conectado" no GHL e uma oportunidade com data_conectado
-- preenchida (Vendas SQL), mas a oportunidade em Pré-Vendas nMQL — a que os
-- paineis de Pré-Vendas enxergam — ficou com data_conectado NULL porque o
-- último webhook dela zerou o campo. Medição de extensão (proxy: contato com
-- tag 'conectado' + oportunidade aberta + data_conectado NULL): 321 de 2.251
-- oportunidades abertas (~14%) — não é caso isolado. Ver docs/BUG-FIX-LEADS-CONECTADOS.md.
--
-- Correção:
--   a) resolve_ghl_field_value: para chaves '{{...}}', se a chave exata não
--      bater, varre as chaves reais de customData e compara ignorando TODOS
--      os espaços internos dos dois lados (chave do payload e variação), em
--      vez de só normalizar a variação. Resolve o mismatch nos dois
--      sentidos, para qualquer campo '{{opportunity.xxx}}' afetado pelo
--      mesmo padrão de digitação inconsistente no workflow do GHL — não só
--      data_conectado.
--   b) extrair_dados_ghl_v2: adiciona COALESCE em data_conectado no UPDATE
--      (PASSO 2b) — mesmo padrão já usado para pipeline_id/pipeline_name.
--      Um webhook que não resolve o campo nunca mais apaga um
--      data_conectado já confirmado. Corpo da função copiado integralmente
--      de 20260708000003 (única definição existente) com essa única linha
--      alterada — nenhuma outra regra de extração muda.
--   c) Backfill cirúrgico: recalcula data_conectado (com a função corrigida)
--      apenas para oportunidades onde hoje está NULL, a partir do último
--      webhook conhecido daquela oportunidade. Não toca em nenhum outro
--      campo nem em oportunidades que já têm data_conectado preenchida.
--
-- Escopo explicitamente FORA desta migration (decisão registrada, não
-- omissão): os outros ~14 campos de data de marco no PASSO 2b
-- (data_no_show, data_qualificado, data_perdido, data_fechado etc.) também
-- não têm COALESCE no UPDATE. Não foram protegidos aqui porque, ao
-- contrário de "conectado" (que é estritamente aditivo — uma vez
-- verdadeiro, não pode voltar a falso), pelo menos alguns desses campos
-- (data_perdido, data_no_show) podem precisar ser legitimamente resetados
-- pelo próprio webhook em fluxos de reativação — proteger todos cegamente
-- sem auditar caso a caso arriscaria travar um estado incorreto para
-- sempre. Ver docs/BUG-FIX-LEADS-CONECTADOS.md seção "Fora de escopo" para
-- o levantamento completo e a recomendação de auditoria dedicada.
-- ============================================================

-- ------------------------------------------------------------------
-- (a) resolve_ghl_field_value: normalização bidirecional de espaços
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_ghl_field_value(
    p_payload jsonb,
    p_variations jsonb
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_variation text;
    v_variation_norm text;
    v_value text;
    v_path text[];
BEGIN
    IF p_payload IS NULL OR p_variations IS NULL OR jsonb_typeof(p_variations) <> 'array' THEN
        RETURN NULL;
    END IF;

    FOR v_variation IN SELECT jsonb_array_elements_text(p_variations)
    LOOP
        v_variation := TRIM(v_variation);
        IF v_variation = '' THEN
            CONTINUE;
        END IF;

        -- Campos customizados de oportunidade: procuram em customData.
        -- O GHL, dependendo de como o workflow foi digitado, pode mandar a
        -- chave com ou sem espaco interno (ex: '{{opportunity.x}}' vs
        -- '{{ opportunity.x }}'), e isso varia campo a campo dentro do
        -- MESMO payload. Por isso comparamos ignorando espacos dos DOIS
        -- lados (chave do payload e variacao), nao so de um.
        IF v_variation LIKE '{{%' THEN
            -- Tentativa 1: chave exata (caso mais comum, sem custo de scan)
            v_value := NULLIF(TRIM(p_payload->'customData'->>v_variation), '');

            IF v_value IS NULL THEN
                v_variation_norm := REGEXP_REPLACE(v_variation, E'\\s+', '', 'g');
                SELECT NULLIF(TRIM(kv.value), '')
                  INTO v_value
                  FROM jsonb_each_text(COALESCE(p_payload->'customData', '{}'::jsonb)) AS kv(key, value)
                 WHERE REGEXP_REPLACE(kv.key, E'\\s+', '', 'g') = v_variation_norm
                   AND NULLIF(TRIM(kv.value), '') IS NOT NULL
                 LIMIT 1;
            END IF;
        -- Caminho aninhado (ex: lastAttributionSource.utmSource)
        ELSIF v_variation LIKE '%.%' THEN
            v_path := string_to_array(v_variation, '.');
            v_value := NULLIF(TRIM(p_payload #>> v_path), '');
        -- Chave simples no payload root
        ELSE
            v_value := NULLIF(TRIM(p_payload->>v_variation), '');
        END IF;

        IF v_value IS NOT NULL THEN
            RETURN v_value;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.resolve_ghl_field_value(jsonb, jsonb) IS
'Extrai valor de um payload GHL tentando todas as variacoes de chave fornecidas. Suporta chaves simples, caminhos aninhados e campos customizados {{opportunity.xxx}} — comparando chaves "{{...}}" ignorando espacos internos dos dois lados (payload e variacao), pois o GHL pode mandar a mesma chave com espacamento inconsistente entre campos.';

-- ------------------------------------------------------------------
-- (b) extrair_dados_ghl_v2: COALESCE em data_conectado no UPDATE
--     (corpo identico a 20260708000003, apenas a linha de data_conectado
--     no PASSO 2b foi alterada)
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
            pipeline_id_contato, pipeline_name, owner_id, owner_name, owner_email
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
            w.mapped->>'owner_email'
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
'Versao refatorada de extrair_dados_ghl que usa ghl_field_mappings por workspace. Mantem equivalencia com v1 para o template Empire Default. data_conectado protegido com COALESCE desde 20260821000000 (bug fix leads conectados).';

-- ------------------------------------------------------------------
-- (c) Backfill cirurgico: recalcula data_conectado (com a funcao ja
--     corrigida) para oportunidades onde hoje esta NULL, a partir do
--     ultimo webhook conhecido daquela oportunidade. So escreve quando o
--     valor resolvido nao e nulo — nunca zera nada, nunca toca em quem ja
--     tem data_conectado preenchida.
-- ------------------------------------------------------------------
WITH ultimo_webhook_por_opp AS (
    SELECT DISTINCT ON (TRIM(w.payload->>'id'))
        TRIM(w.payload->>'id') AS ghl_opportunity_id,
        public.apply_ghl_field_mappings(
            public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
            w.payload
        ) AS mapped
    FROM public.webhooks_ghl w
    WHERE w.payload->>'id' IS NOT NULL
      AND TRIM(w.payload->>'id') != ''
    ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
),
recalculado AS (
    SELECT
        o.id,
        parse_date_flexible(u.mapped->>'data_conectado') AS novo_data_conectado
    FROM public.oportunidades o
    JOIN ultimo_webhook_por_opp u ON u.ghl_opportunity_id = o.ghl_opportunity_id
    WHERE o.data_conectado IS NULL
)
UPDATE public.oportunidades o
SET data_conectado = r.novo_data_conectado
FROM recalculado r
WHERE o.id = r.id
  AND r.novo_data_conectado IS NOT NULL;
