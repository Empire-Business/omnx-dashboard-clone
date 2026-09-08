-- Temporary helper functions for cron health check
-- These allow reading cron.job and cron.job_run_details via RPC
-- from edge functions, since the cron schema is not exposed by PostgREST.
-- Can be removed after health check is complete.

CREATE OR REPLACE FUNCTION public.get_cron_jobs()
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  schedule TEXT,
  active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobid, j.jobname::TEXT, j.schedule::TEXT, j.active
  FROM cron.job j
  ORDER BY j.jobname;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cron_runs(limit_count INT DEFAULT 100)
RETURNS TABLE (
  jobid BIGINT,
  jobname TEXT,
  status TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobid,
         j.jobname::TEXT,
         r.status::TEXT,
         r.start_time,
         r.end_time
  FROM cron.job_run_details r
  JOIN cron.job j ON j.jobid = r.jobid
  ORDER BY r.start_time DESC
  LIMIT limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_runs(INT) TO authenticated;
