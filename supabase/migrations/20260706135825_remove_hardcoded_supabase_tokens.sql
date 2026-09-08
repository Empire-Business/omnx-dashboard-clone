-- ============================================================
-- Migration: remove tokens Supabase hardcoded de funções e cron jobs
--
-- O que faz:
--   1. Cria tabela `secrets` para centralizar supabase_url, anon_key e service_role_key.
--   2. Cria função helper `get_secret(key)` (SECURITY DEFINER) para ler secrets.
--   3. Atualiza funções PostgreSQL que chamam edge functions para usar get_secret().
--   4. Atualiza cron jobs que chamam edge functions para usar get_secret().
--   5. Corrige referências ao namespace errado app_settings.*.
--
-- IMPORTANTE: após aplicar esta migration, execute imediatamente o script
-- /tmp/apply-supabase-secrets.sql (gerado pelo mesmo gerador) para preencher
-- os valores reais. Depois delete o script temporário.
-- ============================================================

-- Tabela centralizada de secrets (apenas service_role e SECURITY DEFINER functions acessam)
CREATE TABLE IF NOT EXISTS secrets (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_secrets" ON secrets;
CREATE POLICY "service_role_all_secrets"
    ON secrets FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trigger_update_secrets_updated_at ON secrets;
CREATE TRIGGER trigger_update_secrets_updated_at
    BEFORE UPDATE ON secrets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Helper SECURITY DEFINER para ler secrets (qualquer função pode usar)
CREATE OR REPLACE FUNCTION public.get_secret(p_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN (SELECT value FROM secrets WHERE key = p_key);
END;
$$;

-- Placeholders (serão sobrescritos pelo script de secrets)
INSERT INTO secrets (key, value) VALUES
    ('supabase_url', 'https://PROJECT_REF.supabase.co'),
    ('anon_key', 'ANON_KEY_PLACEHOLDER'),
    ('service_role_key', 'SERVICE_ROLE_KEY_PLACEHOLDER')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Funções PostgreSQL atualizadas
-- ============================================================

-- Function: backfill_meta_ads_job
CREATE OR REPLACE FUNCTION public.backfill_meta_ads_job(p_data_inicio date DEFAULT ((CURRENT_DATE - '7 days'::interval))::date, p_data_fim date DEFAULT ((CURRENT_DATE - '1 day'::interval))::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads-backfill';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id BIGINT;
    v_body JSONB;
BEGIN
    -- Montar body da requisição
    v_body := jsonb_build_object(
        'data_inicio', to_char(p_data_inicio, 'YYYY-MM-DD'),
        'data_fim', to_char(p_data_fim, 'YYYY-MM-DD')
    );
    
    -- Fazer requisição HTTP
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := v_body
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | Período: ' || p_data_inicio || ' a ' || p_data_fim;
END;
$function$;

-- Function: executar_backfill_direto
CREATE OR REPLACE FUNCTION public.executar_backfill_direto(p_controle_id uuid, p_max_dias integer DEFAULT 10)
 RETURNS TABLE(data date, status text, registros integer, erro text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_dia RECORD;
    v_contador INTEGER := 0;
BEGIN
    -- Update controle status to running
    UPDATE meta_ads_backfill_controle
    SET status = 'running'
    WHERE id = p_controle_id;
    
    -- Process each pending day up to max_dias
    FOR v_dia IN 
        SELECT data
        FROM meta_ads_backfill_log
        WHERE controle_id = p_controle_id
        AND status = 'pending'
        ORDER BY data ASC
        LIMIT p_max_dias
    LOOP
        -- Mark as processing
        UPDATE meta_ads_backfill_log
        SET status = 'processing',
            processed_at = NOW()
        WHERE controle_id = p_controle_id
        AND data = v_dia.data;
        
        -- Call the sync function for this specific date
        -- This will trigger the Edge Function via pg_net
        INSERT INTO net.http_request_queue (
            method,
            url,
            headers,
            body,
            timeout_ms
        )
        SELECT 
            'POST',
            get_secret('supabase_url') || '/functions/v1/sync-meta-ads',
            jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || get_secret('service_role_key')
            ),
            jsonb_build_object(
                'lookback_days', (CURRENT_DATE - v_dia.data)::INTEGER,
                'specific_date', v_dia.data::TEXT
            ),
            60000;
        
        -- Return progress
        data := v_dia.data;
        status := 'triggered';
        registros := 0;
        erro := NULL;
        RETURN NEXT;
        
        v_contador := v_contador + 1;
    END LOOP;
    
    RETURN;
END;
$function$;

-- Function: ghl_api_worker_job
CREATE OR REPLACE FUNCTION public.ghl_api_worker_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/ghl-api-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"max_jobs": 50}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$;

-- Function: ghl_opp_reconcile_process_job
CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_process_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{
      "action": "process",
      "batch_size": 25,
      "stale_after_minutes": 30
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$;

-- Function: ghl_opp_reconcile_start_nightly_job
CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_start_nightly_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{
      "action": "start",
      "mode": "write",
      "scope": "all_contacts",
      "source": "nightly",
      "auto_process": false
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$;

-- Function: processar_notificacao_openclaw_contrato_assinado
CREATE OR REPLACE FUNCTION public.processar_notificacao_openclaw_contrato_assinado(p_oportunidade_id uuid, p_link_contrato text DEFAULT NULL::text, p_data_assinatura date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
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
      url     := '' || get_secret('supabase_url') || '/functions/v1/enviar-email-contrato-assinado',
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
$function$;

-- Function: sync_contact_attribution_job
CREATE OR REPLACE FUNCTION public.sync_contact_attribution_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-attribution';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body := jsonb_build_object(
      'batch_size',       100,
      'apply_batch_size', 300
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- Function: sync_contact_opportunities_job
CREATE OR REPLACE FUNCTION public.sync_contact_opportunities_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"batch_size": 20}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$;

-- Function: sync_contact_tags_job
CREATE OR REPLACE FUNCTION public.sync_contact_tags_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-tags';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id  BIGINT;
BEGIN
    SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body    := '{"batch_size": 100}'::jsonb
    ) INTO v_request_id;

    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- Function: sync_contact_tasks_job
CREATE OR REPLACE FUNCTION public.sync_contact_tasks_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url        TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-tasks';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- Function: sync_ghl_conversations_job
CREATE OR REPLACE FUNCTION public.sync_ghl_conversations_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"mode":"incremental"}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$;

-- Function: sync_meta_ads_job
CREATE OR REPLACE FUNCTION public.sync_meta_ads_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id BIGINT;
BEGIN
    -- Fazer requisição HTTP para a Edge Function
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- Function: sync_opp_dates_job
CREATE OR REPLACE FUNCTION public.sync_opp_dates_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE   v_request_id BIGINT; BEGIN   SELECT net.http_post(     url     := '' || get_secret('supabase_url') || '/functions/v1/sync-opp-dates',     headers := jsonb_build_object(       'Content-Type',  'application/json',       'Authorization', 'Bearer ' || get_secret('service_role_key') || ''     ),     body    := '{"batch_size": 100}'::jsonb   ) INTO v_request_id;   RETURN 'Request ID: ' || v_request_id; END; $function$;

-- Function: trigger_sdr_ia_on_inbound_message
CREATE OR REPLACE FUNCTION public.trigger_sdr_ia_on_inbound_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;
  IF NEW.channel NOT IN ('whatsapp', 'sms') THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sdr-ia-orchestrator',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body    := jsonb_build_object('forcar_contato_id', NEW.contato_id::TEXT),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

-- Function: weekly_email_dispatcher_job
CREATE OR REPLACE FUNCTION public.weekly_email_dispatcher_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_schedule RECORD;
  v_auth_header TEXT;
  v_url TEXT;
  v_body TEXT;
BEGIN
  -- Busca token de autorização interno
  SELECT value INTO v_auth_header
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_auth_header IS NULL THEN
    RAISE EXCEPTION 'supabase_anon_key não configurado em app_config';
  END IF;

  v_auth_header := 'Bearer ' || v_auth_header;
  v_url := COALESCE(
    (SELECT value FROM public.app_config WHERE key = 'supabase_url'),
    get_secret('supabase_url')
  ) || '/functions/v1/send-weekly-report-email';

  FOR v_schedule IN
    SELECT id
    FROM public.weekly_email_schedules
    WHERE is_active = true
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_body := json_build_object('schedule_id', v_schedule.id)::TEXT;

    BEGIN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Authorization', v_auth_header,
          'Content-Type', 'application/json'
        ),
        body := v_body
      );

      -- Marca como processado (a edge function atualizará last_run_at e next_run_at)
      UPDATE public.weekly_email_schedules
      SET last_run_at = NOW()
      WHERE id = v_schedule.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.weekly_email_schedules
      SET last_error = SQLERRM
      WHERE id = v_schedule.id;

      INSERT INTO public.weekly_email_logs (schedule_id, status, error_message)
      VALUES (v_schedule.id, 'failed', SQLERRM);
    END;
  END LOOP;
