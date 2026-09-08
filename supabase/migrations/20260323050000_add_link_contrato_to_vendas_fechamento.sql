-- Migration: Adicionar op_link_do_contrato_assinado à vendas_fechamento
--
-- CONTEXTO (2026-03-23):
-- O GHL vai começar a enviar o link do contrato assinado (gerado pelo Open Claw ou similar)
-- no campo {{opportunity.op_link_do_contrato_assinado}}.
-- Precisamos capturar esse campo do webhook e armazenar em vendas_fechamento.
--
-- Nenhum backfill é necessário — o campo ainda não existe em nenhum webhook histórico.
--
-- ⚠️ ATENÇÃO: O nome exato da chave no customData ainda NÃO foi confirmado via webhook real.
-- Quando o primeiro webhook com link chegar, verificar com:
--   SELECT jsonb_object_keys(payload->'customData')
--   FROM webhooks_ghl ORDER BY created_at DESC LIMIT 1;
-- Se o nome real for diferente (ex: com espaços), criar migration de correção.

-- 1. Adiciona coluna
ALTER TABLE vendas_fechamento
  ADD COLUMN IF NOT EXISTS op_link_do_contrato_assinado TEXT;

COMMENT ON COLUMN vendas_fechamento.op_link_do_contrato_assinado IS
  'Link do contrato assinado (ex: Open Claw). Extraído do campo {{opportunity.op_link_do_contrato_assinado}} do GHL.';

-- 2. Atualiza a função do trigger
--    Baseada na versão atual (20260323030000) — adiciona v_link_contrato
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
    v_link_contrato  TEXT;     -- NOVO
    v_opp_pk_id UUID;
BEGIN
    -- Se não tem oportunidade, ignora
    v_opp_id := NEW.payload->>'id';
    IF v_opp_id IS NULL OR TRIM(v_opp_id) = '' THEN
        RETURN NEW;
    END IF;

    -- ========== CAMPOS FINANCEIROS ==========
    -- Nomes SEM espaços — confirmados via webhook real
    v_valor_entrada   := (NEW.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}')::DECIMAL;
    v_numero_parcelas := (NEW.payload->'customData'->>'{{opportunity.numero_parcelas}}')::INTEGER;
    v_valor_parcela   := (NEW.payload->'customData'->>'{{opportunity.valor_parcela}}')::DECIMAL;
    v_data_pagamento  := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ;

    -- ========== CAMPOS DE CONTRATO ==========
    -- Nomes COM espaços e "_de_"/"_que_foi_" — confirmados via webhook real
    v_nome_contratante := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.nome_contratante }}'), '');
    v_cpf_cnpj         := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), '');

    -- CORRIGIDO (20260323030000): era '{{opportunity.produto_vendido}}' — nome errado sem espaços
    v_produto_vendido  := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.produto_que_foi_vendido }}'), '');

    -- CORRIGIDO (20260323030000): era '{{opportunity.forma_pagamento}}' — nome errado
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
    -- Nome confirmado via webhook real (20260323020000)
    v_op_vencimentos := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.op_vencimentos_e_parcelas }}'), '');

    -- ========== LINK DO CONTRATO ASSINADO ==========
    -- ⚠️ Nome ainda NÃO confirmado via webhook real — pode ter espaços ao redor
    -- Tentamos sem espaços primeiro; se não funcionar, criar migration de correção
    v_link_contrato := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '');

    -- Se nenhum campo de faturamento foi preenchido, ignora
    IF v_valor_entrada IS NULL AND v_numero_parcelas IS NULL AND v_valor_parcela IS NULL AND v_data_pagamento IS NULL THEN
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
        op_link_do_contrato_assinado
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
        v_link_contrato
    )
    ON CONFLICT (oportunidade_id) DO UPDATE SET
        nome_contratante              = COALESCE(EXCLUDED.nome_contratante,              vendas_fechamento.nome_contratante),
        cpf_cnpj_contratante          = COALESCE(EXCLUDED.cpf_cnpj_contratante,          vendas_fechamento.cpf_cnpj_contratante),
        logradouro_rua_avenida        = COALESCE(EXCLUDED.logradouro_rua_avenida,        vendas_fechamento.logradouro_rua_avenida),
        numero_endereco               = COALESCE(EXCLUDED.numero_endereco,               vendas_fechamento.numero_endereco),
        complemento_endereco          = COALESCE(EXCLUDED.complemento_endereco,          vendas_fechamento.complemento_endereco),
        bairro                        = COALESCE(EXCLUDED.bairro,                        vendas_fechamento.bairro),
        municipio                     = COALESCE(EXCLUDED.municipio,                     vendas_fechamento.municipio),
        estado_uf                     = COALESCE(EXCLUDED.estado_uf,                     vendas_fechamento.estado_uf),
        cep                           = COALESCE(EXCLUDED.cep,                           vendas_fechamento.cep),
        produto_vendido               = COALESCE(EXCLUDED.produto_vendido,               vendas_fechamento.produto_vendido),
        observacoes_venda             = COALESCE(EXCLUDED.observacoes_venda,             vendas_fechamento.observacoes_venda),
        forma_pagamento               = COALESCE(EXCLUDED.forma_pagamento,               vendas_fechamento.forma_pagamento),
        valor_entrada                 = COALESCE(EXCLUDED.valor_entrada,                 vendas_fechamento.valor_entrada),
        numero_parcelas               = COALESCE(EXCLUDED.numero_parcelas,               vendas_fechamento.numero_parcelas),
        valor_parcela                 = COALESCE(EXCLUDED.valor_parcela,                 vendas_fechamento.valor_parcela),
        data_pagamento_entrada        = COALESCE(EXCLUDED.data_pagamento_entrada,        vendas_fechamento.data_pagamento_entrada),
        op_vencimentos_parcelas       = COALESCE(EXCLUDED.op_vencimentos_parcelas,       vendas_fechamento.op_vencimentos_parcelas),
        op_link_do_contrato_assinado  = COALESCE(EXCLUDED.op_link_do_contrato_assinado,  vendas_fechamento.op_link_do_contrato_assinado),
        updated_at                    = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Erro ao extrair vendas_fechamento: %', SQLERRM;
    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.extrair_vendas_fechamento_do_webhook() IS
  'Extrai dados de faturamento dos webhooks GHL → vendas_fechamento. Adicionado op_link_do_contrato_assinado (2026-03-23).';
