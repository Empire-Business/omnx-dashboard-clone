-- Migration: Corrigir nomes de campos no trigger vendas_fechamento
--
-- PROBLEMA: Trigger criado em 20260318040000 usava nomes de campos ERRADOS:
-- - `{{ opportunity.valor_entrada }}` → deveria ser `{{ opportunity.valor_a_ser_pago_de_entrada }}`
-- - Resultado: trigger não pegava nenhum webhook porque campo não existia
--
-- VERIFICAÇÃO: Existem 45 webhooks com dados de faturamento reais nos campos certos
--
-- SOLUÇÃO: Corrigir a função para usar os nomes certos dos campos

-- ============================================================
-- Função corrigida com nomes de campos corretos
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
BEGIN
    -- Se não tem oportunidade, ignora
    v_opp_id := NEW.payload->>'id';
    IF v_opp_id IS NULL OR TRIM(v_opp_id) = '' THEN
        RETURN NEW;
    END IF;

    -- ========== NOMES DE CAMPOS CORRETOS ==========
    -- Extrair campos de faturamento do payload
    v_valor_entrada := (NEW.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}')::DECIMAL;
    v_numero_parcelas := (NEW.payload->'customData'->>'{{opportunity.numero_parcelas}}')::INTEGER;
    v_valor_parcela := (NEW.payload->'customData'->>'{{opportunity.valor_parcela}}')::DECIMAL;
    v_data_pagamento := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_pagamento_entrada}}'), '')::TIMESTAMPTZ;

    -- Extrair campos de contrato
    v_nome_contratante := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.nome_contratante}}'), '');
    v_cpf_cnpj := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cpf_ou_cnpj_do_contratante}}'), '');
    v_produto_vendido := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.produto_vendido}}'), '');
    v_forma_pagamento := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.forma_pagamento}}'), '');
    v_endereco := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.logradouro_rua_avenida}}'), '');
    v_numero := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_endereco}}'), '');
    v_complemento := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.complemento_do_endereo}}'), '');
    v_bairro := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.bairro}}'), '');
    v_municipio := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.municipio}}'), '');
    v_estado := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.estado_uf}}'), '');
    v_cep := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cep}}'), '');
    v_observacoes := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.observacoes_venda}}'), '');

    -- Se nenhum campo de faturamento foi preenchido, ignora
    IF v_valor_entrada IS NULL AND v_numero_parcelas IS NULL AND v_valor_parcela IS NULL AND v_data_pagamento IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar contato_id correspondente
    SELECT id INTO v_contato_id
    FROM contatos
    WHERE ghl_id = TRIM(NEW.payload->>'contact_id')
    LIMIT 1;

    IF v_contato_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar oportunidade_id
    DECLARE
        v_opp_pk_id UUID;
    BEGIN
        SELECT id INTO v_opp_pk_id
        FROM oportunidades
        WHERE ghl_opportunity_id = v_opp_id
        LIMIT 1;

        IF v_opp_pk_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- UPSERT em vendas_fechamento com valores corretos
        INSERT INTO vendas_fechamento (
            oportunidade_id, contato_id,
            nome_contratante, cpf_cnpj_contratante,
            logradouro_rua_avenida, numero_endereco, complemento_endereco,
            bairro, municipio, estado_uf, cep,
            produto_vendido, observacoes_venda,
            forma_pagamento,
            valor_entrada, numero_parcelas, valor_parcela,
            data_pagamento_entrada
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
            v_data_pagamento
        )
        ON CONFLICT (oportunidade_id) DO UPDATE SET
            nome_contratante = COALESCE(EXCLUDED.nome_contratante, vendas_fechamento.nome_contratante),
            cpf_cnpj_contratante = COALESCE(EXCLUDED.cpf_cnpj_contratante, vendas_fechamento.cpf_cnpj_contratante),
            logradouro_rua_avenida = COALESCE(EXCLUDED.logradouro_rua_avenida, vendas_fechamento.logradouro_rua_avenida),
            numero_endereco = COALESCE(EXCLUDED.numero_endereco, vendas_fechamento.numero_endereco),
            complemento_endereco = COALESCE(EXCLUDED.complemento_endereco, vendas_fechamento.complemento_endereco),
            bairro = COALESCE(EXCLUDED.bairro, vendas_fechamento.bairro),
            municipio = COALESCE(EXCLUDED.municipio, vendas_fechamento.municipio),
            estado_uf = COALESCE(EXCLUDED.estado_uf, vendas_fechamento.estado_uf),
            cep = COALESCE(EXCLUDED.cep, vendas_fechamento.cep),
            produto_vendido = COALESCE(EXCLUDED.produto_vendido, vendas_fechamento.produto_vendido),
            observacoes_venda = COALESCE(EXCLUDED.observacoes_venda, vendas_fechamento.observacoes_venda),
            forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, vendas_fechamento.forma_pagamento),
            valor_entrada = COALESCE(EXCLUDED.valor_entrada, vendas_fechamento.valor_entrada),
            numero_parcelas = COALESCE(EXCLUDED.numero_parcelas, vendas_fechamento.numero_parcelas),
            valor_parcela = COALESCE(EXCLUDED.valor_parcela, vendas_fechamento.valor_parcela),
            data_pagamento_entrada = COALESCE(EXCLUDED.data_pagamento_entrada, vendas_fechamento.data_pagamento_entrada),
            updated_at = NOW();
    END;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log do erro mas não falha o webhook inteiro
    RAISE WARNING 'Erro ao extrair vendas_fechamento: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- ============================================================
