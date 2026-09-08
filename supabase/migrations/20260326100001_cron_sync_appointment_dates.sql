-- ============================================================
-- Migration: 20260326100001
-- Cron: sync-appointment-dates — a cada 5 minutos, offset +3
--
-- Propósito:
--   Sincronizar data_reuniao_agendada com o appointment mais
--   recente na API GHL para todas as oportunidades do pipeline
--   "Vendas SQL" (ZWuCjEXM2VDyLCx8CtGU).
--
-- Por que API e não webhook?
--   O webhook envia o campo data_da_reunio (data_reuniao_agendada)
--   de forma não confiável: pode chegar com valor incorreto, fora
--   de ordem, ou não chegar. A API GHL é a fonte de verdade.
--   Ver: docs/SYNC-APPOINTMENT-DATES.md
--
-- Offset escolhido: +3 min em relação ao início de cada ciclo de 5min
--   - sync-contact-opportunities e ghl-opp-reconcile-processor: */5 (:00, :05, :10...)
--   - sync-appointment-dates: 3,8,13,... (:03, :08, :13...) → sem colisão
-- ============================================================

SELECT cron.unschedule('sync-appointment-dates-cron')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-appointment-dates-cron'
  );

SELECT cron.schedule(
  'sync-appointment-dates-cron',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  $$
    SELECT
      net.http_post(
        url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-appointment-dates',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
        ),
        body    := '{"batch_size": 200}'::jsonb
      ) AS request_id;
  $$
);

DO $$
BEGIN
  RAISE NOTICE '=== Cron sync-appointment-dates-cron registrado ===';
  RAISE NOTICE 'Schedule: 3,8,13,18,23,28,33,38,43,48,53,58 * * * *';
  RAISE NOTICE 'Offset: +3 min dos crons de 5 min existentes';
  RAISE NOTICE 'Pipeline: Vendas SQL (ZWuCjEXM2VDyLCx8CtGU)';
  RAISE NOTICE 'Campo atualizado: oportunidades.data_reuniao_agendada';
END;
$$;