END;
$function$;

-- Function: weekly_reports_auth_header
CREATE OR REPLACE FUNCTION public.weekly_reports_auth_header()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  SELECT value INTO v_token
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_token IS NULL OR v_token = '' THEN
    v_token := get_secret('anon_key');
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    v_token := get_secret('anon_key');
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'weekly_reports_auth_header: nenhum token anon key configurado em app_config(supabase_anon_key) nem em app.settings';
  END IF;

  RETURN 'Bearer ' || v_token;
END;
$function$;

-- Function: weekly_reports_cohort_job
CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url          TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start   DATE;
  v_workspace    RECORD;
  v_request_id   BIGINT;
  v_count        INTEGER := 0;
BEGIN
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type',  'cohort',
        'week_start',   v_week_start,
        'workspace_id', v_workspace.id::text
      )
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week: ' || v_week_start || ' | Type: cohort';
END;
$function$;

-- Function: weekly_reports_cohort_reprocess_job
CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url        TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_workspace  RECORD;
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  -- Para cada workspace ativo, consome até 5 itens pendentes da fila.
  -- Itens com workspace_id IS NULL (legado) não são processados aqui;
  -- eles devem ser backfilled/migrados antes de reprocessar.
  FOR v_workspace IN
    SELECT id FROM public.workspaces ORDER BY id
  LOOP
    FOR v_item IN
      SELECT id, week_start, report_type
      FROM public.weekly_reprocess_queue
      WHERE processed_at IS NULL
        AND workspace_id = v_workspace.id
      ORDER BY priority DESC, created_at ASC
      LIMIT 5
    LOOP
      SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', public.weekly_reports_auth_header()
        ),
        body := jsonb_build_object(
          'report_type',  v_item.report_type,
          'week_start',   v_item.week_start,
          'workspace_id', v_workspace.id::text,
          'reprocess',    true
        )
      ) INTO v_request_id;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' items';
