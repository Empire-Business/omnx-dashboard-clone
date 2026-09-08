-- Fix: recriar cron jobs do Notion com URL hardcoded
-- A migration original usava current_setting('app.settings.*') que nunca foi configurado.
-- Padrão correto do projeto: URL e anon_key hardcoded (igual sync-opp-dates e outros).

-- Remove jobs antigos se existirem (idempotente)
SELECT cron.unschedule('notion-sync-paid-creatives')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-paid-creatives');

SELECT cron.unschedule('notion-sync-organic-creatives')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notion-sync-organic-creatives');

-- Cria cron: sync criativos pagos (6h e 18h BRT = 9h e 21h UTC)
SELECT cron.schedule(
  'notion-sync-paid-creatives',
  '0 9,21 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/notion-creatives-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY',
      'Content-Type', 'application/json'
    ),
    body    := '{"database_type":"paid","request_source":"cron"}'::jsonb
  );
  $$
);

-- Cria cron: sync criativos orgânicos (6h e 18h BRT = 9h e 21h UTC)
SELECT cron.schedule(
  'notion-sync-organic-creatives',
  '0 9,21 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/notion-creatives-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY',
      'Content-Type', 'application/json'
    ),
    body    := '{"database_type":"organic","request_source":"cron"}'::jsonb
  );
  $$
);
