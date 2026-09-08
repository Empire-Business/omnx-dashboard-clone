-- Migration: OpenClaw confiável
--
-- PROBLEMA REAL EM PRODUCAO:
-- O fluxo atual marca `oportunidades.openclaw_notificado_em` logo apos
-- `net.http_post()`. Isso so confirma que o request foi enfileirado no pg_net,
-- nao que o OpenClaw respondeu com sucesso.
--
-- EFEITO COLATERAL:
-- Se o endpoint do OpenClaw falhar, responder 4xx/5xx, ou o pg_net ficar sem
-- resposta, a oportunidade fica marcada como "notificada" mesmo sem entrega
-- confirmada. Depois disso, o sistema nao tenta reenviar.
--
-- SOLUCAO:
-- 1. Guardar `request_id` e timestamps de fila/resposta em `oportunidades`
-- 2. Marcar `openclaw_notificado_em` apenas depois de confirmar resposta 2xx
-- 3. Limpar requests falhos/expirados para permitir retry seguro
-- 4. Criar cron SQL por minuto para sincronizar status e reenfileirar falhas
-- 5. Expor funcao publica de diagnostico para ler `net._http_response`

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS openclaw_request_id BIGINT,
  ADD COLUMN IF NOT EXISTS openclaw_enfileirado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS openclaw_ultima_resposta_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS openclaw_ultimo_status_code INTEGER,
  ADD COLUMN IF NOT EXISTS openclaw_ultimo_erro TEXT;

COMMENT ON COLUMN public.oportunidades.openclaw_notificado_em IS
  'Momento em que o OpenClaw confirmou a entrega com sucesso (2xx).';

COMMENT ON COLUMN public.oportunidades.openclaw_request_id IS
  'Ultimo request_id do pg_net para envio ao OpenClaw enquanto a entrega ainda nao foi confirmada.';

COMMENT ON COLUMN public.oportunidades.openclaw_enfileirado_em IS
  'Momento em que o request foi enfileirado no pg_net para o OpenClaw.';

COMMENT ON COLUMN public.oportunidades.openclaw_ultima_resposta_em IS
  'Momento da ultima resposta observada do pg_net/OpenClaw para esta oportunidade.';

COMMENT ON COLUMN public.oportunidades.openclaw_ultimo_status_code IS
  'Ultimo status HTTP observado para o webhook do OpenClaw.';

COMMENT ON COLUMN public.oportunidades.openclaw_ultimo_erro IS
  'Ultimo erro ou corpo resumido de falha do OpenClaw/pg_net.';

