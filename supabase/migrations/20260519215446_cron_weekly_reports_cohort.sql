-- Migration: Cron job para gerar relatório semanal cohort
-- Data: 2026-05-19
-- Frequência: Segundas-feiras, 04:00 BRT (07:00 UTC)
-- Ação: Chama edge function compute-weekly-reports com report_type=cohort
--       para a semana anterior (segunda→domingo).

-- =============================================================================
-- 1. FUNÇÃO DO JOB
-- =============================================================================

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports';
  v_week_start DATE;
  v_request_id BIGINT;
BEGIN
  -- Calcula a segunda-feira da semana anterior
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer REMOVED_SERVICE_ROLE_TOKEN_CONFIGURE_IN_SUPABASE_DASHBOARD'
    ),
    body := jsonb_build_object(
      'report_type', 'cohort',
      'week_start',  v_week_start
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | Week: ' || v_week_start || ' | Type: cohort';
END;
$$;

-- =============================================================================
-- 2. AGENDAMENTO CRON
-- =============================================================================

SELECT cron.unschedule('weekly-reports-cohort')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort');

SELECT cron.schedule(
  'weekly-reports-cohort',
  '0 7 * * 1',  -- Segundas, 07:00 UTC = 04:00 BRT
  'SELECT weekly_reports_cohort_job()'
);
