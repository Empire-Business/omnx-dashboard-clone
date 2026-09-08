-- Diagnostic: Configure Notion Sync Settings
-- Description: Set Supabase URL and anon key for CRON jobs
-- Run this ONCE after deploying the Edge Function

-- ============================================================
-- CONFIGURE SETTINGS (replace with your actual values)
-- ============================================================

-- Set Supabase URL
ALTER DATABASE postgres SET app.settings.supabase_url TO 'https://qzesffnkqgelmtfblzkr.supabase.co';

-- Set Supabase Anon Key
ALTER DATABASE postgres SET app.settings.supabase_anon_key TO 'REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY';

-- ============================================================
-- VERIFY SETTINGS
-- ============================================================

SELECT 
  current_setting('app.settings.supabase_url') AS supabase_url,
  LEFT(current_setting('app.settings.supabase_anon_key'), 50) || '...' AS anon_key_preview;

-- ============================================================
-- VERIFY CRON JOBS
-- ============================================================

SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE 'notion-sync%'
ORDER BY jobname;

-- ============================================================
-- CHECK LAST EXECUTIONS
-- ============================================================

SELECT 
  j.jobname,
  r.runid,
  r.status,
  r.start_time,
  r.end_time,
  r.return_message
FROM cron.job_run_details r
JOIN cron.job j ON j.jobid = r.jobid
WHERE j.jobname LIKE 'notion-sync%'
ORDER BY r.start_time DESC
LIMIT 10;
