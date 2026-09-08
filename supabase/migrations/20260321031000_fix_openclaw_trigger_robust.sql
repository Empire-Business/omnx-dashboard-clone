-- Migration: Corrigir trigger OpenClaw — evitar erro de RECORD vazio + diagnóstico
--
-- BUG ENCONTRADO (2026-03-21):
-- SELECT vf.* INTO v_vf → quando vendas_fechamento não existe para a opp,
-- v_vf é um RECORD não-atribuído. Acessar v_vf.campo causa:
--   "record 'v_vf' is not assigned yet"
-- O EXCEPTION engole o erro → OpenClaw nunca é notificado.
--
-- CORREÇÃO: usar variáveis individuais (não RECORD) para vendas_fechamento.
-- Se SELECT INTO não encontrar nada, as variáveis ficam NULL (sem erro).

-- ============================================================
-- 1. Função corrigida — variáveis individuais, sem RECORD
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_opp_id      TEXT;
  v_opp_pk_id   UUID;
  v_opp_ghl_id  TEXT;
  v_pipeline_name TEXT;
  v_notificado  TIMESTAMPTZ;

  v_nome        TEXT;
  v_email       TEXT;
  v_telefone    TEXT;

  -- vendas_fechamento — variáveis individuais (não RECORD!)
  v_nome_contratante  TEXT;
  v_cpf_cnpj          TEXT;
  v_logradouro        TEXT;
  v_numero_endereco   TEXT;
  v_complemento       TEXT;
  v_bairro            TEXT;
  v_municipio         TEXT;
  v_estado_uf         TEXT;
  v_cep               TEXT;
  v_valor_entrada     DECIMAL;
  v_numero_parcelas   INTEGER;
  v_valor_parcela     DECIMAL;
  v_forma_pagamento   TEXT;
  v_produto_vendido   TEXT;
  v_data_pagamento    TIMESTAMPTZ;
  v_link_contrato     TEXT;
  v_data_assinatura   DATE;
  v_vencimentos       TEXT;
  v_observacoes       TEXT;

  v_faturado    DECIMAL;
  v_payload     JSONB;
  v_request_id  BIGINT;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA      CONSTANT TEXT := 'Assinada';
BEGIN
  -- ====== FILTRO: só "Assinada" no pipeline "Vendas SQL" ======
  v_opp_id := NEW.payload->>'id';
  IF v_opp_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.payload->>'pipeline_id'     IS DISTINCT FROM PIPELINE_VENDAS_SQL
  OR NEW.payload->>'pipleline_stage' IS DISTINCT FROM STAGE_ASSINADA
  THEN
    RETURN NEW;
  END IF;

  -- ====== BUSCAR OPORTUNIDADE ======
  SELECT o.id, o.ghl_opportunity_id, o.pipeline_name, o.openclaw_notificado_em
  INTO v_opp_pk_id, v_opp_ghl_id, v_pipeline_name, v_notificado
  FROM oportunidades o
  WHERE o.ghl_opportunity_id = v_opp_id
  LIMIT 1;

  IF v_opp_pk_id IS NULL THEN
    RAISE WARNING 'OpenClaw: opp % não encontrada em oportunidades', v_opp_id;
    RETURN NEW;
  END IF;

  -- ====== IDEMPOTÊNCIA ======
  IF v_notificado IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ====== BUSCAR CONTATO ======
  SELECT c.nome, c.email, c.telefone
  INTO v_nome, v_email, v_telefone
  FROM contatos c
  JOIN oportunidades o ON o.contato_id = c.id
  WHERE o.id = v_opp_pk_id;

  -- ====== BUSCAR VENDAS_FECHAMENTO (variáveis individuais — sem erro se não existir) ======
  SELECT
    nome_contratante, cpf_cnpj_contratante,
    logradouro_rua_avenida, numero_endereco, complemento_endereco,
    bairro, municipio, estado_uf, cep,
    valor_entrada, numero_parcelas, valor_parcela,
    forma_pagamento, produto_vendido, data_pagamento_entrada,
    op_link_do_contrato_assinado, data_da_assinatura_do_contrato,
    op_vencimentos_parcelas, observacoes_venda
  INTO
    v_nome_contratante, v_cpf_cnpj,
    v_logradouro, v_numero_endereco, v_complemento,
    v_bairro, v_municipio, v_estado_uf, v_cep,
    v_valor_entrada, v_numero_parcelas, v_valor_parcela,
    v_forma_pagamento, v_produto_vendido, v_data_pagamento,
    v_link_contrato, v_data_assinatura,
    v_vencimentos, v_observacoes
  FROM vendas_fechamento
  WHERE oportunidade_id = v_opp_pk_id;
  -- Se não encontrar: todas as variáveis ficam NULL (sem erro)

  -- ====== CALCULAR VALOR FATURADO ======
  v_faturado := COALESCE(v_valor_entrada, 0)
              + (COALESCE(v_numero_parcelas, 0) * COALESCE(v_valor_parcela, 0));

  -- ====== MONTAR PAYLOAD ======
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

  -- ====== HTTP POST via pg_net ======
  SELECT net.http_post(
    url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body    := v_payload
  ) INTO v_request_id;

  -- ====== MARCAR COMO NOTIFICADO ======
  UPDATE oportunidades SET openclaw_notificado_em = NOW()
  WHERE id = v_opp_pk_id;

  RAISE NOTICE 'OpenClaw OK — request_id=%, opp=%, nome=%', v_request_id, v_opp_ghl_id, v_nome;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO OpenClaw: % | SQLSTATE=% | opp=% | step=payload_or_http',
    SQLERRM, SQLSTATE, v_opp_id;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Diagnóstico: webhooks recentes da Juliana + todos com stage Assinada
