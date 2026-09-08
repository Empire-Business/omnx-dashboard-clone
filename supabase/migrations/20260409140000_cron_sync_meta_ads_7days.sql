-- =============================================================================
-- Migration: Cron diário sync-meta-ads — últimos 7 dias
-- Data: 2026-04-09
--
-- Propósito: Propagar renomeações de anúncios para dados históricos.
--   O cron horário (sync-meta-ads-hourly) sincroniza apenas "today".
--   Quando um anúncio é renomeado no Meta, o nome antigo permanece nos
--   dias anteriores. Este cron diário re-sincroniza os últimos 7 dias,
--   aplicando o ON CONFLICT DO UPDATE com os nomes atualizados.
--
-- Schedule: Todo dia às 06:00 UTC (03:00 BRT)
--   - Não colide com sync-meta-ads-hourly (0 * * * *)
--   - Roda na madrugada, menor pressão de rate limit na Meta API
--   - 7 dias em uma única chamada paginada (~50-100 registros) — leve
--
-- Custo Meta API: 1 chamada paginada por execução (time_range de 7 dias)
--   Bem abaixo dos rate limits. Edge function processa em ~10-30s.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE 'pg_cron não está instalado. Instale manualmente via Supabase Dashboard.';
        RETURN;
    END IF;

    -- Remover cron anterior se existir (idempotência)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-meta-ads-7days-daily') THEN
        PERFORM cron.unschedule('sync-meta-ads-7days-daily');
    END IF;

    PERFORM cron.schedule(
        'sync-meta-ads-7days-daily',
        '0 6 * * *',
        $cmd$
            SELECT net.http_post(
                url     := current_setting('app.settings.supabase_url', true)
                           || '/functions/v1/sync-meta-ads',
                headers := jsonb_build_object(
                    'Content-Type',  'application/json',
                    'Authorization', 'Bearer '
                        || current_setting('app.settings.anon_key', true)
                ),
                body    := '{"days_back": 7}'::jsonb
            ) AS request_id;
        $cmd$
    );

    RAISE NOTICE '=== Cron sync-meta-ads-7days-daily registrado ===';
    RAISE NOTICE 'Schedule: 0 6 * * * (03:00 BRT)';
    RAISE NOTICE 'Propósito: Re-sincronizar últimos 7 dias para atualizar nomes de anúncios';
END;
$$;

-- =============================================================================
-- ALTERNATIVA: Se app.settings.supabase_url não estiver configurado,
-- execute manualmente no SQL Editor do Supabase:
--
-- SELECT cron.unschedule('sync-meta-ads-7days-daily');
-- SELECT cron.schedule(
--     'sync-meta-ads-7days-daily',
--     '0 6 * * *',
--     $$
--         SELECT net.http_post(
--             url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads',
--             headers := '{"Content-Type":"application/json","Authorization":"Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY"}'::jsonb,
--             body    := '{"days_back": 7}'::jsonb
--         ) AS request_id;
--     $$
-- );
-- =============================================================================
