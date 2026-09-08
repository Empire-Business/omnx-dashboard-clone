-- Migration: Recriar trigger OpenClaw com pg_net CORRETO
--
-- BUGS CORRIGIDOS:
-- 1. extensions.net.http_post() → net.http_post()
--    Todas as funções que FUNCIONAM neste projeto (crons, backfills) usam net.http_post.
--    O trigger anterior usava extensions.net.http_post — caminho inexistente.
--    O EXCEPTION WHEN OTHERS engolia o erro silenciosamente.
-- 2. body := v_payload::text → body := v_payload (jsonb nativo)
--    net.http_post espera body como jsonb, não text.
--
-- A migration 20260323200000 dropou o trigger anterior.
-- Esta migration recria função + trigger com as correções.

-- ============================================================
-- 1. Recriar a função com net.http_post CORRETO
-- ============================================================

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
  v_request_id BIGINT;
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
    'evento',                       'contrato_assinado',
    'timestamp',                    TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),

    'nome',                         v_contato.nome,
    'email',                        v_contato.email,
    'telefone',                     v_contato.telefone,
    'ghl_opportunity_id',           v_opp.ghl_opportunity_id,
    'pipeline',                     v_opp.pipeline_name,

    'nome_contratante',             NEW.nome_contratante,
    'cpf_cnpj_contratante',         NEW.cpf_cnpj_contratante,

    'logradouro',                   NEW.logradouro_rua_avenida,
    'numero_endereco',              NEW.numero_endereco,
    'complemento',                  NEW.complemento_endereco,
    'bairro',                       NEW.bairro,
    'municipio',                    NEW.municipio,
    'estado_uf',                    NEW.estado_uf,
    'cep',                          NEW.cep,

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

    'link_contrato_assinado',       NEW.op_link_do_contrato_assinado,
    'data_assinatura_contrato',     CASE
                                      WHEN NEW.data_da_assinatura_do_contrato IS NOT NULL
                                      THEN TO_CHAR(NEW.data_da_assinatura_do_contrato, 'DD/MM/YYYY')
                                      ELSE NULL
                                    END,

    'vencimentos_parcelas',         NEW.op_vencimentos_parcelas,
    'observacoes',                  NEW.observacoes_venda
  );

  -- HTTP POST via pg_net — CORRETO: net.http_post (não extensions.net.http_post)
  SELECT net.http_post(
    url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body    := v_payload
  ) INTO v_request_id;

  RAISE NOTICE 'OpenClaw notificado — request_id: %, opp: %', v_request_id, v_opp.ghl_opportunity_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao notificar OpenClaw (contrato assinado): % | SQLSTATE: %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Recriar o trigger
-- ============================================================

DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;

CREATE TRIGGER tr_notify_openclaw_contrato_assinado
  AFTER INSERT OR UPDATE ON public.vendas_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_openclaw_contrato_assinado();
