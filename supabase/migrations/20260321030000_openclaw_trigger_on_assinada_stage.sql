-- Migration: OpenClaw dispara quando webhook chega com stage "Assinada"
--
-- MUDANÇA DE LÓGICA (2026-03-21):
-- ANTES: trigger em vendas_fechamento, condição = link NULL → NOT NULL
--   Problema: link podia não estar no webhook, ou vendas_fechamento nem existia ainda
-- AGORA: trigger em webhooks_ghl, condição = stage "Assinada" no pipeline "Vendas SQL"
--   Basta arrastar para "Assinada" no GHL → OpenClaw é notificado
--
-- IDEMPOTÊNCIA: coluna openclaw_notificado_em em oportunidades
--   Se já notificou, não reenvia.
--   Para re-disparar: UPDATE oportunidades SET openclaw_notificado_em = NULL WHERE ...
--
-- ORDEM DE TRIGGERS em webhooks_ghl (alfabética):
--   1. auto_extrair_dados_ghl → popula contatos + oportunidades
--   2. tr_enqueue_contact_opp_sync → fila de sync
--   3. tr_extrair_vendas_fechamento → popula vendas_fechamento
--   4. tr_zz_notify_openclaw_assinada → OpenClaw (este — roda por último)

-- ============================================================
-- 1. Coluna de rastreamento em oportunidades
-- ============================================================
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS openclaw_notificado_em TIMESTAMPTZ;

-- ============================================================
-- 2. Remover trigger antigo em vendas_fechamento
-- ============================================================
DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;

-- ============================================================
-- 3. Nova função — dispara por stage "Assinada"
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_opp_id TEXT;
  v_contato     RECORD;
  v_opp         RECORD;
  v_vf          RECORD;
  v_faturado    DECIMAL;
  v_payload     JSONB;
  v_request_id  BIGINT;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA      CONSTANT TEXT := 'Assinada';
BEGIN
  -- ====== FILTRO: só stage "Assinada" do pipeline "Vendas SQL" ======
  v_opp_id := NEW.payload->>'id';
  IF v_opp_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.payload->>'pipeline_id'     IS DISTINCT FROM PIPELINE_VENDAS_SQL
  OR NEW.payload->>'pipleline_stage' IS DISTINCT FROM STAGE_ASSINADA
  THEN
    RETURN NEW;
  END IF;

  -- ====== BUSCAR OPORTUNIDADE ======
  SELECT o.id, o.ghl_opportunity_id, o.pipeline_name, o.openclaw_notificado_em
  INTO v_opp
  FROM oportunidades o
  WHERE o.ghl_opportunity_id = v_opp_id
  LIMIT 1;

  IF v_opp.id IS NULL THEN
    RAISE WARNING 'OpenClaw: oportunidade % não encontrada', v_opp_id;
    RETURN NEW;
  END IF;

  -- ====== IDEMPOTÊNCIA ======
  IF v_opp.openclaw_notificado_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ====== BUSCAR CONTATO ======
  SELECT c.nome, c.email, c.telefone
  INTO v_contato
  FROM contatos c
  JOIN oportunidades o ON o.contato_id = c.id
  WHERE o.id = v_opp.id
  LIMIT 1;

  -- ====== BUSCAR VENDAS_FECHAMENTO (pode não existir) ======
  SELECT vf.*
  INTO v_vf
  FROM vendas_fechamento vf
  WHERE vf.oportunidade_id = v_opp.id
  LIMIT 1;

  -- ====== CALCULAR VALOR FATURADO ======
  v_faturado := COALESCE(v_vf.valor_entrada, 0)
              + (COALESCE(v_vf.numero_parcelas, 0) * COALESCE(v_vf.valor_parcela, 0));

  -- ====== MONTAR PAYLOAD ======
  v_payload := jsonb_build_object(
    'evento',                       'contrato_assinado',
    'timestamp',                    TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),

    'nome',                         v_contato.nome,
    'email',                        v_contato.email,
    'telefone',                     v_contato.telefone,
    'ghl_opportunity_id',           v_opp.ghl_opportunity_id,
    'pipeline',                     v_opp.pipeline_name,

    'nome_contratante',             v_vf.nome_contratante,
    'cpf_cnpj_contratante',         v_vf.cpf_cnpj_contratante,

    'logradouro',                   v_vf.logradouro_rua_avenida,
    'numero_endereco',              v_vf.numero_endereco,
    'complemento',                  v_vf.complemento_endereco,
    'bairro',                       v_vf.bairro,
    'municipio',                    v_vf.municipio,
    'estado_uf',                    v_vf.estado_uf,
    'cep',                          v_vf.cep,

    'valor_faturado',               v_faturado,
    'valor_entrada',                v_vf.valor_entrada,
    'numero_parcelas',              v_vf.numero_parcelas,
    'valor_parcela',                v_vf.valor_parcela,
    'forma_pagamento',              v_vf.forma_pagamento,
    'produto_vendido',              v_vf.produto_vendido,
    'data_pagamento_entrada',       CASE
                                      WHEN v_vf.data_pagamento_entrada IS NOT NULL
                                      THEN TO_CHAR(v_vf.data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                                      ELSE NULL
                                    END,

    'link_contrato_assinado',       v_vf.op_link_do_contrato_assinado,
    'data_assinatura_contrato',     CASE
                                      WHEN v_vf.data_da_assinatura_do_contrato IS NOT NULL
                                      THEN TO_CHAR(v_vf.data_da_assinatura_do_contrato, 'DD/MM/YYYY')
                                      ELSE NULL
                                    END,

    'vencimentos_parcelas',         v_vf.op_vencimentos_parcelas,
    'observacoes',                  v_vf.observacoes_venda
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
  WHERE id = v_opp.id;

  RAISE NOTICE 'OpenClaw notificado — request_id: %, opp: %', v_request_id, v_opp.ghl_opportunity_id;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao notificar OpenClaw: % | SQLSTATE: %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado() IS
  'Notifica OpenClaw quando webhook chega com stage=Assinada no pipeline Vendas SQL. Idempotente via oportunidades.openclaw_notificado_em. (2026-03-21)';

-- ============================================================
-- 4. Criar trigger em webhooks_ghl (nome com zz_ para rodar por último)
-- ============================================================
DROP TRIGGER IF EXISTS tr_zz_notify_openclaw_assinada ON public.webhooks_ghl;

CREATE TRIGGER tr_zz_notify_openclaw_assinada
  AFTER INSERT ON public.webhooks_ghl
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_openclaw_contrato_assinado();

COMMENT ON TRIGGER tr_zz_notify_openclaw_assinada ON public.webhooks_ghl IS
  'Dispara OpenClaw quando stage=Assinada (Vendas SQL). Roda após extrair_vendas_fechamento (ordem alfabética: zz_). Idempotente.';