END;
$function$;

-- Function: weekly_reports_produtividade_job
CREATE OR REPLACE FUNCTION public.weekly_reports_produtividade_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url          TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start   DATE;
  v_workspace    RECORD;
  v_request_id   BIGINT;
  v_count        INTEGER := 0;
BEGIN
  -- Segunda-feira da semana anterior
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type',  'produtividade',
        'week_start',   v_week_start,
        'workspace_id', v_workspace.id::text
      )
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week: ' || v_week_start || ' | Type: produtividade';
END;
$function$;

-- ============================================================
-- Cron jobs atualizados
-- ============================================================

-- Cron job: notion-sync-organic-creatives
SELECT cron.unschedule('notion-sync-organic-creatives')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-organic-creatives');
SELECT cron.schedule('notion-sync-organic-creatives', '0 9,21 * * *', '
  SELECT net.http_post(
    url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/notion-creatives-sync'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || '''',
      ''Content-Type'', ''application/json''
    ),
    body    := ''{"database_type":"organic","request_source":"cron"}''::jsonb
  );
  ');

-- Cron job: notion-sync-paid-creatives
SELECT cron.unschedule('notion-sync-paid-creatives')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-paid-creatives');
SELECT cron.schedule('notion-sync-paid-creatives', '0 9,21 * * *', '
  SELECT net.http_post(
    url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/notion-creatives-sync'',
    headers := jsonb_build_object(
      ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || '''',
      ''Content-Type'', ''application/json''
    ),
    body    := ''{"database_type":"paid","request_source":"cron"}''::jsonb
  );
  ');

-- Cron job: reconcile-vendas-fechamento-cron
SELECT cron.unschedule('reconcile-vendas-fechamento-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-vendas-fechamento-cron');
SELECT cron.schedule('reconcile-vendas-fechamento-cron', '11,26,41,56 * * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/reconcile-vendas-fechamento'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{"action":"write","scope":"all","batch_size":75,"include_api":true}''::jsonb
      ) AS request_id;
  ');

