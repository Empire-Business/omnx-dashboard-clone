-- Migration: Criar trigger para auto-preencher vendas_fechamento
--
-- PROBLEMA: A tabela vendas_fechamento está vazia. Deveria ser preenchida
-- automaticamente quando dados de faturamento (data_pagamento_entrada, valor_entrada,
-- numero_parcelas, valor_parcela) chegam nos webhooks do GHL.
--
-- SOLUÇÃO: Criar trigger que:
-- 1. Detecta quando oportunidade tem dados de faturamento no webhook
-- 2. Extrai os dados (valor_entrada, parcelas, data_pagamento)
-- 3. Insere/atualiza em vendas_fechamento
-- 4. Calcula valor_faturado automaticamente

-- ============================================================
-- Função para extrair dados de faturamento e preencher tabela
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

    -- Extrair campos de faturamento do payload
    v_valor_entrada := (NEW.payload->'customData'->>'{{ opportunity.valor_entrada }}')::DECIMAL;
    v_numero_parcelas := (NEW.payload->'customData'->>'{{ opportunity.numero_parcelas }}')::INTEGER;
    v_valor_parcela := (NEW.payload->'customData'->>'{{ opportunity.valor_parcela }}')::DECIMAL;
    v_data_pagamento := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ;

    -- Extrair campos de contrato
    v_nome_contratante := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.nome_contratante }}'), '');
    v_cpf_cnpj := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cpf_cnpj_contratante }}'), '');
    v_produto_vendido := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.produto_vendido }}'), '');
    v_forma_pagamento := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.forma_pagamento }}'), '');
    v_endereco := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}'), '');
    v_numero := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_endereco }}'), '');
    v_complemento := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.complemento_endereco }}'), '');
    v_bairro := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.bairro }}'), '');
    v_municipio := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.municipio }}'), '');
    v_estado := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.estado_uf }}'), '');
    v_cep := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cep }}'), '');
    v_observacoes := NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.observacoes_venda }}'), '');

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

        -- UPSERT em vendas_fechamento
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
-- Trigger para disparar função após INSERT em webhooks_ghl
-- ============================================================

DROP TRIGGER IF EXISTS tr_extrair_vendas_fechamento ON public.webhooks_ghl;

CREATE TRIGGER tr_extrair_vendas_fechamento
    AFTER INSERT ON public.webhooks_ghl
    FOR EACH ROW
    EXECUTE FUNCTION public.extrair_vendas_fechamento_do_webhook();

-- ============================================================
-- Verificar se constraint já existe, se não adiciona
-- que oportunidade_id é única (cada venda = 1 oportunidade)
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'uk_vendas_fechamento_oportunidade_id'
        AND table_name = 'vendas_fechamento'
    ) THEN
        ALTER TABLE vendas_fechamento
            ADD CONSTRAINT uk_vendas_fechamento_oportunidade_id UNIQUE (oportunidade_id);
    END IF;
END $$;

-- Comentário de documentação
COMMENT ON FUNCTION public.extrair_vendas_fechamento_do_webhook() IS 'Função que extrai dados de faturamento dos webhooks GHL e preenche tabela vendas_fechamento automaticamente. Dispara quando oportunidade tem campos de contrato/faturamento preenchidos.';

COMMENT ON TRIGGER tr_extrair_vendas_fechamento ON public.webhooks_ghl IS 'Trigger que executa extrair_vendas_fechamento_do_webhook após cada INSERT em webhooks_ghl.';
