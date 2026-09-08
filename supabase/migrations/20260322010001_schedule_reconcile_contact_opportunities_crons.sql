-- ============================================================
-- Migration: cron de reconciliação/backfill de oportunidades GHL
--
-- Jobs criados:
-- 1. starter diário 03:00 BRT (06:00 UTC) para iniciar reconciliação
-- 2. processor a cada 5 minutos para consumir o run em lotes
-- ============================================================

CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_start_nightly_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{
      "action": "start",
      "mode": "write",
      "scope": "all_contacts",
      "source": "nightly",
      "auto_process": false
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_process_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{
      "action": "process",
      "batch_size": 25,
      "stale_after_minutes": 30
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

SELECT cron.unschedule('ghl-opp-reconcile-nightly-start')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ghl-opp-reconcile-nightly-start'
);

SELECT cron.unschedule('ghl-opp-reconcile-processor')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'ghl-opp-reconcile-processor'
);

-- 03:00 BRT = 06:00 UTC
SELECT cron.schedule(
  'ghl-opp-reconcile-nightly-start',
  '0 6 * * *',
  'SELECT ghl_opp_reconcile_start_nightly_job()'
);

SELECT cron.schedule(
  'ghl-opp-reconcile-processor',
  '*/5 * * * *',
  'SELECT ghl_opp_reconcile_process_job()'
);

DO $$
BEGIN
  RAISE NOTICE 'Crons de reconcile-contact-opportunities criados: start 06:00 UTC e processor */5';
END;
$$;
