-- Fix get_cron_runs function: cron.job_run_details uses jobid, not jobname

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

GRANT EXECUTE ON FUNCTION public.get_cron_runs(INT) TO authenticated;
