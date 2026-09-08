-- Migration: Fix caller de autorização dos crons — service_role_key em vez de anon_key
--
-- CONTEXTO
--   Achado da auditoria de segurança da Fase 3 (docs/HANDOFF-MULTI-TENANT-2026-07-11.md,
--   log de execução): as 20 edge functions chamadas por cron via net.http_post não
--   validavam o PAPEL do chamador — só o `verify_jwt` padrão do Supabase, que apenas
--   confirma que o JWT é assinado pelo projeto. Tanto a anon key (pública, embutida
--   no bundle JS do frontend) quanto a service_role key são JWTs válidos, então
--   qualquer pessoa com a anon key podia chamar diretamente essas functions e
--   disparar ações administrativas (sync em massa, reconciliação, envio de e-mail).
--
--   11 dos 20 crons já enviavam Authorization: Bearer service_role_key. Esta
--   migration corrige os 8 que ainda dependiam de anon_key/app_config:
--     compute-weekly-reports, send-weekly-report-email, sync-appointment-dates,
--     sync-contact-attribution, sync-contact-tasks, sync-ghl-users,
--     sync-opp-pipelines, sync-opp-sdr
--   (a nona function apontada originalmente, enviar-email-contrato-assinado, é
--   hoje ÓRFÃ — ver seção 8 abaixo — então não há SQL de cron para corrigir nela).
--
--   O guard do lado da edge function (que agora rejeita qualquer chamador que não
--   seja o service_role) está em supabase/functions/_shared/require-service-role.ts,
--   aplicado nesta mesma branch. Sem ESTA migration, os crons corrigidos quebrariam
--   (401) assim que o deploy das functions saísse — por isso os dois lados andam juntos.
--
-- ACHADO ADICIONAL (corrigido aqui): sync-ghl-users-cron enviava body `{}` sem
--   workspace_id, mas a função exige `workspace_id` no payload (fail-closed, desde
--   a Fase 2). Ou seja, ESSE CRON JÁ ESTAVA QUEBRADO (retornava FailClosedError a
--   cada execução, 4x por dia) antes desta migration — não é uma regressão nova.
--   Corrigido aqui reescrevendo sync_ghl_users_job() para percorrer os workspaces
--   com credencial GHL cadastrada, no mesmo padrão dos crons Meta/Notion por
--   workspace (fase8_meta_crons_por_workspace.sql).

-- ============================================================================
-- 1) compute-weekly-reports — weekly_reports_auth_header() agora usa service_role
-- ============================================================================
-- Usado por weekly_reports_cohort_job, weekly_reports_produtividade_job e
-- weekly_reports_cohort_reprocess_job (os 3 chamam esta função para montar o
-- header). Corrigir aqui resolve os 3 de uma vez.
CREATE OR REPLACE FUNCTION public.weekly_reports_auth_header()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT := get_secret('service_role_key');
BEGIN
  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'weekly_reports_auth_header: service_role_key nao configurada';
  END IF;

  RETURN 'Bearer ' || v_token;
END;
$function$;

COMMENT ON FUNCTION public.weekly_reports_auth_header() IS
  'Header Authorization para compute-weekly-reports (cron): service_role_key. '
  'Corrigido em 2026-08-08 — antes usava anon_key (achado de auditoria).';

-- ============================================================================
-- 2) send-weekly-report-email — weekly_email_dispatcher_job() usa service_role
-- ============================================================================
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
  v_auth_header := 'Bearer ' || get_secret('service_role_key');
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

COMMENT ON FUNCTION public.weekly_email_dispatcher_job() IS
  'Cron de despacho de e-mails semanais: chama send-weekly-report-email com '
  'service_role_key. Corrigido em 2026-08-08 — antes lia supabase_anon_key de '
  'app_config (achado de auditoria).';

-- ============================================================================
-- 3) sync-appointment-dates-cron — reagenda com service_role_key
-- ============================================================================
SELECT cron.unschedule('sync-appointment-dates-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-appointment-dates-cron');

SELECT cron.schedule(
  'sync-appointment-dates-cron',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  $cron$
    SELECT
      net.http_post(
        url     := '' || get_secret('supabase_url') || '/functions/v1/sync-appointment-dates',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
        ),
        body    := '{"batch_size": 200}'::jsonb
      ) AS request_id;
  $cron$
);

-- ============================================================================
-- 4) sync-contact-attribution — sync_contact_attribution_job() usa service_role
-- ============================================================================
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
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body := jsonb_build_object(
      'batch_size',       100,
      'apply_batch_size', 300
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- ============================================================================
-- 5) sync-contact-tasks — sync_contact_tasks_job() usa service_role
-- ============================================================================
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
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$;

