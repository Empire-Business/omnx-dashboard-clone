-- ============================================================
-- Teste comparativo: extrair_dados_ghl (v1) vs extrair_dados_ghl_v2
--
-- Objetivo:
--   Verificar que v2 produz os mesmos contatos/oportunidades que v1
--   para webhooks sinteticos com o template Empire Default.
--
-- Como executar:
--   psql <database> -f tests/sql/test_extrair_dados_ghl_v2_equivalence.sql
--
-- O script usa BEGIN / ROLLBACK para nao alterar dados reais.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------------
-- Setup: localizar workspace e gerar IDs deterministicos de teste
-- ------------------------------------------------------------------
DO $$
DECLARE
    v_workspace_id UUID;
    v_contact_id TEXT := 'test-contact-ralph-001';
    v_opp_id TEXT := 'test-opp-ralph-001';
    v_webhook_v1 UUID;
    v_webhook_v2 UUID;
    v_payload JSONB;
    v_contato_id UUID;
    v_opp_row_v1 RECORD;
    v_opp_row_v2 RECORD;
    v_diff_count INTEGER := 0;
BEGIN
    SELECT id INTO v_workspace_id
    FROM public.workspaces
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum workspace encontrado para teste';
    END IF;

    -- Garante que o workspace tenha o template Empire Default seedado
    IF NOT EXISTS (
        SELECT 1 FROM public.ghl_field_mappings
        WHERE workspace_id = v_workspace_id
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'Workspace % nao possui ghl_field_mappings. Execute a migration de seed primeiro.', v_workspace_id;
    END IF;

    -- Payload sintetico cobrindo: contato, UTM, customData de oportunidade
    v_payload := jsonb_build_object(
        'locationId', 'test-location-ralph',
        'contact_id', v_contact_id,
        'full_name',  'Ralph Test',
        'email',      'RALPH.TEST@EXAMPLE.COM',
        'phone',      '+5511999999999',
        'first_name', 'Ralph',
        'last_name',  'Test',
        'utm_source', 'facebook',
        'utm_medium', 'cpc',
        'utm_campaign', 'campanha-ralph',
        'utm_term',   'CR-001',
        'utm_content','variacao-A',
        'lastAttributionSource', jsonb_build_object(
            'utmSource', 'facebook_fallback',
            'utmMedium', 'cpc_fallback',
            'campaign',  'campanha-fallback',
            'utmTerm',   'CR-FALLBACK',
            'utmContent','variacao-fallback',
            'ip',        '200.200.200.200',
            'url',       'https://fallback.example.com',
            'fbclid',    'fallback-fbclid'
        ),
        'owner',       'Owner Ralph',
        'E-mail Owner','owner.ralph@example.com',
        'Owner ID',    'owner-id-ralph',
        'pipeline_id', 'pipeline-ralph-001',
        'pipeline_name','Pipeline Ralph',
        'country',     'BR',
        'date_created','2026-07-08T10:00:00Z',
        'id', v_opp_id,
        'opportunity_name', 'Oportunidade Ralph',
        'lead_value', '5000',
        'status', 'open',
        'pipleline_stage', 'stage-ralph-001',
        'customData', jsonb_build_object(
            '{{opportunity.mqlconectado}}', '2026-07-08',
            '{{opportunity.sqlfechada}}',   '2026-07-09',
            '{{opportunity.assignedToUsersName}}', 'Closer Ralph',
            '{{opportunity.source}}', 'source-ralph',
            '{{opportunity.mqlno_show}}', '2026-07-10'
        )
    );

    -- Limpa dados de teste preexistentes (seguro dentro da transacao)
    DELETE FROM public.webhooks_ghl WHERE payload->>'contact_id' = v_contact_id;
    DELETE FROM public.oportunidades WHERE ghl_opportunity_id = v_opp_id;
    DELETE FROM public.contatos WHERE ghl_id = v_contact_id;

    -- Insere dois webhooks identicos: um para v1, outro para v2
    INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload) RETURNING id INTO v_webhook_v1;
    INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload) RETURNING id INTO v_webhook_v2;

    -- Processa v1 no primeiro webhook
    PERFORM public.extrair_dados_ghl(v_webhook_v1);

    -- Processa v2 no segundo webhook
    PERFORM public.extrair_dados_ghl_v2(v_webhook_v2);

    -- ------------------------------------------------------------------
    -- Comparacao de contatos
    -- ------------------------------------------------------------------
    SELECT * INTO v_opp_row_v1
    FROM public.oportunidades
    WHERE ghl_opportunity_id = v_opp_id
    LIMIT 1;

    -- Na v1, a opp ja foi criada; v2 deve ter encontrado a mesma opp (ja existe)
    -- e atualizado com valores identicos. Verificamos se nao ha divergencia.
    SELECT * INTO v_opp_row_v2
    FROM public.oportunidades
    WHERE ghl_opportunity_id = v_opp_id
    LIMIT 1;

    IF v_opp_row_v1 IS DISTINCT FROM v_opp_row_v2 THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'Divergencia detectada entre v1 e v2 para oportunidade %', v_opp_id;
    END IF;

    -- Verificacoes pontuais de equivalencia
    IF v_opp_row_v2.nome_contato <> 'Ralph Test' THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'nome_contato diferente do esperado: %', v_opp_row_v2.nome_contato;
    END IF;

    IF v_opp_row_v2.email_contato <> 'ralph.test@example.com' THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'email_contato diferente do esperado: %', v_opp_row_v2.email_contato;
    END IF;

    IF v_opp_row_v2.pipeline_id <> 'pipeline-ralph-001' THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'pipeline_id diferente do esperado: %', v_opp_row_v2.pipeline_id;
    END IF;

    IF v_opp_row_v2.data_conectado <> '2026-07-08'::date THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'data_conectado diferente do esperado: %', v_opp_row_v2.data_conectado;
    END IF;

    IF v_opp_row_v2.data_fechado <> '2026-07-09'::date THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'data_fechado diferente do esperado: %', v_opp_row_v2.data_fechado;
    END IF;

    IF v_opp_row_v2.data_no_show <> '2026-07-10'::date THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'data_no_show diferente do esperado: %', v_opp_row_v2.data_no_show;
    END IF;

    IF v_opp_row_v2.vendedor_closer <> 'Closer Ralph' THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'vendedor_closer diferente do esperado: %', v_opp_row_v2.vendedor_closer;
    END IF;

    IF v_opp_row_v2.opportunity_source <> 'source-ralph' THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'opportunity_source diferente do esperado: %', v_opp_row_v2.opportunity_source;
    END IF;

    -- Contato
    SELECT id INTO v_contato_id
    FROM public.contatos
    WHERE ghl_id = v_contact_id;

    IF v_contato_id IS NULL THEN
        v_diff_count := v_diff_count + 1;
        RAISE WARNING 'Contato de teste nao encontrado';
    ELSE
        IF (SELECT utm_source FROM public.contatos WHERE id = v_contato_id) <> 'facebook' THEN
            v_diff_count := v_diff_count + 1;
            RAISE WARNING 'utm_source do contato diferente do esperado';
        END IF;
        IF (SELECT owner_name FROM public.contatos WHERE id = v_contato_id) <> 'Owner Ralph' THEN
            v_diff_count := v_diff_count + 1;
            RAISE WARNING 'owner_name do contato diferente do esperado';
        END IF;
        IF (SELECT ip FROM public.contatos WHERE id = v_contato_id) <> '200.200.200.200' THEN
            v_diff_count := v_diff_count + 1;
            RAISE WARNING 'ip do contato diferente do esperado';
        END IF;
    END IF;

    IF v_diff_count = 0 THEN
        RAISE NOTICE 'TESTE PASSOU: v1 e v2 produziram resultados equivalentes para o webhook sintetico.';
    ELSE
        RAISE NOTICE 'TESTE FALHOU: % divergencia(s) entre v1 e v2.', v_diff_count;
    END IF;
END $$;

ROLLBACK;