-- Cron job: stevo-process-att1
SELECT cron.unschedule('stevo-process-att1')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att1');
SELECT cron.schedule('stevo-process-att1', '0 * * * *', '                                                                                                                                                  
    select net.http_get(                                                                                                                                
      url := '''' || get_secret(''supabase_url'') || ''/functions/v1/stevo-calls-sync?action=process&instance=att1&wavoip_id=8751583''                    
    );                                                                                                                                                  
    ');

-- Cron job: stevo-process-att2
SELECT cron.unschedule('stevo-process-att2')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att2');
SELECT cron.schedule('stevo-process-att2', '0 * * * *', '                                                                                                                                                  
    select net.http_get(                                                                                                                                
      url := '''' || get_secret(''supabase_url'') || ''/functions/v1/stevo-calls-sync?action=process&instance=att2&wavoip_id=8751778''                    
    );                                                                                                                                                      ');

-- Cron job: stevo-process-att3
SELECT cron.unschedule('stevo-process-att3')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stevo-process-att3');
SELECT cron.schedule('stevo-process-att3', '0 * * * *', '
    select net.http_get(                  
      url := '''' || get_secret(''supabase_url'') || ''/functions/v1/stevo-calls-sync?action=process&instance=att3&wavoip_id=8751586''                    
    );                                                                                                                                                      ');

-- Cron job: sync-ad-permalinks-daily
SELECT cron.unschedule('sync-ad-permalinks-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ad-permalinks-daily');
SELECT cron.schedule('sync-ad-permalinks-daily', '0 5 * * *', '
  SELECT net.http_post(
    url    := get_secret(''supabase_url'') || ''/functions/v1/sync-ad-permalinks'',
    body   := ''{"request_source":"cron"}''::jsonb,
    headers := jsonb_build_object(
      ''Content-Type'',  ''application/json'',
      ''Authorization'', ''Bearer '' || get_secret(''service_role_key'')
    )
  );
  ');

-- Cron job: sync-appointment-dates-cron
SELECT cron.unschedule('sync-appointment-dates-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-appointment-dates-cron');
SELECT cron.schedule('sync-appointment-dates-cron', '3,8,13,18,23,28,33,38,43,48,53,58 * * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/sync-appointment-dates'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{"batch_size": 200}''::jsonb
      ) AS request_id;
  ');

-- Cron job: sync-ghl-users-cron
SELECT cron.unschedule('sync-ghl-users-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ghl-users-cron');
SELECT cron.schedule('sync-ghl-users-cron', '0 */6 * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/sync-ghl-users'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{}''::jsonb
      ) AS request_id;
  ');

-- Cron job: sync-meta-ads-7days-daily
SELECT cron.unschedule('sync-meta-ads-7days-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-meta-ads-7days-daily');
SELECT cron.schedule('sync-meta-ads-7days-daily', '0 6 * * *', '
            SELECT net.http_post(
                url     := get_secret(''supabase_url'')
                           || ''/functions/v1/sync-meta-ads'',
                headers := jsonb_build_object(
                    ''Content-Type'',  ''application/json'',
                    ''Authorization'', ''Bearer ''
                        || get_secret(''anon_key'')
                ),
                body    := ''{"days_back": 7}''::jsonb
            ) AS request_id;
        ');

-- Cron job: sync-opp-pipelines-cron
SELECT cron.unschedule('sync-opp-pipelines-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-pipelines-cron');
SELECT cron.schedule('sync-opp-pipelines-cron', '4,14,24,34,44,54 * * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/sync-opp-pipelines'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{"batch_size": 100}''::jsonb
      ) AS request_id;
  ');

-- Cron job: sync-opp-pipelines-meeting-window-cron
SELECT cron.unschedule('sync-opp-pipelines-meeting-window-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-pipelines-meeting-window-cron');
SELECT cron.schedule('sync-opp-pipelines-meeting-window-cron', '9,19,29,39,49,59 * * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/sync-opp-pipelines'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{"batch_size": 200, "meeting_window_only": true}''::jsonb
      ) AS request_id;
  ');

-- Cron job: sync-opp-sdr-cron
SELECT cron.unschedule('sync-opp-sdr-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-sdr-cron');
SELECT cron.schedule('sync-opp-sdr-cron', '6,16,26,36,46,56 * * * *', '
    SELECT
      net.http_post(
        url     := '''' || get_secret(''supabase_url'') || ''/functions/v1/sync-opp-sdr'',
        headers := jsonb_build_object(
          ''Content-Type'',  ''application/json'',
          ''Authorization'', ''Bearer '' || get_secret(''anon_key'') || ''''
        ),
        body    := ''{"batch_size": 300}''::jsonb
      ) AS request_id;
  ');
