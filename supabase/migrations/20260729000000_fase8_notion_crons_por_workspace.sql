-- Migration: Fase 2 / Fatia 8 — crons Notion por workspace
--
-- CONTEXTO
--   notion-creatives-sync agora EXIGE body.workspace_id (fail-closed) e resolve o token
--   Notion POR workspace (workspace_integration_credentials, provider 'notion'). Os dois
--   crons (paid e organic, 9h e 21h UTC) chamavam a funcao SEM workspace_id e com body
--   fixo {database_type, request_source} — quebrariam apos a mudanca.
--
-- O QUE ESTA MIGRATION FAZ
--   Cria funcoes job que PERCORREM os workspaces com credencial Notion e disparam UMA
--   chamada por workspace (com body {database_type, request_source:'cron', workspace_id}).
--   Sem nenhum workspace com credencial Notion => no-op (nao falha).
--   Reschedule dos crons para chamar as funcoes, mantendo o schedule 9h/21h UTC.

CREATE OR REPLACE FUNCTION public.notion_sync_creatives_job(p_database_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/notion-creatives-sync';
  v_service_key TEXT := '' || get_secret('service_role_key') || '';
  v_ws          RECORD;
  v_request_id  BIGINT;
  v_count       INTEGER := 0;
  v_ids         TEXT := '';
BEGIN
  IF p_database_type NOT IN ('paid', 'organic') THEN
    RAISE EXCEPTION 'database_type invalido: %', p_database_type USING ERRCODE = '22023';
  END IF;

  FOR v_ws IN
    SELECT DISTINCT workspace_id
    FROM public.workspace_integration_credentials
    WHERE provider = 'notion'
      AND workspace_id IS NOT NULL
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'database_type',   p_database_type,
        'request_source',  'cron',
        'workspace_id',    v_ws.workspace_id
      )
    ) INTO v_request_id;

    v_count := v_count + 1;
    v_ids   := v_ids || v_ws.workspace_id::text || '=' || COALESCE(v_request_id::text, 'null') || ';';
  END LOOP;

  IF v_count = 0 THEN
    RETURN 'notion_sync_creatives_job(' || p_database_type || '): nenhum workspace com credencial notion (no-op).';
  END IF;

  RETURN 'notion_sync_creatives_job(' || p_database_type || '): workspaces=' || v_count || ' | ' || v_ids;
END;
$function$;

COMMENT ON FUNCTION public.notion_sync_creatives_job(text) IS
  'Cron Notion creatives: dispara notion-creatives-sync UMA vez por workspace com credencial provider=notion (isolamento multi-tenant). No-op se nenhum.';

CREATE OR REPLACE FUNCTION public.notion_sync_paid_creatives_job()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.notion_sync_creatives_job('paid');
$function$;

CREATE OR REPLACE FUNCTION public.notion_sync_organic_creatives_job()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.notion_sync_creatives_job('organic');
$function$;

-- Reschedule (idempotente) mantendo 9h/21h UTC (6h/18h BRT)
SELECT cron.unschedule('notion-sync-paid-creatives')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-paid-creatives');
SELECT cron.schedule(
  'notion-sync-paid-creatives',
  '0 9,21 * * *',
  'SELECT public.notion_sync_paid_creatives_job();'
);

SELECT cron.unschedule('notion-sync-organic-creatives')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-organic-creatives');
SELECT cron.schedule(
  'notion-sync-organic-creatives',
  '0 9,21 * * *',
  'SELECT public.notion_sync_organic_creatives_job();'
);
