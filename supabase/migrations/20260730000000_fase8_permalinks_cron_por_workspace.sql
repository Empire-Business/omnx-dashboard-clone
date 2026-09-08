-- Migration: Fase 2 / Fatia 8 — cron sync-ad-permalinks por workspace
--
-- sync-ad-permalinks agora EXIGE body.workspace_id (fail-closed) e resolve o token Meta
-- POR workspace. O cron diario (05:00 UTC) chamava sem workspace_id. Esta migration cria
-- a funcao job que PERCORRE os workspaces com credencial Meta (provider='meta') e dispara
-- UMA chamada por workspace. Sem credencial => no-op. Reschedule mantendo 05:00 UTC.

CREATE OR REPLACE FUNCTION public.sync_ad_permalinks_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-ad-permalinks';
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
      body    := jsonb_build_object('request_source', 'cron', 'workspace_id', v_ws.workspace_id)
    ) INTO v_request_id;

    v_count := v_count + 1;
    v_ids   := v_ids || v_ws.workspace_id::text || '=' || COALESCE(v_request_id::text, 'null') || ';';
  END LOOP;

  IF v_count = 0 THEN
    RETURN 'sync_ad_permalinks_job: nenhum workspace com credencial meta (no-op).';
  END IF;

  RETURN 'sync_ad_permalinks_job: workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.sync_ad_permalinks_job() IS
  'Cron diario ad-permalinks: dispara sync-ad-permalinks UMA vez por workspace com credencial provider=meta. No-op se nenhum.';

SELECT cron.unschedule('sync-ad-permalinks-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-ad-permalinks-daily');

SELECT cron.schedule(
  'sync-ad-permalinks-daily',
  '0 5 * * *',
  'SELECT public.sync_ad_permalinks_job();'
);
