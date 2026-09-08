-- ============================================================
-- Migration: Configura pg_cron para sync automático de conversas GHL
-- Executa a cada 2 horas (modo incremental)
-- Data: 2026-03-11
-- ============================================================

-- Dropar job anterior se existir (idempotente)
SELECT cron.unschedule('sync-ghl-conversations-incremental')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-ghl-conversations-incremental'
);

-- Função SQL que dispara a Edge Function via pg_net
DROP FUNCTION IF EXISTS sync_ghl_conversations_job();

CREATE OR REPLACE FUNCTION sync_ghl_conversations_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url         TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-ghl-conversations';
    v_service_key TEXT := '<SERVICE_ROLE_KEY_REDACTED>';
    v_request_id  BIGINT;
BEGIN
    SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body    := '{"mode": "incremental"}'::jsonb
    ) INTO v_request_id;

    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;

-- Agendar job a cada 2 horas
-- Horários: 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00
SELECT cron.schedule(
    'sync-ghl-conversations-incremental',
    '0 */2 * * *',
    'SELECT sync_ghl_conversations_job()'
);
