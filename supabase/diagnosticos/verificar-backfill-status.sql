-- ========================================
-- VERIFICAR STATUS DO BACKFILL
-- Execute no SQL Editor do Supabase Dashboard
-- ========================================

-- 1. Verificar se o backfill foi criado
SELECT 
    id,
    data_inicio,
    data_fim,
    status,
    created_at
FROM meta_ads_backfill_controle
ORDER BY created_at DESC
LIMIT 5;

-- 2. Verificar progresso detalhado por dia
SELECT 
    data,
    status,
    registros,
    error_message,
    processed_at
FROM meta_ads_backfill_log
WHERE controle_id = (SELECT id FROM meta_ads_backfill_controle ORDER BY created_at DESC LIMIT 1)
ORDER BY data;

-- 3. Verificar total de registros na tabela insights
SELECT 
    COUNT(*) as total_registros,
    MIN(fetched_at) as primeira_data,
    MAX(fetched_at) as ultima_data
FROM meta_ads_insights;

-- 4. Verificar registros por data
SELECT 
    DATE(fetched_at) as data,
    COUNT(*) as total_registros
FROM meta_ads_insights
GROUP BY DATE(fetched_at)
ORDER BY data DESC
LIMIT 10;

-- 5. Verificar se tem dados de 20/02 a 24/02
SELECT 
    DATE(fetched_at) as data,
    COUNT(*) as registros
FROM meta_ads_insights
WHERE DATE(fetched_at) BETWEEN '2026-02-20' AND '2026-02-25'
GROUP BY DATE(fetched_at)
ORDER BY data;
