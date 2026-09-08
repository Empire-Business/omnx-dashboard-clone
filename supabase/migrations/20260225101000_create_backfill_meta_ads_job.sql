-- Migration: Criar função para chamar backfill via pg_cron ou manual
-- Data: 2026-02-25
-- Descrição: Permite executar backfill de dados históricos do Meta Ads

-- Função para chamar a Edge Function de backfill
CREATE OR REPLACE FUNCTION backfill_meta_ads_job(
    p_data_inicio DATE DEFAULT (CURRENT_DATE - INTERVAL '7 days')::DATE,
    p_data_fim DATE DEFAULT (CURRENT_DATE - INTERVAL '1 day')::DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_url TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill';
    v_service_key TEXT := '<SERVICE_ROLE_KEY_REDACTED>';
    v_request_id BIGINT;
    v_body JSONB;
BEGIN
    -- Montar body da requisição
    v_body := jsonb_build_object(
        'data_inicio', to_char(p_data_inicio, 'YYYY-MM-DD'),
        'data_fim', to_char(p_data_fim, 'YYYY-MM-DD')
    );
    
    -- Fazer requisição HTTP
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := v_body
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | Período: ' || p_data_inicio || ' a ' || p_data_fim;
END;
$$;

-- Comentário na função
COMMENT ON FUNCTION backfill_meta_ads_job(DATE, DATE) IS 
'Chama a Edge Function sync-meta-ads-backfill para recuperar dados históricos do Meta Ads';

-- Criar função auxiliar para verificar status do backfill
CREATE OR REPLACE FUNCTION verificar_status_backfill()
RETURNS TABLE (
    id UUID,
    data_inicio DATE,
    data_fim DATE,
    status TEXT,
    dias_total BIGINT,
    dias_processados BIGINT,
    dias_com_erro BIGINT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.data_inicio,
        c.data_fim,
        c.status,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id) as dias_total,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id AND l.status = 'success') as dias_processados,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id AND l.status = 'error') as dias_com_erro,
        c.created_at
    FROM meta_ads_backfill_controle c
    ORDER BY c.created_at DESC
    LIMIT 10;
END;
$$;

COMMENT ON FUNCTION verificar_status_backfill() IS 
'Retorna status dos últimos backfills executados';
