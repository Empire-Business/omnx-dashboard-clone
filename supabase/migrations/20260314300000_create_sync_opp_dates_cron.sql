-- ============================================================
-- Migration: Cron job para sync-opp-dates
--
-- Executa a edge function sync-opp-dates a cada 10 minutos,
-- processando 100 oportunidades por vez, até zerar os pendentes.
--
-- Tempo estimado para backfill completo (~5307 opps):
--   - Cron (100/execução, 10min): ~9 horas
--   - Manual acelerado (500/execução): ~2 horas
--
-- Para aceleração manual:
--   curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates" \
--     -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
--     -H "Content-Type: application/json" \
--     -d '{"batch_size": 500}'
-- ============================================================

-- Função auxiliar que chama a edge function via pg_net (HTTP do banco)
-- NOTA: service_role_key hardcoded pois current_setting('app.*') não existe no contexto de cron
CREATE OR REPLACE FUNCTION sync_opp_dates_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body    := '{"batch_size": 100}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$$;

-- Remover cron existente se houver (idempotente)
SELECT cron.unschedule('sync-opp-dates') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-opp-dates'
);

-- Criar cron: a cada 10 minutos
SELECT cron.schedule(
  'sync-opp-dates',
  '*/10 * * * *',
  'SELECT sync_opp_dates_job()'
);

-- Verificação
DO $$
BEGIN
  RAISE NOTICE 'Cron sync-opp-dates criado. Agenda: */10 * * * * (a cada 10 minutos)';
END;
$$;
