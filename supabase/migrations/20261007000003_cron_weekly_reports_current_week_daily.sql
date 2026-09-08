-- Fix: nenhum processo recalculava o snapshot cohort da SEMANA EM ANDAMENTO
-- diariamente. weekly_reports_cohort_job() (segunda 07:00 UTC) só calcula a
-- semana passada já fechada. O schedule diário "Análise diária completa de
-- tráfego" (clara_only, report_type='cohort') lê o snapshot da semana atual
-- via v_weekly_dashboard e falhava com "Nenhum dado encontrado para o
-- período" em toda execução após a virada de semana, até alguém recalcular
-- manualmente (achado da sessão de 2026-07-21, ver docs/MUDANCAS.md).
--
-- compute-weekly-reports já é idempotente por (workspace_id, week_start,
-- report_type) — UPDATE em vez de duplicar quando o snapshot já existe
-- (ver getOrCreateSnapshot em supabase/functions/compute-weekly-reports),
-- então rodar isso todo dia para a mesma semana só refresca os números.
CREATE OR REPLACE FUNCTION public.weekly_reports_current_week_cohort_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url          TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start   DATE;
  v_workspace    RECORD;
  v_request_id   BIGINT;
  v_count        INTEGER := 0;
BEGIN
  -- Segunda-feira da semana ATUAL (sem o "-7" usado pelos jobs de semana fechada).
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7);

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
      ),
      timeout_milliseconds := 60000
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week (atual): ' || v_week_start || ' | Type: cohort';
END;
$$;

SELECT cron.unschedule('weekly-reports-cohort-current-week')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reports-cohort-current-week');

-- Todo dia às 08:00 UTC (05:00 BRT) — 3h de folga antes do schedule diário
-- da Clara (08:00 BRT / 11:00 UTC) e antes de qualquer schedule matinal.
SELECT cron.schedule(
  'weekly-reports-cohort-current-week',
  '0 8 * * *',
  'SELECT weekly_reports_current_week_cohort_job()'
);
