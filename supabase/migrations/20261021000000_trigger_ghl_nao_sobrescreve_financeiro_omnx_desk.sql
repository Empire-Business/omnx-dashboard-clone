-- 2026-08-31 - O webhook do GHL nao sobrescreve mais o financeiro de venda do omnx-desk.
--
-- Sintoma: agosto/2026 fechou com R$ 108.068 no dashboard contra R$ 266.000 reais.
-- Duas das sete vendas do mes estavam com o valor esmagado:
--   opp 8ba650b9 -> R$ 48,00 no lugar de R$ 48.000,00
--   opp 27343eb6 -> R$ 28.020,00 no lugar de R$ 48.000,00
--
-- Causa: no GHL os campos financeiros da oportunidade sao preenchidos a mao e, na
-- pratica, EM MILHARES - o webhook chega com `valor_a_ser_pago_de_entrada = "20"`
-- e `valor_parcela = "5.6"` para uma venda de R$ 20.000 + 5x R$ 5.600 (conferido
-- nos webhooks de 13/08, 25/08 e 26/08). Este trigger gravava o numero cru por
-- cima do que o omnx-desk ja havia sincronizado corretamente, e `valor_faturado`,
-- por ser coluna GERADA (entrada + parcelas x valor_parcela), seguia junto.
--
-- Correcao: no ON CONFLICT, os cinco campos financeiros passam a ser PRESERVADOS
-- quando a linha existente tem `origem` do desk. Para venda que nao vem do desk
-- (origem 'ghl'), nada muda - o webhook continua sendo a unica fonte.
--
-- Idempotente: so CREATE OR REPLACE da funcao. Nenhuma DDL destrutiva.

CREATE OR REPLACE FUNCTION public.extrair_vendas_fechamento_do_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_opp_id TEXT;
    v_contato_id UUID;
    v_opp_pk_id UUID;
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
    v_link_gravacao_call TEXT;