-- Backfill: Reprocessar webhooks com dados de faturamento REAIS
-- ============================================================

WITH webhooks_com_faturamento AS (
    SELECT DISTINCT ON (w.id)
        w.id,
        w.payload,
        TRIM(w.payload->>'id') as opp_id,
        TRIM(w.payload->>'contact_id') as contact_ghl_id
    FROM webhooks_ghl w
    WHERE w.payload->>'id' IS NOT NULL
      AND (
          w.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}' IS NOT NULL
          OR w.payload->'customData'->>'{{opportunity.numero_parcelas}}' IS NOT NULL
          OR w.payload->'customData'->>'{{opportunity.valor_parcela}}' IS NOT NULL
          OR w.payload->'customData'->>'{{opportunity.data_pagamento_entrada}}' IS NOT NULL
      )
    ORDER BY w.id, w.created_at DESC
)
INSERT INTO vendas_fechamento (
    oportunidade_id, contato_id,
    nome_contratante, cpf_cnpj_contratante,
    logradouro_rua_avenida, numero_endereco, complemento_endereco,
    bairro, municipio, estado_uf, cep,
    produto_vendido, observacoes_venda,
    forma_pagamento,
    valor_entrada, numero_parcelas, valor_parcela,
    data_pagamento_entrada
)
SELECT DISTINCT
    o.id as oportunidade_id,
    c.id as contato_id,
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.nome_contratante}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.cpf_ou_cnpj_do_contratante}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.logradouro_rua_avenida}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.numero_endereco}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.complemento_do_endereo}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.bairro}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.municipio}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.estado_uf}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.cep}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.produto_vendido}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.observacoes_venda}}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.forma_pagamento}}'), ''),
    COALESCE((NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}'), ''))::DECIMAL, 0),
    COALESCE((NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.numero_parcelas}}'), ''))::INTEGER, 0),
    COALESCE((NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.valor_parcela}}'), ''))::DECIMAL, 0),
    NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_pagamento_entrada}}'), '')::TIMESTAMPTZ
FROM webhooks_com_faturamento w
INNER JOIN oportunidades o ON o.ghl_opportunity_id = w.opp_id
INNER JOIN contatos c ON c.ghl_id = w.contact_ghl_id
ON CONFLICT (oportunidade_id) DO UPDATE SET
    nome_contratante = COALESCE(EXCLUDED.nome_contratante, vendas_fechamento.nome_contratante),
    cpf_cnpj_contratante = COALESCE(EXCLUDED.cpf_cnpj_contratante, vendas_fechamento.cpf_cnpj_contratante),
    logradouro_rua_avenida = COALESCE(EXCLUDED.logradouro_rua_avenida, vendas_fechamento.logradouro_rua_avenida),
    numero_endereco = COALESCE(EXCLUDED.numero_endereco, vendas_fechamento.numero_endereco),
    complemento_endereco = COALESCE(EXCLUDED.complemento_endereco, vendas_fechamento.complemento_endereco),
    bairro = COALESCE(EXCLUDED.bairro, vendas_fechamento.bairro),
    municipio = COALESCE(EXCLUDED.municipio, vendas_fechamento.municipio),
    estado_uf = COALESCE(EXCLUDED.estado_uf, vendas_fechamento.estado_uf),
    cep = COALESCE(EXCLUDED.cep, vendas_fechamento.cep),
    produto_vendido = COALESCE(EXCLUDED.produto_vendido, vendas_fechamento.produto_vendido),
    observacoes_venda = COALESCE(EXCLUDED.observacoes_venda, vendas_fechamento.observacoes_venda),
    forma_pagamento = COALESCE(EXCLUDED.forma_pagamento, vendas_fechamento.forma_pagamento),
    valor_entrada = COALESCE(EXCLUDED.valor_entrada, vendas_fechamento.valor_entrada),
    numero_parcelas = COALESCE(EXCLUDED.numero_parcelas, vendas_fechamento.numero_parcelas),
    valor_parcela = COALESCE(EXCLUDED.valor_parcela, vendas_fechamento.valor_parcela),
    data_pagamento_entrada = COALESCE(EXCLUDED.data_pagamento_entrada, vendas_fechamento.data_pagamento_entrada),
    updated_at = NOW();
