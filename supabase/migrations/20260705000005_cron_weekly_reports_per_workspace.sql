-- Migration: Recria cron jobs de weekly reports para isolar por workspace
-- Data: 2026-07-05
--
-- Contexto: a edge function compute-weekly-reports passou a exigir
-- workspace_id no payload. Os crons antigos (20260519215445/46/47) chamavam
-- a função sem workspace_id, então passaram a falhar com 400.
--
-- Esta migration:
--   1. Recria as funções dos jobs iterando sobre public.workspaces.
--   2. Para cada workspace, dispara a edge function compute-weekly-reports
--      com workspace_id no payload.
--   3. Mantém os horários originais:
--        - produtividade: segundas 06:00 UTC (03:00 BRT)
--        - cohort:        segundas 07:00 UTC (04:00 BRT)
--        - reprocess:     a cada 30 minutos
--   4. Reutiliza public.weekly_reports_auth_header() para o header Authorization
--      (app_config key 'supabase_anon_key' ou app.settings fallback).
--
-- ⚠️ Atenção: não execute em produção sem garantir que app_config contém
--    a chave 'supabase_anon_key' válida.

-- =============================================================================
-- 1. HELPERS
-- =============================================================================

-- Garante que a função helper de auth existe (idempotente; mantém lógica atual).
CREATE OR REPLACE FUNCTION public.weekly_reports_auth_header()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT value INTO v_token
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_token IS NULL OR v_token = '' THEN
    v_token := current_setting('app.settings.supabase_anon_key', true);
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    v_token := current_setting('app.weekly_reports_anon_key', true);
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'weekly_reports_auth_header: nenhum token anon key configurado em app_config(supabase_anon_key) nem em app.settings';
  END IF;

  RETURN 'Bearer ' || v_token;
END;
$$;

-- =============================================================================
-- 2. PRODUTIVIDADE — segunda-feira 03:00 BRT (06:00 UTC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_produtividade_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url          TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
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
$$;

SELECT cron.unschedule('weekly-reports-produtividade')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-produtividade');

SELECT cron.schedule(
  'weekly-reports-produtividade',
  '0 6 * * 1',  -- Segundas, 06:00 UTC = 03:00 BRT
  'SELECT weekly_reports_produtividade_job()'
);

-- =============================================================================
-- 3. COHORT — segunda-feira 04:00 BRT (07:00 UTC)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url          TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
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
$$;

SELECT cron.unschedule('weekly-reports-cohort')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort');

SELECT cron.schedule(
  'weekly-reports-cohort',
  '0 7 * * 1',  -- Segundas, 07:00 UTC = 04:00 BRT
  'SELECT weekly_reports_cohort_job()'
);

-- =============================================================================
-- 4. REPROCESS — a cada 30 minutos, por workspace
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_workspace  RECORD;
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  -- Para cada workspace ativo, consome até 5 itens pendentes da fila.
  -- Itens com workspace_id IS NULL (legado) não são processados aqui;
  -- eles devem ser backfilled/migrados antes de reprocessar.
  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
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

      UPDATE public.weekly_reprocess_queue
      SET processed_at = NOW(),
          attempts     = attempts + 1
      WHERE id = v_item.id;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN 'Processed: ' || v_count || ' items';
END;
$$;

SELECT cron.unschedule('weekly-reports-cohort-reprocess')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort-reprocess');

SELECT cron.schedule(
  'weekly-reports-cohort-reprocess',
  '*/30 * * * *',
  'SELECT weekly_reports_cohort_reprocess_job()'
);
