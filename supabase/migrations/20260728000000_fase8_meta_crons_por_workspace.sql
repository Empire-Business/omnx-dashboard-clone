-- Migration: Fase 2 / Fatia 8 — crons Meta Ads por workspace
--
-- CONTEXTO
--   sync-meta-ads agora EXIGE body.workspace_id (fail-closed) e resolve o token Meta
--   POR workspace (workspace_integration_credentials, provider 'meta'). Os crons
--   horario (sync_meta_ads_job) e diario-7dias (sync-meta-ads-7days-daily) chamavam
--   a funcao SEM workspace_id e com body fixo — quebrariam apos a mudanca.
--
-- O QUE ESTA MIGRATION FAZ
--   Reescreve os crons para PERCORRER os workspaces que possuem credencial Meta
--   cadastrada e disparar UMA chamada por workspace, com body {workspace_id}.
--   Sem nenhum workspace com credencial Meta => no-op (nao falha).
--   Assim, cada tenant usa o SEU token/conta; o operador cadastra a credencial
--   da agencia/cliente em workspace_integration_credentials (runbook da Fase 2).

-- ============================================================================
-- 1) Horario: sync_meta_ads_job() — loop por workspace com credencial 'meta'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_meta_ads_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_ws          RECORD;
  v_request_id  BIGINT;
  v_count       INTEGER := 0;
  v_ids         TEXT := '';
BEGIN
  FOR v_ws IN
    SELECT DISTINCT workspace_id
    FROM public.workspace_integration_credentials
    WHERE provider = 'meta'
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
    RETURN 'sync_meta_ads_job: nenhum workspace com credencial meta (no-op).';
  END IF;

  RETURN 'sync_meta_ads_job: workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.sync_meta_ads_job() IS
  'Cron horario Meta Ads: dispara sync-meta-ads UMA vez por workspace com credencial provider=meta (isolamento multi-tenant). No-op se nenhum.';

-- ============================================================================
-- 2) Diario 7 dias: sync_meta_ads_7days_job() — idem, days_back=7
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_meta_ads_7days_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_ws          RECORD;
  v_request_id  BIGINT;
  v_count       INTEGER := 0;
  v_ids         TEXT := '';
BEGIN
  FOR v_ws IN
    SELECT DISTINCT workspace_id
    FROM public.workspace_integration_credentials
    WHERE provider = 'meta'
      AND workspace_id IS NOT NULL
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('workspace_id', v_ws.workspace_id, 'days_back', 7)
    ) INTO v_request_id;

    v_count := v_count + 1;
    v_ids   := v_ids || v_ws.workspace_id::text || '=' || COALESCE(v_request_id::text, 'null') || ';';
  END LOOP;

  IF v_count = 0 THEN
    RETURN 'sync_meta_ads_7days_job: nenhum workspace com credencial meta (no-op).';
  END IF;

  RETURN 'sync_meta_ads_7days_job: workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.sync_meta_ads_7days_job() IS
  'Cron diario Meta Ads (7 dias): dispara sync-meta-ads com days_back=7 UMA vez por workspace com credencial provider=meta. No-op se nenhum.';

-- ============================================================================
-- 3) Reschedule do cron diario para usar a funcao (mantem o schedule 06:00 UTC)
-- ============================================================================
SELECT cron.unschedule('sync-meta-ads-7days-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-meta-ads-7days-daily');

SELECT cron.schedule(
  'sync-meta-ads-7days-daily',
  '0 6 * * *',
  'SELECT public.sync_meta_ads_7days_job();'
);
