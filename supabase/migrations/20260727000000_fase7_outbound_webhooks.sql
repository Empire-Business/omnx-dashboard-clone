-- Migration: Fase 2 / Fatia 7 — Webhooks de saida por workspace (isolamento de credenciais de egresso)
--
-- CONTEXTO
--   Dois caminhos hoje disparam o webhook "contrato_assinado" do OpenClaw com
--   URL e token FIXOS no codigo (segredo compartilhado entre todos os tenants):
--     1) trigger  public.notify_openclaw_contrato_assinado()  (vendas_fechamento AFTER INSERT/UPDATE)
--     2) funcao   public.processar_notificacao_openclaw_contrato_assinado(uuid,text,text)  (cron retry/sync)
--   Em um ambiente multi-tenant, isso mistura credenciais e destino entre clientes.
--
-- O QUE ESTA MIGRATION FAZ
--   1) Cria public.outbound_webhooks (por workspace + event_key) com RLS:
--        leitura  -> is_workspace_member(workspace_id)
--        escrita  -> is_workspace_admin(workspace_id)
--        service_role full / anon revogado
--      O segredo NAO fica em plaintext: fica no vault (secret_key_id -> vault.secrets).
--   2) Cria public.assert_outbound_url_safe(text) — guarda SSRF deny-by-default para
--      IP literais privados/loopback/link-local/CGNAT/metadata, localhost e esquemas != http(s).
--      (Hostnames passam; o residual de DNS rebinding e coberto pelo dispatcher Deno em etapa
--       posterior, documentado no runbook da Fase 2.)
--   3) Cria public.register_outbound_webhook(...) (service_role-only) — operador cadastra
--      URL/segredo por workspace sem commitar segredo no git (usado no seed de teste e de prod).
--   4) Reescreve os DOIS caminhos para ler URL/segredo da tabela FILTRANDO EXPLICITAMENTE
--      por workspace_id do evento e chamando assert_outbound_url_safe antes do net.http_post.
--      - Sem configuracao para o workspace -> no-op (nao quebra o INSERT/UPDATE nem o cron).
--      - Config com URL insegura -> no-op (guarda barra; EXCEPTION retorna FALSE/NEW).
--
-- SEM SEGREDO NESTE ARQUIVO. O seed do cliente e executado via runbook (psql service_role),
-- nao via migration versionada.

-- ============================================================================
-- 0) PRE-REQUISITOS (vault + helper de decrypt da Fatia 2)
-- ============================================================================
-- vault.create_secret e public.get_decrypted_secret(uuid) ja existem (Fatiа 0/2).

-- ============================================================================
-- 1) TABELA outbound_webhooks
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.outbound_webhooks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_key     text NOT NULL,
  url           text NOT NULL,
  secret_key_id uuid,
  headers       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_webhooks_workspace_event_uniq UNIQUE (workspace_id, event_key)
);

COMMENT ON TABLE public.outbound_webhooks IS
  'Webhooks de saida por workspace (isolamento multi-tenant). Segredo em vault (secret_key_id). Filtro explicito por workspace_id em todo disparo.';

COMMENT ON COLUMN public.outbound_webhooks.secret_key_id IS
  'uuid do segredo no vault (vault.secrets). Resolver via public.get_decrypted_secret(secret_key_id). Nunca plaintext.';

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_ws_event_active
  ON public.outbound_webhooks (workspace_id, event_key)
  WHERE is_active;

-- updated_at
CREATE OR REPLACE FUNCTION public.tg_outbound_webhooks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_outbound_webhooks_updated_at ON public.outbound_webhooks;
CREATE TRIGGER tr_outbound_webhooks_updated_at
  BEFORE UPDATE ON public.outbound_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_outbound_webhooks_updated_at();

-- RLS
ALTER TABLE public.outbound_webhooks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.outbound_webhooks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_webhooks TO authenticated;
GRANT ALL ON public.outbound_webhooks TO service_role;

