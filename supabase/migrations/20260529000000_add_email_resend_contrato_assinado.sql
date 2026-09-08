-- Migration: Enviar email via Resend quando contrato é assinado
--
-- Adiciona chamada à edge function `enviar-email-contrato-assinado` dentro de
-- `processar_notificacao_openclaw_contrato_assinado`, usando o mesmo payload e
-- o mesmo gatilho do OpenClaw. O email é fire-and-forget (sem retry).
--
-- DESTINATÁRIO: bruno@aliancadealtovalor.com.br
-- EDGE FUNCTION: https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/enviar-email-contrato-assinado

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
  v_auth_header TEXT;
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

  -- ── Disparo 1: OpenClaw ──────────────────────────────────────────────────────
  SELECT net.http_post(
    url                  := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers              := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body                 := v_payload,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  UPDATE public.oportunidades
  SET openclaw_request_id = v_request_id,
      openclaw_enfileirado_em = NOW(),
      openclaw_ultima_resposta_em = NULL,
      openclaw_ultimo_status_code = NULL,
      openclaw_ultimo_erro = NULL
  WHERE id = v_opp_id;

  RAISE NOTICE 'OpenClaw enfileirado — request_id: %, opp: %', v_request_id, v_opp_ghl_id;

  -- ── Disparo 2: Email via Resend ──────────────────────────────────────────────
  BEGIN
    -- Lê o anon_key da tabela app_config (padrão do projeto)
    SELECT 'Bearer ' || value INTO v_auth_header
    FROM public.app_config
    WHERE key = 'supabase_anon_key'
    LIMIT 1;

    PERFORM net.http_post(
      url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/enviar-email-contrato-assinado',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', COALESCE(v_auth_header, '')
      ),
      body    := v_payload
    );

    RAISE NOTICE 'Email contrato assinado enfileirado — opp: %', v_opp_ghl_id;
  EXCEPTION WHEN OTHERS THEN
    -- Não bloqueia o fluxo principal se o email falhar
    RAISE WARNING 'Erro ao enfileirar email contrato assinado (opp=%): %', v_opp_ghl_id, SQLERRM;
  END;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao processar OpenClaw (opp=%): % | SQLSTATE: %',
    p_oportunidade_id, SQLERRM, SQLSTATE;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.processar_notificacao_openclaw_contrato_assinado(UUID, TEXT, DATE) IS
  'Helper central do OpenClaw. Enfileira via net.http_post com timeout de 30s, guarda request_id e so marca openclaw_notificado_em apos confirmar resposta 2xx. Também dispara email via Resend para bruno@aliancadealtovalor.com.br (fire-and-forget).';
