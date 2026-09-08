-- Migration: Corrigir condição de guarda do trigger + backfill link contrato
--
-- PROBLEMA IDENTIFICADO (2026-03-23):
-- O trigger extrair_vendas_fechamento_do_webhook() ignora qualquer webhook que não tenha
-- pelo menos um dos campos financeiros (valor_entrada, numero_parcelas, valor_parcela,
-- data_pagamento_entrada). O webhook enviado pelo OpenClaw quando o contrato é assinado
-- chega SEPARADO e traz APENAS link + data_assinatura — sem dados financeiros.
-- Resultado: o trigger pulava esses webhooks inteiros → link e data ficavam NULL.
--
-- SOLUÇÃO:
-- 1. Ampliar a condição de guarda para incluir link_contrato e data_assinatura:
--    "ignorar SOMENTE se todos os campos relevantes estiverem NULL"
-- 2. Backfill: pegar link + data do webhook mais recente para cada vf com NULL
--
-- IMPACTO: 92 webhooks tinham link → mas só 44 foram capturados.
-- Após backfill: todos os que têm webhook com link serão corrigidos.

-- ============================================================
-- 1. Atualizar função — corrigir condição de guarda
-- ============================================================

CREATE OR REPLACE FUNCTION public.extrair_vendas_fechamento_do_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_opp_id TEXT;
    v_contato_id UUID;
    v_valor_entrada DECIMAL;
    v_numero_parcelas INTEGER;
    v_valor_parcela DECIMAL;
    v_data_pagamento TIMESTAMPTZ;
    v_nome_contratante TEXT;
    v_cpf_cnpj TEXT;
    v_produto_vendido TEXT;
    v_forma_pagamento TEXT;
    v_endereco TEXT;
    v_numero TEXT;
    v_complemento TEXT;
    v_bairro TEXT;
    v_municipio TEXT;
    v_estado TEXT;
    v_cep TEXT;
    v_observacoes TEXT;
    v_op_vencimentos TEXT;
    v_link_contrato TEXT;
    v_data_assinatura DATE;
    v_opp_pk_id UUID;