CREATE INDEX IF NOT EXISTS idx_oportunidades_openclaw_pendentes
  ON public.oportunidades (openclaw_enfileirado_em)
  WHERE openclaw_request_id IS NOT NULL
    AND openclaw_notificado_em IS NULL;

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

  v_request_id_pendente BIGINT;
  v_enfileirado_em TIMESTAMPTZ;
  v_resposta_em TIMESTAMPTZ;
  v_resposta_status INTEGER;
  v_resposta_erro TEXT;
  v_resposta_conteudo TEXT;

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
    o.contato_id,
    o.openclaw_request_id,
    o.openclaw_enfileirado_em
  INTO
    v_opp_id,
    v_opp_ghl_id,
    v_pipeline_name,
    v_notificado_em,
    v_contato_id,
    v_request_id_pendente,
    v_enfileirado_em
  FROM public.oportunidades o
  WHERE o.id = p_oportunidade_id
  FOR UPDATE;

  IF v_opp_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_notificado_em IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  IF v_request_id_pendente IS NOT NULL THEN
    SELECT
      r.created,
      r.status_code,
      NULLIF(TRIM(r.error_msg), ''),
      NULLIF(LEFT(TRIM(COALESCE(r.content::TEXT, '')), 1000), '')
    INTO
      v_resposta_em,
      v_resposta_status,
      v_resposta_erro,
      v_resposta_conteudo
    FROM net._http_response r
    WHERE r.id = v_request_id_pendente
    LIMIT 1;

    IF FOUND THEN
      IF v_resposta_status BETWEEN 200 AND 299 AND v_resposta_erro IS NULL THEN
        UPDATE public.oportunidades
        SET openclaw_notificado_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultima_resposta_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultimo_status_code = v_resposta_status,
            openclaw_ultimo_erro = NULL
        WHERE id = v_opp_id;

        RETURN FALSE;
      END IF;

      IF v_resposta_status IS NULL AND v_resposta_erro IS NULL THEN
        IF COALESCE(v_enfileirado_em, v_resposta_em, NOW()) > NOW() - INTERVAL '10 minutes' THEN
          RETURN FALSE;
        END IF;

        UPDATE public.oportunidades
        SET openclaw_request_id = NULL,
            openclaw_enfileirado_em = NULL,
            openclaw_ultima_resposta_em = NOW(),
            openclaw_ultimo_status_code = NULL,
            openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
        WHERE id = v_opp_id;
      ELSE
        UPDATE public.oportunidades
        SET openclaw_request_id = NULL,
            openclaw_enfileirado_em = NULL,
            openclaw_ultima_resposta_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultimo_status_code = v_resposta_status,
            openclaw_ultimo_erro = COALESCE(v_resposta_erro, v_resposta_conteudo, 'OpenClaw respondeu sem sucesso')
        WHERE id = v_opp_id;
      END IF;
    ELSIF v_enfileirado_em IS NOT NULL AND v_enfileirado_em > NOW() - INTERVAL '10 minutes' THEN
      RETURN FALSE;
    ELSE
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = NOW(),
          openclaw_ultimo_status_code = NULL,
          openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
      WHERE id = v_opp_id;
    END IF;
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
  SET openclaw_request_id = v_request_id,
      openclaw_enfileirado_em = NOW(),
      openclaw_ultima_resposta_em = NULL,
      openclaw_ultimo_status_code = NULL,
      openclaw_ultimo_erro = NULL
  WHERE id = v_opp_id;

  RAISE NOTICE 'OpenClaw enfileirado — request_id: %, opp: %', v_request_id, v_opp_ghl_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao processar OpenClaw (opp=%): % | SQLSTATE: %',
    p_oportunidade_id, SQLERRM, SQLSTATE;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.processar_notificacao_openclaw_contrato_assinado(UUID, TEXT, DATE) IS
  'Helper central do OpenClaw. Enfileira via net.http_post, guarda request_id e so marca openclaw_notificado_em apos confirmar resposta 2xx.';

CREATE OR REPLACE FUNCTION public.sincronizar_status_openclaw_contrato_assinado(
  p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_rec RECORD;
  v_processados INTEGER := 0;
  v_confirmados INTEGER := 0;
  v_falharam INTEGER := 0;
  v_pendentes INTEGER := 0;
  v_expirados INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      o.id,
      o.openclaw_request_id,
      o.openclaw_enfileirado_em,
      r.created AS resposta_em,
      r.status_code,
      NULLIF(TRIM(r.error_msg), '') AS error_msg,
      NULLIF(LEFT(TRIM(COALESCE(r.content::TEXT, '')), 1000), '') AS content
    FROM public.oportunidades o
    LEFT JOIN net._http_response r
      ON r.id = o.openclaw_request_id
    WHERE o.openclaw_notificado_em IS NULL
      AND o.openclaw_request_id IS NOT NULL
    ORDER BY o.openclaw_enfileirado_em ASC NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  LOOP
    v_processados := v_processados + 1;

    IF v_rec.status_code BETWEEN 200 AND 299 AND v_rec.error_msg IS NULL THEN
      UPDATE public.oportunidades
      SET openclaw_notificado_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultima_resposta_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultimo_status_code = v_rec.status_code,
          openclaw_ultimo_erro = NULL
      WHERE id = v_rec.id;

      v_confirmados := v_confirmados + 1;
    ELSIF v_rec.status_code IS NOT NULL OR v_rec.error_msg IS NOT NULL THEN
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultimo_status_code = v_rec.status_code,
          openclaw_ultimo_erro = COALESCE(v_rec.error_msg, v_rec.content, 'OpenClaw respondeu sem sucesso')
      WHERE id = v_rec.id;

      v_falharam := v_falharam + 1;
    ELSIF v_rec.openclaw_enfileirado_em IS NOT NULL
       AND v_rec.openclaw_enfileirado_em <= NOW() - INTERVAL '10 minutes' THEN
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = NOW(),
          openclaw_ultimo_status_code = NULL,
          openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
      WHERE id = v_rec.id;

      v_expirados := v_expirados + 1;
    ELSE
      v_pendentes := v_pendentes + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processados', v_processados,
    'confirmados', v_confirmados,
    'falharam', v_falharam,
    'pendentes', v_pendentes,
    'expirados', v_expirados
  );
END;
$$;