-- ============================================================
DO $$
DECLARE v_rec RECORD;
BEGIN
  RAISE NOTICE '=== WEBHOOKS com stage Assinada (últimas 6h) ===';
  FOR v_rec IN
    SELECT
      w.id,
      w.created_at,
      w.payload->>'id' AS opp_id,
      w.payload->>'pipeline_id' AS pipeline_id,
      w.payload->>'pipleline_stage' AS stage,
      w.payload->>'status' AS status
    FROM webhooks_ghl w
    WHERE w.payload->>'pipleline_stage' = 'Assinada'
      AND w.created_at > NOW() - INTERVAL '6 hours'
    ORDER BY w.created_at DESC
    LIMIT 10
  LOOP
    RAISE NOTICE 'opp=% | pipeline=% | stage=% | status=% | criado=%',
      v_rec.opp_id, v_rec.pipeline_id, v_rec.stage, v_rec.status, v_rec.created_at;
  END LOOP;

  RAISE NOTICE '=== WEBHOOKS de Juliana Maia (todas as opps, últimas 6h) ===';
  FOR v_rec IN
    SELECT
      w.id,
      w.created_at,
      w.payload->>'id' AS opp_id,
      w.payload->>'pipeline_id' AS pipeline_id,
      w.payload->>'pipleline_stage' AS stage,
      w.payload->>'status' AS status
    FROM webhooks_ghl w
    WHERE w.payload->>'contact_id' = 'RAzMsfQ5YgBjxby1ZEvE'
      AND w.created_at > NOW() - INTERVAL '6 hours'
    ORDER BY w.created_at DESC
    LIMIT 15
  LOOP
    RAISE NOTICE 'opp=% | pipeline=% | stage=% | status=% | criado=%',
      v_rec.opp_id, v_rec.pipeline_id, v_rec.stage, v_rec.status, v_rec.created_at;
  END LOOP;

  RAISE NOTICE '=== OPORTUNIDADES notificadas (openclaw_notificado_em IS NOT NULL) ===';
  FOR v_rec IN
    SELECT o.ghl_opportunity_id, o.pipeline_name, o.openclaw_notificado_em, c.nome
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.openclaw_notificado_em IS NOT NULL
    ORDER BY o.openclaw_notificado_em DESC
    LIMIT 5
  LOOP
    RAISE NOTICE 'opp=% | pipeline=% | notificado=% | nome=%',
      v_rec.ghl_opportunity_id, v_rec.pipeline_name, v_rec.openclaw_notificado_em, v_rec.nome;
  END LOOP;
END $$;
