-- Migration: Configure Notion Sync CRON Jobs
-- Description: Schedule automatic sync of Notion creatives 2x per day
-- Date: 2026-02-26

-- ============================================================
-- CRON JOB: Sync Paid Creatives (6h e 18h BRT = 9h e 21h UTC)
-- ============================================================

SELECT cron.schedule(
  'notion-sync-paid-creatives',
  '0 9,21 * * *',  -- 6h e 18h horário de Brasília (UTC-3)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/notion-creatives-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'database_type', 'paid',
      'request_source', 'cron'
    )
  );
  $$
);

-- ============================================================
-- CRON JOB: Sync Organic Creatives (6h e 18h BRT = 9h e 21h UTC)
-- ============================================================

SELECT cron.schedule(
  'notion-sync-organic-creatives',
  '0 9,21 * * *',  -- 6h e 18h horário de Brasília (UTC-3)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/notion-creatives-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.supabase_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'database_type', 'organic',
      'request_source', 'cron'
    )
  );
  $$
);

-- ============================================================
-- COMMENT (idempotente: só se a extensão pg_cron existir)
-- Observação: a extensão chama-se "pg_cron" (schema "cron");
-- "COMMENT ON EXTENSION cron" falha em projetos novos (SQLSTATE 42704).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    EXECUTE format('COMMENT ON EXTENSION pg_cron IS %L', 'Notion sync jobs: paid and organic creatives at 6h and 18h BRT (9h and 21h UTC)');
  END IF;
END$$;
