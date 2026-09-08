-- Fix: recria cron sync-contact-tasks com anon key (padrão do projeto)
-- A migration anterior usava vault.decrypted_secrets que não estava configurado.

CREATE OR REPLACE FUNCTION public.sync_contact_tasks_job()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url        TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-tasks';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;

SELECT cron.unschedule('sync-contact-tasks')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-contact-tasks');

SELECT cron.schedule(
  'sync-contact-tasks',
  '*/15 * * * *',
  'SELECT sync_contact_tasks_job()'
);