BEGIN
    -- Se não tem oportunidade, ignora
    v_opp_id := NEW.payload->>'id';
    IF v_opp_id IS NULL OR TRIM(v_opp_id) = '' THEN
        RETURN NEW;
    END IF;

    -- ========== CAMPOS FINANCEIROS ==========
    -- Nomes SEM espaços — confirmados via webhook real
    v_valor_entrada   := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}'), '')::DECIMAL;
    v_numero_parcelas := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_parcelas}}'), '')::INTEGER;
    v_valor_parcela   := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_parcela}}'), '')::DECIMAL;
    v_data_pagamento  := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ;

    -- ========== CAMPOS DE CONTRATO ==========
    v_nome_contratante := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.nome_contratante }}'), '');
    v_cpf_cnpj         := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), '');
    v_produto_vendido  := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.produto_que_foi_vendido }}'), '');
    v_forma_pagamento  := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.forma_de_pagamento }}'), '');
    v_endereco    := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}'), '');
    v_numero      := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_endereco }}'), '');
    v_complemento := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}'), '');
    v_bairro      := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.bairro }}'), '');
    v_municipio   := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.municipio }}'), '');
    v_estado      := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.estado_uf }}'), '');
    v_cep         := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cep }}'), '');
    v_observacoes := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.observacoes_venda }}'), '');

    -- ========== CAMPO OP_VENCIMENTOS ==========
    -- SEM espaços — confirmado via webhook real (20260323100000)
    v_op_vencimentos := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_vencimentos_e_parcelas}}'), '');

    -- ========== LINK DO CONTRATO ASSINADO ==========
    -- SEM espaços — confirmado pelo usuário
    v_link_contrato := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '');

    -- ========== DATA DE ASSINATURA DO CONTRATO ==========
    -- SEM espaços — confirmado pelo usuário
    v_data_assinatura := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE;

    -- GUARD: ignorar webhook se TODOS os campos relevantes estiverem NULL
    -- CORRIGIDO (20260323150000): agora inclui link_contrato e data_assinatura —
    -- webhooks do OpenClaw trazem APENAS esses campos, sem dados financeiros
    IF v_valor_entrada IS NULL
       AND v_numero_parcelas IS NULL
       AND v_valor_parcela IS NULL
       AND v_data_pagamento IS NULL
       AND v_link_contrato IS NULL
       AND v_data_assinatura IS NULL
    THEN
        RETURN NEW;
    END IF;

    -- Buscar contato_id
    SELECT id INTO v_contato_id
    FROM contatos
    WHERE ghl_id = TRIM(NEW.payload->>'contact_id')
    LIMIT 1;

    IF v_contato_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar oportunidade pk
    SELECT id INTO v_opp_pk_id
    FROM oportunidades
    WHERE ghl_opportunity_id = v_opp_id
    LIMIT 1;

    IF v_opp_pk_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- UPSERT em vendas_fechamento
    INSERT INTO vendas_fechamento (
        oportunidade_id, contato_id,
        nome_contratante, cpf_cnpj_contratante,
        logradouro_rua_avenida, numero_endereco, complemento_endereco,
        bairro, municipio, estado_uf, cep,
        produto_vendido, observacoes_venda,
        forma_pagamento,
        valor_entrada, numero_parcelas, valor_parcela,
        data_pagamento_entrada,
        op_vencimentos_parcelas,
        op_link_do_contrato_assinado,
        data_da_assinatura_do_contrato
    ) VALUES (
        v_opp_pk_id, v_contato_id,
        v_nome_contratante, v_cpf_cnpj,
        v_endereco, v_numero, v_complemento,
        v_bairro, v_municipio, v_estado, v_cep,
        v_produto_vendido, v_observacoes,
        v_forma_pagamento,
        COALESCE(v_valor_entrada, 0),
        COALESCE(v_numero_parcelas, 0),
        COALESCE(v_valor_parcela, 0),
        v_data_pagamento,
        v_op_vencimentos,
        v_link_contrato,
        v_data_assinatura
    )
    ON CONFLICT (oportunidade_id) DO UPDATE SET
        nome_contratante               = COALESCE(EXCLUDED.nome_contratante,               vendas_fechamento.nome_contratante),
        cpf_cnpj_contratante           = COALESCE(EXCLUDED.cpf_cnpj_contratante,           vendas_fechamento.cpf_cnpj_contratante),
        logradouro_rua_avenida         = COALESCE(EXCLUDED.logradouro_rua_avenida,         vendas_fechamento.logradouro_rua_avenida),
        numero_endereco                = COALESCE(EXCLUDED.numero_endereco,                vendas_fechamento.numero_endereco),
        complemento_endereco           = COALESCE(EXCLUDED.complemento_endereco,           vendas_fechamento.complemento_endereco),
        bairro                         = COALESCE(EXCLUDED.bairro,                         vendas_fechamento.bairro),
        municipio                      = COALESCE(EXCLUDED.municipio,                      vendas_fechamento.municipio),
        estado_uf                      = COALESCE(EXCLUDED.estado_uf,                      vendas_fechamento.estado_uf),
        cep                            = COALESCE(EXCLUDED.cep,                            vendas_fechamento.cep),
        produto_vendido                = COALESCE(EXCLUDED.produto_vendido,                vendas_fechamento.produto_vendido),
        observacoes_venda              = COALESCE(EXCLUDED.observacoes_venda,              vendas_fechamento.observacoes_venda),
        forma_pagamento                = COALESCE(EXCLUDED.forma_pagamento,                vendas_fechamento.forma_pagamento),
        valor_entrada                  = COALESCE(EXCLUDED.valor_entrada,                  vendas_fechamento.valor_entrada),
        numero_parcelas                = COALESCE(EXCLUDED.numero_parcelas,                vendas_fechamento.numero_parcelas),
        valor_parcela                  = COALESCE(EXCLUDED.valor_parcela,                  vendas_fechamento.valor_parcela),
        data_pagamento_entrada         = COALESCE(EXCLUDED.data_pagamento_entrada,         vendas_fechamento.data_pagamento_entrada),
        op_vencimentos_parcelas        = COALESCE(EXCLUDED.op_vencimentos_parcelas,        vendas_fechamento.op_vencimentos_parcelas),
        op_link_do_contrato_assinado   = COALESCE(EXCLUDED.op_link_do_contrato_assinado,   vendas_fechamento.op_link_do_contrato_assinado),
        data_da_assinatura_do_contrato = COALESCE(EXCLUDED.data_da_assinatura_do_contrato, vendas_fechamento.data_da_assinatura_do_contrato),
        updated_at                     = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Erro ao extrair vendas_fechamento: %', SQLERRM;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.extrair_vendas_fechamento_do_webhook() IS
  'Extrai dados de faturamento dos webhooks GHL → vendas_fechamento. Guard agora inclui link_contrato e data_assinatura (2026-03-23).';

-- ============================================================
-- 2. BACKFILL: pegar link + data do webhook mais recente
--    para cada vendas_fechamento com esses campos NULL
-- ============================================================

UPDATE vendas_fechamento vf
SET
    op_link_do_contrato_assinado   = sub.link,
    data_da_assinatura_do_contrato = sub.data_assinatura,
    updated_at                     = NOW()
FROM (
    SELECT DISTINCT ON (o.id)
        o.id AS opp_pk_id,
        NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '')   AS link,
        NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE AS data_assinatura
    FROM webhooks_ghl w
    JOIN oportunidades o ON o.ghl_opportunity_id = w.payload->>'id'
    WHERE
        NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '') IS NOT NULL
        OR NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '') IS NOT NULL
    ORDER BY o.id, w.created_at DESC
) sub
WHERE
    vf.oportunidade_id = sub.opp_pk_id
    AND (vf.op_link_do_contrato_assinado IS NULL OR vf.data_da_assinatura_do_contrato IS NULL)
    AND (sub.link IS NOT NULL OR sub.data_assinatura IS NOT NULL);