COMMENT ON FUNCTION public.sincronizar_status_openclaw_contrato_assinado(INTEGER) IS
  'Sincroniza respostas do pg_net/OpenClaw: confirma 2xx, libera falhas para retry e expira requests sem resposta.';

CREATE OR REPLACE FUNCTION public.reenfileirar_openclaw_contrato_assinado_pendentes(
  p_limit INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_avaliadas INTEGER := 0;
  v_enfileiradas INTEGER := 0;
BEGIN
  PERFORM public.sincronizar_status_openclaw_contrato_assinado(GREATEST(COALESCE(p_limit, 25) * 5, 100));

  FOR v_rec IN
    SELECT
      o.id,
      vf.op_link_do_contrato_assinado,
      vf.data_da_assinatura_do_contrato
    FROM public.oportunidades o
    INNER JOIN public.vendas_fechamento vf
      ON vf.oportunidade_id = o.id
    WHERE o.openclaw_notificado_em IS NULL
      AND o.openclaw_request_id IS NULL
      AND NULLIF(TRIM(vf.op_link_do_contrato_assinado), '') IS NOT NULL
      AND (
        (
          o.pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
          AND o.pipeline_stage_id = 'Assinada'
        )
        OR vf.data_da_assinatura_do_contrato IS NOT NULL
      )
    ORDER BY COALESCE(o.updated_at, vf.updated_at, NOW()) DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  LOOP
    v_avaliadas := v_avaliadas + 1;

    IF public.processar_notificacao_openclaw_contrato_assinado(
      v_rec.id,
      v_rec.op_link_do_contrato_assinado,
      v_rec.data_da_assinatura_do_contrato
    ) THEN
      v_enfileiradas := v_enfileiradas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'avaliadas', v_avaliadas,
    'enfileiradas', v_enfileiradas
  );
END;
$$;

COMMENT ON FUNCTION public.reenfileirar_openclaw_contrato_assinado_pendentes(INTEGER) IS
  'Reenfileira oportunidades assinadas que continuam sem confirmacao no OpenClaw e nao possuem request pendente.';

DROP FUNCTION IF EXISTS public.processar_openclaw_contrato_assinado_job();

CREATE OR REPLACE FUNCTION public.processar_openclaw_contrato_assinado_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync JSONB;
  v_retry JSONB;
BEGIN
  v_sync := public.sincronizar_status_openclaw_contrato_assinado(200);
  v_retry := public.reenfileirar_openclaw_contrato_assinado_pendentes(25);

  RETURN 'sync=' || v_sync::TEXT || ' | retry=' || v_retry::TEXT;
END;
$$;

COMMENT ON FUNCTION public.processar_openclaw_contrato_assinado_job() IS
  'Job SQL do cron OpenClaw: confirma respostas do pg_net e reenfileira falhas/expirados.';

CREATE OR REPLACE FUNCTION public.listar_openclaw_respostas_recentes(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  oportunidade_id UUID,
  ghl_opportunity_id TEXT,
  email TEXT,
  request_id BIGINT,
  enfileirado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  openclaw_notificado_em TIMESTAMPTZ,
  status_code INTEGER,
  error_msg TEXT,
  content TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, net
AS $$
  SELECT
    o.id AS oportunidade_id,
    o.ghl_opportunity_id,
    c.email,
    o.openclaw_request_id AS request_id,
    o.openclaw_enfileirado_em AS enfileirado_em,
    r.created AS created_at,
    o.openclaw_notificado_em,
    r.status_code,
    COALESCE(r.error_msg, o.openclaw_ultimo_erro) AS error_msg,
    LEFT(COALESCE(r.content::TEXT, ''), 1000) AS content
  FROM public.oportunidades o
  LEFT JOIN public.contatos c
    ON c.id = o.contato_id
  LEFT JOIN net._http_response r
    ON r.id = o.openclaw_request_id
  WHERE o.openclaw_request_id IS NOT NULL
     OR o.openclaw_notificado_em IS NOT NULL
  ORDER BY COALESCE(o.openclaw_enfileirado_em, o.openclaw_notificado_em) DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$$;

COMMENT ON FUNCTION public.listar_openclaw_respostas_recentes(INTEGER) IS
  'Diagnostico publico: lista status recentes do OpenClaw por oportunidade, usando request_id gravado em oportunidades.';

SELECT cron.unschedule('openclaw-contrato-assinado-retry')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'openclaw-contrato-assinado-retry'
);

SELECT cron.schedule(
  'openclaw-contrato-assinado-retry',
  '* * * * *',
  'SELECT public.processar_openclaw_contrato_assinado_job()'
);
