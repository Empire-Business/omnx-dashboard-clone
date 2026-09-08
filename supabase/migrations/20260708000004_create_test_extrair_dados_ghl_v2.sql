-- ============================================================
-- Migration: 20260708000004
-- Cria funcao de teste comparativo entre extrair_dados_ghl (v1)
-- e extrair_dados_ghl_v2 para webhooks reais recentes.
--
-- Uso:
--   SELECT * FROM test_extrair_dados_ghl_v2_equivalence(50);
--
-- A funcao deve ser chamada dentro de uma transacao para que, em caso
-- de falha, os dados de teste sejam descartados:
--   BEGIN;
--   SELECT * FROM test_extrair_dados_ghl_v2_equivalence(50);
--   ROLLBACK;
--
-- O que ela faz:
--   1. Seleciona N webhooks recentes (com contact_id e id preenchidos).
--   2. Para cada webhook, cria DUAS copias sinteticas:
--      - contact_id e opportunity_id com sufixos -v1 e -v2
--   3. Processa v1 na copia -v1 e v2 na copia -v2.
--   4. Compara os contatos e oportunidades criados/atualizados.
--   5. Remove os dados de teste antes de processar o proximo webhook.
--   6. Retorna uma linha por webhook com status OK ou diferenças.
-- ============================================================