-- ============================================================================
-- 6) sync-opp-pipelines-cron + sync-opp-pipelines-meeting-window-cron
-- ============================================================================
SELECT cron.unschedule('sync-opp-pipelines-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-pipelines-cron');

SELECT cron.schedule(
  'sync-opp-pipelines-cron',
  '4,14,24,34,44,54 * * * *',
  $cron$
    SELECT
      net.http_post(
        url     := '' || get_secret('supabase_url') || '/functions/v1/sync-opp-pipelines',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
        ),
        body    := '{"batch_size": 100}'::jsonb
      ) AS request_id;
  $cron$
);

SELECT cron.unschedule('sync-opp-pipelines-meeting-window-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-pipelines-meeting-window-cron');

SELECT cron.schedule(
  'sync-opp-pipelines-meeting-window-cron',
  '9,19,29,39,49,59 * * * *',
  $cron$
    SELECT
      net.http_post(
        url     := '' || get_secret('supabase_url') || '/functions/v1/sync-opp-pipelines',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
        ),
        body    := '{"batch_size": 200, "meeting_window_only": true}'::jsonb
      ) AS request_id;
  $cron$
);

-- ============================================================================
-- 7) sync-opp-sdr-cron
-- ============================================================================
SELECT cron.unschedule('sync-opp-sdr-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-sdr-cron');

SELECT cron.schedule(
  'sync-opp-sdr-cron',
  '6,16,26,36,46,56 * * * *',
  $cron$
    SELECT
      net.http_post(
        url     := '' || get_secret('supabase_url') || '/functions/v1/sync-opp-sdr',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
        ),
        body    := '{"batch_size": 300}'::jsonb
      ) AS request_id;
  $cron$
);

-- ============================================================================
-- 8) enviar-email-contrato-assinado — ACHADO: função hoje ÓRFÃ, nenhuma
--    correção de SQL necessária aqui.
--
--    A versão de processar_notificacao_openclaw_contrato_assinado() hoje em
--    produção/teste (evoluída além de 20260706135825_remove_hardcoded_supabase_tokens.sql
--    pela Fase 2/fatia 7 — outbound_webhooks genérico por workspace) NÃO chama
--    mais /functions/v1/enviar-email-contrato-assinado em lugar nenhum
--    (confirmado: nenhuma função em public.* referencia essa URL). O disparo de
--    e-mail de contrato assinado foi substituído pelo webhook genérico
--    'contrato_assinado' em outbound_webhooks (ver
--    docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md). A edge function
--    enviar-email-contrato-assinado ficou no repositório sem nenhum chamador.
--    O guard (requireServiceRoleCaller) foi aplicado nela mesmo assim, como
--    defesa em profundidade — se algum dia voltar a ser chamada, já nasce
--    protegida. Decisão de remover ou não o código morto fica para o dono
--    (tarefa separada, fora do escopo de segurança desta migration).
-- ============================================================================

-- ============================================================================
-- 9) sync-ghl-users-cron — reescrito para percorrer workspaces com credencial GHL
--    (mesmo padrão dos crons Meta/Notion por workspace) + service_role_key.
--    ACHADO: o cron antigo enviava body `{}` sem workspace_id, mas a função exige
--    workspace_id (fail-closed) — o cron já estava quebrado antes desta correção.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_ghl_users_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-users';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_ws          RECORD;
  v_request_id  BIGINT;
  v_count       INTEGER := 0;
  v_ids         TEXT := '';
BEGIN
  FOR v_ws IN
    SELECT DISTINCT workspace_id
    FROM public.workspace_integration_credentials
    WHERE provider = 'ghl'
      AND workspace_id IS NOT NULL
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('workspace_id', v_ws.workspace_id)
    ) INTO v_request_id;

    v_count := v_count + 1;
    v_ids   := v_ids || v_ws.workspace_id::text || '=' || COALESCE(v_request_id::text, 'null') || ';';
  END LOOP;

  IF v_count = 0 THEN
    RETURN 'sync_ghl_users_job: nenhum workspace com credencial ghl (no-op).';
  END IF;

  RETURN 'sync_ghl_users_job: workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.sync_ghl_users_job() IS
  'Cron sync-ghl-users: dispara UMA vez por workspace com credencial provider=ghl '
  '(isolamento multi-tenant), com service_role_key. Corrigido em 2026-08-08 — '
  'antes disparava 1x global com body {} e anon_key (o cron já estava quebrado: '
  'sync-ghl-users exige workspace_id desde a Fase 2, fail-closed).';

SELECT cron.unschedule('sync-ghl-users-cron')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ghl-users-cron');

SELECT cron.schedule(
  'sync-ghl-users-cron',
  '0 */6 * * *',
  'SELECT public.sync_ghl_users_job();'
);