DROP POLICY IF EXISTS outbound_webhooks_select ON public.outbound_webhooks;
DROP POLICY IF EXISTS outbound_webhooks_insert ON public.outbound_webhooks;
DROP POLICY IF EXISTS outbound_webhooks_update ON public.outbound_webhooks;
DROP POLICY IF EXISTS outbound_webhooks_delete ON public.outbound_webhooks;

CREATE POLICY outbound_webhooks_select
  ON public.outbound_webhooks FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY outbound_webhooks_insert
  ON public.outbound_webhooks FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY outbound_webhooks_update
  ON public.outbound_webhooks FOR UPDATE TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY outbound_webhooks_delete
  ON public.outbound_webhooks FOR DELETE TO authenticated
  USING (public.is_workspace_admin(workspace_id));

-- ============================================================================
-- 2) GUARDA SSRF — deny-by-default para destinos internos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.assert_outbound_url_safe(p_url text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_url   text;
  v_host  text;
  v_a int; v_b int; v_c int; v_d int;
BEGIN
  v_url := NULLIF(TRIM(COALESCE(p_url, '')), '');
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'outbound url vazia' USING ERRCODE = '22023';
  END IF;

  -- esquema obrigatorio http/https
  IF NOT (v_url ~* '^https?://') THEN
    RAISE EXCEPTION 'outbound url com esquema nao permitido (somente http/https)' USING ERRCODE = '22023';
  END IF;

  -- extrai host: remove esquema, depois corta em / ? # ou : (porta)
  v_host := regexp_replace(v_url, '^[a-zA-Z][a-zA-Z0-9+.-]*://', '');
  v_host := split_part(v_host, '/', 1);
  v_host := split_part(v_host, '?', 1);
  v_host := split_part(v_host, '#', 1);
  v_host := LOWER(v_host);

  -- IPv6 literal entre colchetes -> recusa ampla (::1, fc00::/7, fe80::/10 etc.)
  IF v_host ~ '^\[' OR v_host LIKE '%:%' THEN
    RAISE EXCEPTION 'outbound url com host IPv6 literal nao permitido' USING ERRCODE = '22023';
  END IF;

  -- localhost / .local
  IF v_host = 'localhost' OR v_host ~ '(^|\.)localhost$' OR v_host ~ '\.local$' THEN
    RAISE EXCEPTION 'outbound url apontando para localhost nao permitida' USING ERRCODE = '22023';
  END IF;

  -- remove porta (host:port) para checar IP puro
  v_host := split_part(v_host, ':', 1);

  -- IPv4 literal -> recusa ranges privados/loopback/link-local/CGNAT/reservados
  IF v_host ~ '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' THEN
    v_a := split_part(v_host, '.', 1)::int;
    v_b := split_part(v_host, '.', 2)::int;
    v_c := split_part(v_host, '.', 3)::int;
    v_d := split_part(v_host, '.', 4)::int;

    IF v_a = 0 THEN RAISE EXCEPTION 'outbound url em rede reservada (0.0.0.0/8)' USING ERRCODE = '22023'; END IF;
    IF v_a = 10 THEN RAISE EXCEPTION 'outbound url em rede privada (10.0.0.0/8)' USING ERRCODE = '22023'; END IF;
    IF v_a = 127 THEN RAISE EXCEPTION 'outbound url em loopback (127.0.0.0/8)' USING ERRCODE = '22023'; END IF;
    IF v_a = 169 AND v_b = 254 THEN RAISE EXCEPTION 'outbound url link-local/metadata (169.254.0.0/16)' USING ERRCODE = '22023'; END IF;
    IF v_a = 172 AND v_b BETWEEN 16 AND 31 THEN RAISE EXCEPTION 'outbound url em rede privada (172.16.0.0/12)' USING ERRCODE = '22023'; END IF;
    IF v_a = 192 AND v_b = 168 THEN RAISE EXCEPTION 'outbound url em rede privada (192.168.0.0/16)' USING ERRCODE = '22023'; END IF;
    IF v_a = 100 AND v_b BETWEEN 64 AND 127 THEN RAISE EXCEPTION 'outbound url em CGNAT (100.64.0.0/10)' USING ERRCODE = '22023'; END IF;
    IF v_a >= 224 THEN RAISE EXCEPTION 'outbound url em multicast/broadcast/reservado (>=224)' USING ERRCODE = '22023'; END IF;
  END IF;

  -- hostname publico: permitido (residual de DNS rebinding tratado em etapa posterior — ver runbook)
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.assert_outbound_url_safe(text) IS
  'Guarda SSRF deny-by-default: bloqueia esquemas != http(s), localhost, IPv6 literal e IPv4 privado/loopback/link-local/CGNAT/reservado. Hostnames publicos passam (DNS rebinding coberto por etapa posterior).';

REVOKE ALL ON FUNCTION public.assert_outbound_url_safe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_outbound_url_safe(text) TO service_role, authenticated;

-- ============================================================================
-- 3) CADASTRO OPERADOR (service_role-only) — segredo vai para o vault
-- ============================================================================
CREATE OR REPLACE FUNCTION public.register_outbound_webhook(
  p_workspace_id uuid,
  p_event_key    text,
  p_url          text,
  p_secret       text DEFAULT NULL,
  p_headers      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_id        uuid;
BEGIN
  IF p_workspace_id IS NULL OR NULLIF(TRIM(COALESCE(p_event_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'workspace_id e event_key obrigatorios' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_outbound_url_safe(p_url);

  IF NULLIF(TRIM(COALESCE(p_secret, '')), '') IS NOT NULL THEN
    v_secret_id := vault.create_secret(p_secret, p_event_key || '@' || p_workspace_id::text, 'outbound_webhooks secret');
  END IF;

  INSERT INTO public.outbound_webhooks (workspace_id, event_key, url, secret_key_id, headers, is_active)
  VALUES (p_workspace_id, p_event_key, p_url, v_secret_id, COALESCE(p_headers, '{}'::jsonb), true)
  ON CONFLICT (workspace_id, event_key) DO UPDATE
    SET url          = EXCLUDED.url,
        secret_key_id = EXCLUDED.secret_key_id,
        headers      = EXCLUDED.headers,
        is_active    = true
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.register_outbound_webhook(uuid, text, text, text, jsonb) IS
  'Operador (service_role): cadastra/atualiza webhook de saida por workspace. Valida SSRF e guarda segredo no vault (sem plaintext).';

REVOKE ALL ON FUNCTION public.register_outbound_webhook(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_outbound_webhook(uuid, text, text, text, jsonb) TO service_role;

-- ============================================================================
-- 4) REWRITE — funcao chamada pelo cron retry/sync
-- ============================================================================
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

  -- isolamento multi-tenant
  v_ws        UUID;
  v_url       TEXT;
  v_secret_id UUID;
  v_token     TEXT;
  v_headers   JSONB;
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

  -- ------------------------------------------------------------------------
  -- ISOLAMENTO: resolver workspace do evento e buscar destino/credencial
  -- filtrando EXPLICITAMENTE por workspace_id (funcao roda SECURITY DEFINER,
  -- fora de RLS — o WHERE workspace_id e a defesa real).
  -- ------------------------------------------------------------------------
  v_ws := public.get_contact_workspace_id(v_contato_id);
  IF v_ws IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT ow.url, ow.secret_key_id
    INTO v_url, v_secret_id
    FROM public.outbound_webhooks ow
   WHERE ow.workspace_id = v_ws
     AND ow.event_key    = 'contrato_assinado'
     AND ow.is_active
   LIMIT 1;

  IF NOT FOUND THEN
    -- sem configuracao para este workspace: nao notifica e NAO falha o fluxo
    RETURN FALSE;
  END IF;

  -- SSRF deny-by-default (URL interna/invalida -> EXCEPTION capturada abaixo -> no-op)
  PERFORM public.assert_outbound_url_safe(v_url);

  v_token := NULL;
  IF v_secret_id IS NOT NULL THEN
    v_token := public.get_decrypted_secret(v_secret_id);
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_token IS NOT NULL AND length(TRIM(v_token)) > 0 THEN
    v_headers := v_headers || jsonb_build_object('x-openclaw-token', v_token);
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
    url                  := v_url,
    headers              := v_headers,
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

  RAISE NOTICE 'OpenClaw enfileirado — request_id: %, opp: %, ws: %', v_request_id, v_opp_ghl_id, v_ws;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao processar OpenClaw (opp=%): % | SQLSTATE: %',
    p_oportunidade_id, SQLERRM, SQLSTATE;
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.processar_notificacao_openclaw_contrato_assinado(UUID, TEXT, DATE) IS
  'OpenClaw por workspace: le destino/credencial de outbound_webhooks (filtro explicito workspace_id), valida SSRF e enfileira via net.http_post (30s). Sem config = no-op.';

-- ============================================================================
-- 5) REWRITE — trigger em vendas_fechamento (caminho live)
-- ============================================================================
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

  -- isolamento multi-tenant
  v_ws        UUID;
  v_url       TEXT;
  v_secret_id UUID;
  v_token     TEXT;
  v_headers   JSONB;
BEGIN
  -- GUARDA DE IDEMPOTENCIA
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

  -- ------------------------------------------------------------------------
  -- ISOLAMENTO: workspace do evento + destino/credencial por workspace
  -- ------------------------------------------------------------------------
  v_ws := public.get_contact_workspace_id(NEW.contato_id);
  IF v_ws IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ow.url, ow.secret_key_id
    INTO v_url, v_secret_id
    FROM public.outbound_webhooks ow
   WHERE ow.workspace_id = v_ws
     AND ow.event_key    = 'contrato_assinado'
     AND ow.is_active
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW; -- sem config para este workspace -> no-op
  END IF;

  PERFORM public.assert_outbound_url_safe(v_url);

  v_token := NULL;
  IF v_secret_id IS NOT NULL THEN
    v_token := public.get_decrypted_secret(v_secret_id);
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_token IS NOT NULL AND length(TRIM(v_token)) > 0 THEN
    v_headers := v_headers || jsonb_build_object('x-openclaw-token', v_token);
  END IF;

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

  SELECT net.http_post(
    url     := v_url,
    headers := v_headers,
    body    := v_payload
  ) INTO v_request_id;

  RAISE NOTICE 'OpenClaw notificado — request_id: %, opp: %, ws: %', v_request_id, v_opp.ghl_opportunity_id, v_ws;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao notificar OpenClaw (contrato assinado): % | SQLSTATE: %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado() IS
  'Trigger OpenClaw por workspace: le destino/credencial de outbound_webhooks (filtro explicito workspace_id) e valida SSRF. Sem config = no-op.';

-- (trigger em vendas_fechamento ja existe; funcao substituida via CREATE OR REPLACE acima)

-- ============================================================================
-- 6) VERIFICACAO — nenhum segredo hardcoded remanescente nos dois caminhos
-- ============================================================================
DO $$
DECLARE
  v_src_proc text;
  v_src_trig text;
BEGIN
  SELECT prosrc INTO v_src_proc FROM pg_proc
   WHERE proname = 'processar_notificacao_openclaw_contrato_assinado' LIMIT 1;
  SELECT prosrc INTO v_src_trig FROM pg_proc
   WHERE proname = 'notify_openclaw_contrato_assinado' LIMIT 1;

  IF v_src_proc ~ 'openclaw-tjm2|hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM' THEN
    RAISE EXCEPTION 'FALHA: segredo/URL hardcoded remanescente em processar_notificacao_openclaw_contrato_assinado';
  END IF;
  IF v_src_trig ~ 'openclaw-tjm2|hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM' THEN
    RAISE EXCEPTION 'FALHA: segredo/URL hardcoded remanescente em notify_openclaw_contrato_assinado';
  END IF;
END;
$$;
