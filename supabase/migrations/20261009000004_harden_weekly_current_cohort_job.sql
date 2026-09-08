-- Hardening: job interno de cohort da semana atual.
--
-- A função foi criada em 20261007000003 após a varredura que revogou jobs
-- internos. Por ser uma função nova SECURITY DEFINER, ela teria EXECUTE para
-- PUBLIC por padrão. Este arquivo restaura o contrato service_role-only e
-- remove o search_path com schema gravável do corpo privilegiado.
CREATE OR REPLACE FUNCTION public.weekly_reports_current_week_cohort_job()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_url        text := '' || public.get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start date;
  v_workspace  record;
  v_request_id bigint;
  v_count      integer := 0;
BEGIN
  v_week_start := current_date - ((EXTRACT(DOW FROM current_date)::int + 6) % 7);

  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces AS w
    JOIN public.workspace_members AS wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
  LOOP
    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type', 'cohort',
        'week_start', v_week_start,
        'workspace_id', v_workspace.id::text
      ),
      timeout_milliseconds := 60000
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week (atual): ' || v_week_start || ' | Type: cohort';
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_reports_current_week_cohort_job()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_reports_current_week_cohort_job()
  TO service_role;

COMMENT ON FUNCTION public.weekly_reports_current_week_cohort_job() IS
  'Job interno de cron para recalcular o cohort da semana em andamento; somente service_role pode executar.';
