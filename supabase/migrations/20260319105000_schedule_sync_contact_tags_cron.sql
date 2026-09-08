-- ============================================================
-- Migration: Configura pg_cron para sync automático de tags de contatos
-- Executa a cada 15 minutos
-- Data: 2026-03-17
-- ============================================================

-- Dropar job anterior se existir (idempotente)
SELECT cron.unschedule('sync-contact-tags')
WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'sync-contact-tags'
);

-- Função SQL que dispara a Edge Function via pg_net
DROP FUNCTION IF EXISTS sync_contact_tags_job();

CREATE OR REPLACE FUNCTION sync_contact_tags_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url         TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-tags';
    v_service_key TEXT := '<SERVICE_ROLE_KEY_REDACTED>';
    v_request_id  BIGINT;
BEGIN
    SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body    := '{"batch_size": 100}'::jsonb
    ) INTO v_request_id;

    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;

-- Agendar job a cada 15 minutos
SELECT cron.schedule(
    'sync-contact-tags',
    '*/15 * * * *',
    'SELECT sync_contact_tags_job()'
);
