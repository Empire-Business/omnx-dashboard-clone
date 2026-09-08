-- ============================================================
-- Migration: Atualiza cron do sync GHL de 2h para 30 minutos
-- Motivo: Capturar mensagens inbound (lead) e outbound (SDR) em
--         tempo mais próximo do real para análise de pré-vendas.
--
-- Rate limit GHL (medido via headers):
--   x-ratelimit-max: 100 req / 10s por location
--   x-ratelimit-limit-daily: 200.000 req/dia
--
-- Consumo estimado por ciclo incremental (30 min):
--   ~20-80 conversas ativas × 1-2 req cada = ~40-160 req/ciclo
--   48 ciclos/dia × 160 req = ~7.680 req/dia  (3,8% do limite diário)
-- ============================================================

-- Remover cron antigo (2h)
SELECT cron.unschedule('sync-ghl-conversations-incremental');

-- Recriar com schedule a cada 30 minutos
SELECT cron.schedule(
  'sync-ghl-conversations-incremental',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-ghl-conversations',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"mode":"incremental"}'::jsonb
  ) AS request_id;
  $$
);
