-- =============================================================================
-- DIAGNÓSTICO: Meta Ads Sync
-- Execute este script no SQL Editor do Supabase para verificar:
-- 1. Se as tabelas existem
-- 2. Se há dados nelas
-- 3. Se o pg_cron está configurado
-- 4. Qual foi a última sincronização
-- =============================================================================

-- 1. Verificar se as tabelas meta_ads existem
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as colunas
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name LIKE 'meta_ads%'
ORDER BY table_name;

-- 2. Verificar última sincronização (se a tabela existir)
DO $$
DECLARE
    rec RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_ads_sync_log') THEN
        RAISE NOTICE '=== ÚLTIMAS SINCRONIZAÇÕES ===';
        FOR rec IN 
            SELECT * FROM meta_ads_sync_log ORDER BY started_at DESC LIMIT 5
        LOOP
            RAISE NOTICE 'Status: % | Início: % | Fim: % | Registros: %', 
                rec.status, rec.started_at, rec.finished_at, rec.records_fetched;
        END LOOP;
    ELSE
        RAISE NOTICE 'Tabela meta_ads_sync_log NÃO EXISTE';
    END IF;
END $$;

-- 3. Verificar dados em raw_insights (se existir)
SELECT 
    COUNT(*) as total_registros,
    MAX(fetch_finished_at) as ultima_atualizacao,
    MIN(fetch_finished_at) as primeira_atualizacao
FROM meta_ads_raw_insights
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meta_ads_raw_insights');

-- 4. Verificar se pg_cron está instalado e configurado
SELECT 
    extname as extensao,
    extversion as versao
FROM pg_extension 
WHERE extname IN ('pg_cron', 'pg_net');

-- 5. Verificar jobs do pg_cron relacionados ao meta ads
SELECT 
    jobid,
    jobname,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active
FROM cron.job 
WHERE jobname LIKE '%meta%' OR command LIKE '%meta%'
ORDER BY jobid;

-- 6. Verificar histórico de execuções do cron (últimas 10)
SELECT 
    runid,
    jobid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- 7. Verificar se as funções PostgreSQL existem
SELECT 
    routine_name as funcao,
    routine_type as tipo
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%meta%'
ORDER BY routine_name;

-- 8. Contagem de registros por tabela meta_ads
DO $$
DECLARE
    tbl TEXT;
    cnt BIGINT;
BEGIN
    RAISE NOTICE '=== CONTAGEM DE REGISTROS ===';
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name LIKE 'meta_ads%'
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', tbl) INTO cnt;
        RAISE NOTICE '%: % registros', tbl, cnt;
    END LOOP;
END $$;
