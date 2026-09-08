-- =============================================================================
-- Migration: Recriar sync_meta_ads_job com credenciais hardcoded
-- Como não podemos usar ALTER DATABASE SET, hardcodamos os valores na função
-- =============================================================================

-- Dropar função existente
DROP FUNCTION IF EXISTS sync_meta_ads_job();

-- Recriar função com credenciais do projeto
CREATE OR REPLACE FUNCTION sync_meta_ads_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads';
    v_service_key TEXT := '<SERVICE_ROLE_KEY_REDACTED>';
    v_request_id BIGINT;
BEGIN
    -- Fazer requisição HTTP para a Edge Function
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;
