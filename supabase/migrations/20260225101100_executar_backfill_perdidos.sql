-- Migration: Executar backfill para recuperar dados perdidos
-- Data: 2026-02-25
-- Descrição: Recupera dados de 20/02 a 24/02 que não foram sincronizados

-- Executar backfill para o período perdido
SELECT backfill_meta_ads_job('2026-02-20'::DATE, '2026-02-24'::DATE);

-- Verificar status
SELECT 
    id,
    data_inicio,
    data_fim,
    status,
    created_at
FROM meta_ads_backfill_controle
ORDER BY created_at DESC
LIMIT 1;
