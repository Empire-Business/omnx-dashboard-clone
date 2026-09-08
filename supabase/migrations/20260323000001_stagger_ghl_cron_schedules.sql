-- ============================================================
-- Migration: Escalonar offsets dos crons GHL para evitar thundering herd
--
-- Problema: sync-opp-dates, sync-opp-pipelines e sync-ghl-conversations
-- disparavam todos ao mesmo segundo (*/10 = :00, :10, :20...).
-- Cada função achava que tinha 100 req disponíveis — mas o limite GHL
-- é compartilhado entre todas as chamadas simultâneas.
--
-- Solução: distribuir os offsets de 2 em 2 minutos:
--   :00, :10, :20... → sync-ghl-conversations (mais crítico, fica no :00)
--   :02, :12, :22... → sync-opp-dates          (offset +2 min)
--   :04, :14, :24... → sync-opp-pipelines       (offset +4 min)
--   */15             → sync-contact-tags         (sem colisão — mantém)
--
-- Resultado: as funções nunca disparam juntas, cada uma tem sua janela
-- de rate limit isolada dentro dos 10 minutos de ciclo.
-- ============================================================

-- --------------------------------------------------------
-- 1. sync-opp-dates: mudar de */10 para offset +2 min
-- --------------------------------------------------------

-- O cron usa a função wrapper sync_opp_dates_job() — mantemos a função,
-- apenas atualizamos o schedule.
SELECT cron.unschedule('sync-opp-dates') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-dates'
);

SELECT cron.schedule(
  'sync-opp-dates',
  '2,12,22,32,42,52 * * * *',
  'SELECT sync_opp_dates_job()'
);

-- --------------------------------------------------------
-- 2. sync-opp-pipelines-cron: mudar de */10 para offset +4 min
-- --------------------------------------------------------

SELECT cron.unschedule('sync-opp-pipelines-cron') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-pipelines-cron'
);

SELECT cron.schedule(
  'sync-opp-pipelines-cron',
  '4,14,24,34,44,54 * * * *',
  $$
    SELECT
      net.http_post(
        url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
        ),
        body    := '{"batch_size": 100}'::jsonb
      ) AS request_id;
  $$
);

-- --------------------------------------------------------
-- sync-ghl-conversations-incremental: mantém em */10 (offset :00)
-- sync-contact-tags: mantém em */15 (sem colisão)
-- --------------------------------------------------------

-- Verificação
DO $$
BEGIN
  RAISE NOTICE '=== Crons GHL escalonados ===';
  RAISE NOTICE 'sync-ghl-conversations-incremental → */10 (:00, :10, :20...)  [inalterado]';
  RAISE NOTICE 'sync-opp-dates                     → 2,12,22,32,42,52 (:02, :12, :22...)';
  RAISE NOTICE 'sync-opp-pipelines-cron            → 4,14,24,34,44,54 (:04, :14, :24...)';
  RAISE NOTICE 'sync-contact-tags                  → */15 [inalterado]';
END;
$$;