BEGIN
    v_opp_id := TRIM(NEW.payload->>'id');
    IF v_opp_id IS NULL OR v_opp_id = '' THEN
        RETURN NEW;
    END IF;

    -- Campos financeiros
    v_valor_entrada := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}'), '')::DECIMAL,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.valor_a_ser_pago_de_entrada }}'), '')::DECIMAL
    );
    v_numero_parcelas := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_parcelas}}'), '')::INTEGER,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_parcelas }}'), '')::INTEGER
    );
    v_valor_parcela := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_parcela}}'), '')::DECIMAL,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.valor_parcela }}'), '')::DECIMAL
    );
    v_data_pagamento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_pagamento_entrada}}'), '')::TIMESTAMPTZ
    );

    -- Campos contratuais
    v_nome_contratante := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.nome_contratante }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.nome_contratante}}'), '')
    );
    v_cpf_cnpj := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cpf_ou_cnpj_do_contratante}}'), '')
    );
    v_produto_vendido := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.produto_que_foi_vendido }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.produto_que_foi_vendido}}'), '')
    );
    v_forma_pagamento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.forma_de_pagamento }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.forma_de_pagamento}}'), '')
    );
    v_endereco := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.logradouro_rua_avenida}}'), '')
    );
    v_numero := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_endereco }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_endereco}}'), '')
    );
    v_complemento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.complemento_do_endereo}}'), '')
    );
    v_bairro := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.bairro }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.bairro}}'), '')
    );
    v_municipio := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.municipio }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.municipio}}'), '')
    );
    v_estado := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.estado_uf }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.estado_uf}}'), '')
    );
    v_cep := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cep }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cep}}'), '')
    );
    v_observacoes := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.observacoes_venda }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.observacoes_venda}}'), '')
    );
    v_op_vencimentos := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_vencimentos_e_parcelas}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.op_vencimentos_e_parcelas }}'), '')
    );
    v_link_contrato := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.op_link_do_contrato_assinado }}'), '')
    );
    v_data_assinatura := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_da_assinatura_do_contrato }}'), '')::DATE
    );
    v_link_gravacao_call := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.link_da_gravao_da_call_de_vendas}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.link_da_gravao_da_call_de_vendas }}'), '')
    );

    -- Ignorar webhooks sem qualquer informação de vendas/contrato relevante
    IF v_valor_entrada IS NULL
       AND v_numero_parcelas IS NULL
       AND v_valor_parcela IS NULL
       AND v_data_pagamento IS NULL
       AND v_nome_contratante IS NULL
       AND v_cpf_cnpj IS NULL
       AND v_produto_vendido IS NULL
       AND v_forma_pagamento IS NULL
       AND v_endereco IS NULL
       AND v_numero IS NULL
       AND v_complemento IS NULL
       AND v_bairro IS NULL
       AND v_municipio IS NULL
       AND v_estado IS NULL
       AND v_cep IS NULL
       AND v_observacoes IS NULL
       AND v_op_vencimentos IS NULL
       AND v_link_contrato IS NULL
       AND v_data_assinatura IS NULL
       AND v_link_gravacao_call IS NULL
    THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_contato_id
    FROM contatos
    WHERE ghl_id = TRIM(NEW.payload->>'contact_id')
    LIMIT 1;

    SELECT id INTO v_opp_pk_id
    FROM oportunidades
    WHERE ghl_opportunity_id = v_opp_id
    LIMIT 1;

    IF v_opp_pk_id IS NULL OR v_contato_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO vendas_fechamento (
        oportunidade_id,
        contato_id,
        nome_contratante,
        cpf_cnpj_contratante,
        logradouro_rua_avenida,
        numero_endereco,
        complemento_endereco,
        bairro,
        municipio,
        estado_uf,
        cep,
        produto_vendido,
        observacoes_venda,
        forma_pagamento,
        valor_entrada,
        numero_parcelas,
        valor_parcela,
        data_pagamento_entrada,
        op_vencimentos_parcelas,
        op_link_do_contrato_assinado,
        data_da_assinatura_do_contrato,
        link_gravacao_call_vendas
    ) VALUES (
        v_opp_pk_id,
        v_contato_id,
        v_nome_contratante,
        v_cpf_cnpj,
        v_endereco,
        v_numero,
        v_complemento,
        v_bairro,
        v_municipio,
        v_estado,
        v_cep,
        v_produto_vendido,
        v_observacoes,
        v_forma_pagamento,
        v_valor_entrada,
        v_numero_parcelas,
        v_valor_parcela,
        v_data_pagamento,
        v_op_vencimentos,
        v_link_contrato,
        v_data_assinatura,
        v_link_gravacao_call
    )
    ON CONFLICT (oportunidade_id) DO UPDATE SET
        contato_id                     = COALESCE(EXCLUDED.contato_id,                     vendas_fechamento.contato_id),
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
        -- Financeiro: quando a venda veio do omnx-desk, o desk E a fonte de verdade.
        -- Ele manda o cronograma inteiro em `pagamentos` e as colunas derivadas ja
        -- saem certas de `crm-registrar-venda`. O webhook do GHL traz os mesmos
        -- campos preenchidos a mao pelo closer, muitas vezes EM MILHARES
        -- ("20" para R$ 20.000, "5.6" para R$ 5.600) - e, como o ultimo webhook
        -- vencia, o valor bom era substituido pelo valor cru. Foi assim que duas
        -- vendas de R$ 48.000 de agosto/2026 viraram R$ 48,00 e R$ 28.020,00 no
        -- dashboard (`valor_faturado` e coluna GERADA a partir destes campos).
        forma_pagamento                = CASE WHEN vendas_fechamento.origem IN ('omnx_desk', 'empiredesk')
                                              THEN vendas_fechamento.forma_pagamento
                                              ELSE COALESCE(EXCLUDED.forma_pagamento, vendas_fechamento.forma_pagamento) END,
        valor_entrada                  = CASE WHEN vendas_fechamento.origem IN ('omnx_desk', 'empiredesk')
                                              THEN vendas_fechamento.valor_entrada
                                              ELSE COALESCE(EXCLUDED.valor_entrada, vendas_fechamento.valor_entrada) END,
        numero_parcelas                = CASE WHEN vendas_fechamento.origem IN ('omnx_desk', 'empiredesk')
                                              THEN vendas_fechamento.numero_parcelas
                                              ELSE COALESCE(EXCLUDED.numero_parcelas, vendas_fechamento.numero_parcelas) END,
        valor_parcela                  = CASE WHEN vendas_fechamento.origem IN ('omnx_desk', 'empiredesk')
                                              THEN vendas_fechamento.valor_parcela
                                              ELSE COALESCE(EXCLUDED.valor_parcela, vendas_fechamento.valor_parcela) END,
        data_pagamento_entrada         = CASE WHEN vendas_fechamento.origem IN ('omnx_desk', 'empiredesk')
                                              THEN vendas_fechamento.data_pagamento_entrada
                                              ELSE COALESCE(EXCLUDED.data_pagamento_entrada, vendas_fechamento.data_pagamento_entrada) END,
        op_vencimentos_parcelas        = COALESCE(EXCLUDED.op_vencimentos_parcelas,        vendas_fechamento.op_vencimentos_parcelas),
        op_link_do_contrato_assinado   = COALESCE(EXCLUDED.op_link_do_contrato_assinado,   vendas_fechamento.op_link_do_contrato_assinado),
        data_da_assinatura_do_contrato = COALESCE(EXCLUDED.data_da_assinatura_do_contrato, vendas_fechamento.data_da_assinatura_do_contrato),
        link_gravacao_call_vendas      = COALESCE(EXCLUDED.link_gravacao_call_vendas,      vendas_fechamento.link_gravacao_call_vendas),
        updated_at                     = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Erro ao extrair vendas_fechamento: %', SQLERRM;
    RETURN NEW;
END;
$function$

;
