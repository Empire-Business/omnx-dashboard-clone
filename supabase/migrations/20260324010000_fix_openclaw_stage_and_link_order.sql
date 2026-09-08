-- Migration: Corrigir OpenClaw para disparar no drag do card sem perder o caso "link depois"
--
-- CAUSA RAIZ ENCONTRADA:
-- 1. A migration 20260321030000 criou o trigger `tr_zz_notify_openclaw_assinada`
--    em `webhooks_ghl`, mas ele reaproveitava a função
--    `notify_openclaw_contrato_assinado()`.
-- 2. Depois, a função `notify_openclaw_contrato_assinado()` foi recriada para
--    ser usada pelo trigger de `vendas_fechamento`.
-- 3. Resultado: o trigger de drag em `webhooks_ghl` continuou existindo, mas
--    apontando para uma função incompatível com o registro `NEW` de `webhooks_ghl`.
-- 4. Além disso, o fluxo ficou dependente demais da ordem dos eventos:
--    - link antes do drag
--    - drag antes do link
--    Precisamos cobrir as duas sequências.
--
-- SOLUÇÃO:
-- - Criar um helper central idempotente:
--   `processar_notificacao_openclaw_contrato_assinado()`
-- - Recriar o trigger de `vendas_fechamento` com regra:
--   só notifica se o link entrou E a oportunidade JÁ está em "Assinada"
-- - Recriar o trigger de `webhooks_ghl` com função própria:
--   ao entrar em "Assinada", tenta achar o link no webhook atual ou no histórico
-- - Idempotência central via `oportunidades.openclaw_notificado_em`

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS openclaw_notificado_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.processar_notificacao_openclaw_contrato_assinado(
  p_oportunidade_id UUID,
  p_link_contrato TEXT DEFAULT NULL,
  p_data_assinatura DATE DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_opp_id UUID;
  v_opp_ghl_id TEXT;
  v_pipeline_name TEXT;
  v_notificado_em TIMESTAMPTZ;
  v_contato_id UUID;

  v_nome TEXT;
  v_email TEXT;
  v_telefone TEXT;

  v_nome_contratante TEXT;
  v_cpf_cnpj TEXT;
  v_logradouro TEXT;
  v_numero_endereco TEXT;
  v_complemento TEXT;
  v_bairro TEXT;
  v_municipio TEXT;
  v_estado_uf TEXT;
  v_cep TEXT;
  v_valor_entrada DECIMAL;
  v_numero_parcelas INTEGER;
  v_valor_parcela DECIMAL;
  v_forma_pagamento TEXT;
  v_produto_vendido TEXT;
  v_data_pagamento TIMESTAMPTZ;
  v_link_contrato_db TEXT;
  v_data_assinatura_db DATE;
  v_vencimentos TEXT;
  v_observacoes TEXT;

  v_link_contrato TEXT;
  v_data_assinatura DATE;
  v_faturado DECIMAL;
  v_payload JSONB;
  v_request_id BIGINT;
BEGIN
  IF p_oportunidade_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT
    o.id,
    o.ghl_opportunity_id,
    o.pipeline_name,
    o.openclaw_notificado_em,
    o.contato_id
  INTO
    v_opp_id,
    v_opp_ghl_id,
    v_pipeline_name,
    v_notificado_em,
    v_contato_id
  FROM public.oportunidades o
  WHERE o.id = p_oportunidade_id
  FOR UPDATE;

  IF v_opp_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_notificado_em IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  SELECT c.nome, c.email, c.telefone
  INTO v_nome, v_email, v_telefone
  FROM public.contatos c
  WHERE c.id = v_contato_id
  LIMIT 1;

  SELECT
    vf.nome_contratante,
    vf.cpf_cnpj_contratante,
    vf.logradouro_rua_avenida,
    vf.numero_endereco,
    vf.complemento_endereco,
    vf.bairro,
    vf.municipio,
    vf.estado_uf,
    vf.cep,
    vf.valor_entrada,
    vf.numero_parcelas,
    vf.valor_parcela,
    vf.forma_pagamento,
    vf.produto_vendido,
    vf.data_pagamento_entrada,
    vf.op_link_do_contrato_assinado,
    vf.data_da_assinatura_do_contrato,
    vf.op_vencimentos_parcelas,
    vf.observacoes_venda
  INTO
    v_nome_contratante,
    v_cpf_cnpj,
    v_logradouro,
    v_numero_endereco,
    v_complemento,
    v_bairro,
    v_municipio,
    v_estado_uf,
    v_cep,
    v_valor_entrada,
    v_numero_parcelas,
    v_valor_parcela,
    v_forma_pagamento,
    v_produto_vendido,
    v_data_pagamento,
    v_link_contrato_db,
    v_data_assinatura_db,
    v_vencimentos,
    v_observacoes
  FROM public.vendas_fechamento vf
  WHERE vf.oportunidade_id = p_oportunidade_id
  LIMIT 1;

  v_link_contrato := COALESCE(
    NULLIF(TRIM(p_link_contrato), ''),
    NULLIF(TRIM(v_link_contrato_db), '')
  );
  v_data_assinatura := COALESCE(p_data_assinatura, v_data_assinatura_db);

  IF v_link_contrato IS NULL THEN
    RETURN FALSE;
  END IF;

  v_faturado := COALESCE(v_valor_entrada, 0)
              + (COALESCE(v_numero_parcelas, 0) * COALESCE(v_valor_parcela, 0));

  v_payload := jsonb_build_object(
    'evento',                   'contrato_assinado',
    'timestamp',                TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),

    'nome',                     v_nome,
    'email',                    v_email,
    'telefone',                 v_telefone,
    'ghl_opportunity_id',       v_opp_ghl_id,
    'pipeline',                 v_pipeline_name,

    'nome_contratante',         v_nome_contratante,
    'cpf_cnpj_contratante',     v_cpf_cnpj,

    'logradouro',               v_logradouro,
    'numero_endereco',          v_numero_endereco,
    'complemento',              v_complemento,
    'bairro',                   v_bairro,
    'municipio',                v_municipio,
    'estado_uf',                v_estado_uf,
    'cep',                      v_cep,

    'valor_faturado',           v_faturado,
    'valor_entrada',            v_valor_entrada,
    'numero_parcelas',          v_numero_parcelas,
    'valor_parcela',            v_valor_parcela,
    'forma_pagamento',          v_forma_pagamento,
    'produto_vendido',          v_produto_vendido,
    'data_pagamento_entrada',   CASE
                                  WHEN v_data_pagamento IS NOT NULL
                                  THEN TO_CHAR(v_data_pagamento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                                  ELSE NULL
                                END,

    'link_contrato_assinado',   v_link_contrato,
    'data_assinatura_contrato', CASE
                                  WHEN v_data_assinatura IS NOT NULL
                                  THEN TO_CHAR(v_data_assinatura, 'DD/MM/YYYY')
                                  ELSE NULL
                                END,

    'vencimentos_parcelas',     v_vencimentos,
    'observacoes',              v_observacoes
  );

  SELECT net.http_post(
    url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body    := v_payload
  ) INTO v_request_id;

  UPDATE public.oportunidades
  SET openclaw_notificado_em = NOW()
  WHERE id = v_opp_id;

  RAISE NOTICE 'OpenClaw notificado — request_id: %, opp: %', v_request_id, v_opp_ghl_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao processar OpenClaw (opp=%): % | SQLSTATE: %',
    p_oportunidade_id, SQLERRM, SQLSTATE;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.processar_notificacao_openclaw_contrato_assinado(UUID, TEXT, DATE) IS
  'Helper central idempotente do OpenClaw. Envia POST assíncrono via net.http_post e marca oportunidades.openclaw_notificado_em.';

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id TEXT;
  v_stage TEXT;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA CONSTANT TEXT := 'Assinada';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.op_link_do_contrato_assinado IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (
      OLD.op_link_do_contrato_assinado IS NULL
      AND NEW.op_link_do_contrato_assinado IS NOT NULL
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT o.pipeline_id, o.pipeline_stage_id
  INTO v_pipeline_id, v_stage
  FROM public.oportunidades o
  WHERE o.id = NEW.oportunidade_id
  LIMIT 1;

  IF v_pipeline_id IS DISTINCT FROM PIPELINE_VENDAS_SQL
     OR v_stage IS DISTINCT FROM STAGE_ASSINADA THEN
    RETURN NEW;
  END IF;

  PERFORM public.processar_notificacao_openclaw_contrato_assinado(
    NEW.oportunidade_id,
    NEW.op_link_do_contrato_assinado,
    NEW.data_da_assinatura_do_contrato
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO no trigger de vendas_fechamento para OpenClaw: % | SQLSTATE: %',
    SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado() IS
  'Trigger de vendas_fechamento: envia OpenClaw quando o link entra e a oportunidade já está em "Assinada" no pipeline Vendas SQL.';

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado_por_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp_ghl_id TEXT;
  v_oportunidade_id UUID;
  v_link_contrato TEXT;
  v_data_assinatura DATE;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA CONSTANT TEXT := 'Assinada';
BEGIN
  v_opp_ghl_id := NULLIF(TRIM(NEW.payload->>'id'), '');
  IF v_opp_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload->>'pipeline_id' IS DISTINCT FROM PIPELINE_VENDAS_SQL
     OR NEW.payload->>'pipleline_stage' IS DISTINCT FROM STAGE_ASSINADA THEN
    RETURN NEW;
  END IF;

  SELECT o.id
  INTO v_oportunidade_id
  FROM public.oportunidades o
  WHERE o.ghl_opportunity_id = v_opp_ghl_id
  LIMIT 1;

  IF v_oportunidade_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_link_contrato := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '');
  v_data_assinatura := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE;

  IF v_link_contrato IS NULL THEN
    SELECT NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '')
    INTO v_link_contrato
    FROM public.webhooks_ghl w
    WHERE w.payload->>'id' = v_opp_ghl_id
      AND NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '') IS NOT NULL
    ORDER BY w.created_at DESC
    LIMIT 1;
  END IF;

  IF v_data_assinatura IS NULL THEN
    SELECT NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE
    INTO v_data_assinatura
    FROM public.webhooks_ghl w
    WHERE w.payload->>'id' = v_opp_ghl_id
      AND NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '') IS NOT NULL
    ORDER BY w.created_at DESC
    LIMIT 1;
  END IF;

  PERFORM public.processar_notificacao_openclaw_contrato_assinado(
    v_oportunidade_id,
    v_link_contrato,
    v_data_assinatura
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO no trigger de stage para OpenClaw (opp_ghl=%): % | SQLSTATE: %',
    v_opp_ghl_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado_por_stage() IS
  'Trigger de webhooks_ghl: quando a oportunidade entra em "Assinada", procura link/data no webhook atual ou histórico e chama o helper central do OpenClaw.';

DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;

CREATE TRIGGER tr_notify_openclaw_contrato_assinado
  AFTER INSERT OR UPDATE ON public.vendas_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_openclaw_contrato_assinado();

COMMENT ON TRIGGER tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento IS
  'Dispara OpenClaw quando o link entra em vendas_fechamento e a oportunidade já está em "Assinada".';

DROP TRIGGER IF EXISTS tr_zz_notify_openclaw_assinada ON public.webhooks_ghl;

CREATE TRIGGER tr_zz_notify_openclaw_assinada
  AFTER INSERT ON public.webhooks_ghl
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_openclaw_contrato_assinado_por_stage();

COMMENT ON TRIGGER tr_zz_notify_openclaw_assinada ON public.webhooks_ghl IS
  'Dispara OpenClaw quando chega webhook de stage "Assinada", buscando link/data no histórico se necessário.';
