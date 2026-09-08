-- Atualiza cron de sync-ghl-conversations de 30min → 10min
-- Motivo: webhooks de mensagem agora disparam o sync imediatamente (fire & forget)
-- O cron de 10min funciona como fallback para cobrir qualquer mensagem perdida

SELECT cron.unschedule('sync-ghl-conversations-incremental');

SELECT cron.schedule(
  'sync-ghl-conversations-incremental',
  '*/10 * * * *',
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