CREATE OR REPLACE FUNCTION public.test_extrair_dados_ghl_v2_equivalence(p_limit INT DEFAULT 50)
RETURNS TABLE(
    webhook_id UUID,
    status TEXT,
    detail TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    rec RECORD;
    v_suffix_v1 TEXT := '-ralph-v1';
    v_suffix_v2 TEXT := '-ralph-v2';
    v_contact_id_v1 TEXT;
    v_contact_id_v2 TEXT;
    v_opp_id_v1 TEXT;
    v_opp_id_v2 TEXT;
    v_payload_v1 JSONB;
    v_payload_v2 JSONB;
    v_webhook_v1 UUID;
    v_webhook_v2 UUID;
    v_result_v1 RECORD;
    v_result_v2 RECORD;
    v_contato_v1 RECORD;
    v_contato_v2 RECORD;
    v_opp_v1 RECORD;
    v_opp_v2 RECORD;
    v_detail TEXT;
BEGIN
    FOR rec IN
        SELECT w.id, w.payload
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
        ORDER BY w.created_at DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        v_detail := '';

        -- Gera IDs sinteticos
        v_contact_id_v1 := TRIM(rec.payload->>'contact_id') || v_suffix_v1;
        v_contact_id_v2 := TRIM(rec.payload->>'contact_id') || v_suffix_v2;
        v_opp_id_v1 := TRIM(rec.payload->>'id') || v_suffix_v1;
        v_opp_id_v2 := TRIM(rec.payload->>'id') || v_suffix_v2;

        -- Limpa dados de teste preexistentes
        DELETE FROM public.webhooks_ghl WHERE payload->>'contact_id' IN (v_contact_id_v1, v_contact_id_v2);
        DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
        DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

        -- Monta payloads modificados
        v_payload_v1 := jsonb_set(
            jsonb_set(rec.payload, '{contact_id}', to_jsonb(v_contact_id_v1)),
            '{id}',
            to_jsonb(v_opp_id_v1)
        );
        v_payload_v2 := jsonb_set(
            jsonb_set(rec.payload, '{contact_id}', to_jsonb(v_contact_id_v2)),
            '{id}',
            to_jsonb(v_opp_id_v2)
        );

        -- Insere webhooks de teste
        INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload_v1) RETURNING id INTO v_webhook_v1;
        INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload_v2) RETURNING id INTO v_webhook_v2;

        BEGIN
            -- Processa v1 e v2
            SELECT * INTO v_result_v1 FROM public.extrair_dados_ghl(v_webhook_v1);
            SELECT * INTO v_result_v2 FROM public.extrair_dados_ghl_v2(v_webhook_v2);

            -- Compara contagens
            IF v_result_v1.contatos_inseridos IS DISTINCT FROM v_result_v2.contatos_inseridos THEN
                v_detail := v_detail || format('contatos_inseridos(v1=%s,v2=%s) ', v_result_v1.contatos_inseridos, v_result_v2.contatos_inseridos);
            END IF;
            IF v_result_v1.contatos_atualizados IS DISTINCT FROM v_result_v2.contatos_atualizados THEN
                v_detail := v_detail || format('contatos_atualizados(v1=%s,v2=%s) ', v_result_v1.contatos_atualizados, v_result_v2.contatos_atualizados);
            END IF;
            IF v_result_v1.oportunidades_inseridas IS DISTINCT FROM v_result_v2.oportunidades_inseridas THEN
                v_detail := v_detail || format('oportunidades_inseridas(v1=%s,v2=%s) ', v_result_v1.oportunidades_inseridas, v_result_v2.oportunidades_inseridas);
            END IF;
            IF v_result_v1.oportunidades_atualizadas IS DISTINCT FROM v_result_v2.oportunidades_atualizadas THEN
                v_detail := v_detail || format('oportunidades_atualizadas(v1=%s,v2=%s) ', v_result_v1.oportunidades_atualizadas, v_result_v2.oportunidades_atualizadas);
            END IF;

            -- Compara contatos criados (campos relevantes, ignorando id/created_at/updated_at)
            SELECT * INTO v_contato_v1 FROM public.contatos WHERE ghl_id = v_contact_id_v1;
            SELECT * INTO v_contato_v2 FROM public.contatos WHERE ghl_id = v_contact_id_v2;

            IF v_contato_v1 IS NULL OR v_contato_v2 IS NULL THEN
                v_detail := v_detail || 'contato_nao_encontrado ';
            ELSIF (
                v_contato_v1.ghl_id, v_contato_v1.nome, v_contato_v1.email, v_contato_v1.telefone,
                v_contato_v1.utm_source, v_contato_v1.utm_medium, v_contato_v1.utm_campaign,
                v_contato_v1.utm_term, v_contato_v1.utm_content, v_contato_v1.ip,
                v_contato_v1.url, v_contato_v1.fbclid, v_contato_v1.owner_name, v_contato_v1.owner_email
            ) IS DISTINCT FROM (
                v_contato_v2.ghl_id, v_contato_v2.nome, v_contato_v2.email, v_contato_v2.telefone,
                v_contato_v2.utm_source, v_contato_v2.utm_medium, v_contato_v2.utm_campaign,
                v_contato_v2.utm_term, v_contato_v2.utm_content, v_contato_v2.ip,
                v_contato_v2.url, v_contato_v2.fbclid, v_contato_v2.owner_name, v_contato_v2.owner_email
            ) THEN
                v_detail := v_detail || 'contato_fields_diverge ';
            END IF;

            -- Compara oportunidades criadas (campos relevantes)
            SELECT * INTO v_opp_v1 FROM public.oportunidades WHERE ghl_opportunity_id = v_opp_id_v1;
            SELECT * INTO v_opp_v2 FROM public.oportunidades WHERE ghl_opportunity_id = v_opp_id_v2;

            IF v_opp_v1 IS NULL OR v_opp_v2 IS NULL THEN
                v_detail := v_detail || 'oportunidade_nao_encontrada ';
            ELSIF (
                v_opp_v1.ghl_opportunity_id, v_opp_v1.nome_contato, v_opp_v1.email_contato,
                v_opp_v1.titulo, v_opp_v1.valor, v_opp_v1.status, v_opp_v1.pipeline_id,
                v_opp_v1.pipeline_stage_id, v_opp_v1.pipeline_name, v_opp_v1.opportunity_source,
                v_opp_v1.vendedor_closer, v_opp_v1.lost_reason, v_opp_v1.resumo_ia,
                v_opp_v1.percepcao_closer, v_opp_v1.data_ultima_atividade, v_opp_v1.data_conectado,
                v_opp_v1.data_fechado, v_opp_v1.data_no_show, v_opp_v1.data_realizacao_vendas
            ) IS DISTINCT FROM (
                v_opp_v2.ghl_opportunity_id, v_opp_v2.nome_contato, v_opp_v2.email_contato,
                v_opp_v2.titulo, v_opp_v2.valor, v_opp_v2.status, v_opp_v2.pipeline_id,
                v_opp_v2.pipeline_stage_id, v_opp_v2.pipeline_name, v_opp_v2.opportunity_source,
                v_opp_v2.vendedor_closer, v_opp_v2.lost_reason, v_opp_v2.resumo_ia,
                v_opp_v2.percepcao_closer, v_opp_v2.data_ultima_atividade, v_opp_v2.data_conectado,
                v_opp_v2.data_fechado, v_opp_v2.data_no_show, v_opp_v2.data_realizacao_vendas
            ) THEN
                v_detail := v_detail || 'oportunidade_fields_diverge ';
            END IF;

            -- Limpa dados de teste desta iteracao
            DELETE FROM public.webhooks_ghl WHERE id IN (v_webhook_v1, v_webhook_v2);
            DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
            DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

        EXCEPTION WHEN OTHERS THEN
            -- Garante limpeza mesmo em caso de erro
            DELETE FROM public.webhooks_ghl WHERE id IN (v_webhook_v1, v_webhook_v2);
            DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
            DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

            webhook_id := rec.id;
            status := 'ERROR';
            detail := SQLERRM;
            RETURN NEXT;
            CONTINUE;
        END;

        webhook_id := rec.id;
        IF v_detail = '' THEN
            status := 'OK';
            detail := 'v1 e v2 equivalentes';
        ELSE
            status := 'DIFF';
            detail := v_detail;
        END IF;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$$;

COMMENT ON FUNCTION public.test_extrair_dados_ghl_v2_equivalence(INT) IS
'Teste comparativo entre extrair_dados_ghl (v1) e extrair_dados_ghl_v2 para webhooks reais recentes. Usar dentro de transacao com ROLLBACK.';
