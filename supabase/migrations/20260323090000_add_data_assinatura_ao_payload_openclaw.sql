-- Migration: Adicionar data_da_assinatura_do_contrato ao payload do webhook OpenClaw
--
-- MOTIVO: Campo adicionado à tabela em 20260323080000 mas não estava
-- incluído no payload enviado ao OpenClaw.
--
-- TIPO: DATE — sem timezone, usar TO_CHAR direto (sem AT TIME ZONE).
-- Formato enviado: DD/MM/AAAA (ex: "23/03/2026")

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contato   RECORD;
  v_opp       RECORD;
  v_faturado  DECIMAL;
  v_payload   JSONB;
BEGIN
  -- GUARDA DE IDEMPOTÊNCIA
  IF TG_OP = 'INSERT' THEN
    IF NEW.op_link_do_contrato_assinado IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.op_link_do_contrato_assinado IS NULL
            AND NEW.op_link_do_contrato_assinado IS NOT NULL) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- BUSCAR DADOS RELACIONADOS
  SELECT nome, email, telefone
  INTO v_contato
  FROM contatos
  WHERE id = NEW.contato_id
  LIMIT 1;

  SELECT ghl_opportunity_id, pipeline_name
  INTO v_opp
  FROM oportunidades
  WHERE id = NEW.oportunidade_id
  LIMIT 1;

  -- CALCULAR VALOR FATURADO
  v_faturado := COALESCE(NEW.valor_entrada, 0)
              + (COALESCE(NEW.numero_parcelas, 0) * COALESCE(NEW.valor_parcela, 0));

  -- MONTAR PAYLOAD
  v_payload := jsonb_build_object(
    -- Metadados
    'evento',                       'contrato_assinado',
    'timestamp',                    TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),

    -- Identificação
    'nome',                         v_contato.nome,
    'email',                        v_contato.email,
    'telefone',                     v_contato.telefone,
    'ghl_opportunity_id',           v_opp.ghl_opportunity_id,
    'pipeline',                     v_opp.pipeline_name,

    -- Contratante
    'nome_contratante',             NEW.nome_contratante,
    'cpf_cnpj_contratante',         NEW.cpf_cnpj_contratante,

    -- Endereço
    'logradouro',                   NEW.logradouro_rua_avenida,
    'numero_endereco',              NEW.numero_endereco,
    'complemento',                  NEW.complemento_endereco,
    'bairro',                       NEW.bairro,
    'municipio',                    NEW.municipio,
    'estado_uf',                    NEW.estado_uf,
    'cep',                          NEW.cep,

    -- Faturamento
    'valor_faturado',               v_faturado,
    'valor_entrada',                NEW.valor_entrada,
    'numero_parcelas',              NEW.numero_parcelas,
    'valor_parcela',                NEW.valor_parcela,
    'forma_pagamento',              NEW.forma_pagamento,
    'produto_vendido',              NEW.produto_vendido,
    'data_pagamento_entrada',       CASE
                                      WHEN NEW.data_pagamento_entrada IS NOT NULL
                                      THEN TO_CHAR(NEW.data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                                      ELSE NULL
                                    END,

    -- Contrato
    'link_contrato_assinado',       NEW.op_link_do_contrato_assinado,
    'data_assinatura_contrato',     CASE
                                      WHEN NEW.data_da_assinatura_do_contrato IS NOT NULL
                                      THEN TO_CHAR(NEW.data_da_assinatura_do_contrato, 'DD/MM/YYYY')
                                      ELSE NULL
                                    END,

    -- Vencimentos e Observações
    'vencimentos_parcelas',         NEW.op_vencimentos_parcelas,
    'observacoes',                  NEW.observacoes_venda
  );

  -- HTTP POST via pg_net
  PERFORM extensions.net.http_post(
    url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body    := v_payload::text
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Erro ao notificar OpenClaw (contrato assinado): %', SQLERRM;
  RETURN NEW;
END;
$$;
