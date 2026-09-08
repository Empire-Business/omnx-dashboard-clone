-- Migration: registrar cron sync-opp-sdr-cron
--
-- Schedule: 6,16,26,36,46,56 * * * *  (offset :06 — stagger thundering herd)
--
-- Tabela de offsets dos crons GHL (evitar que todos disparem juntos):
--   :00, :10, :20... → sync-ghl-conversations-incremental
--   :02, :12, :22... → sync-opp-dates
--   :04, :14, :24... → sync-opp-pipelines-cron
--   :06, :16, :26... → sync-opp-sdr-cron  ← NOVO
--   */15            → sync-contact-tags
--   */1             → ghl-api-worker-cron

SELECT cron.unschedule('sync-opp-sdr-cron')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-sdr-cron'
);

SELECT cron.schedule(
  'sync-opp-sdr-cron',
  '6,16,26,36,46,56 * * * *',
  $$
    SELECT
      net.http_post(
        url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-sdr',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
        ),
        body    := '{"batch_size": 100}'::jsonb
      ) AS request_id;
  $$
);

-- Verificação
DO $$
BEGIN
  RAISE NOTICE '=== Cron sync-opp-sdr-cron registrado ===';
  RAISE NOTICE 'Schedule: 6,16,26,36,46,56 * * * * (offset :06)';
  RAISE NOTICE 'Offset stagger completo:';
  RAISE NOTICE '  :00 → sync-ghl-conversations-incremental';
  RAISE NOTICE '  :02 → sync-opp-dates';
  RAISE NOTICE '  :04 → sync-opp-pipelines-cron';
  RAISE NOTICE '  :06 → sync-opp-sdr-cron  [NOVO]';
  RAISE NOTICE '  */15 → sync-contact-tags';
  RAISE NOTICE '  */1  → ghl-api-worker-cron';
END;
$$;
