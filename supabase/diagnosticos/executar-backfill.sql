-- Executar backfill para recuperar dados de 20/02 a 24/02
SELECT backfill_meta_ads_job('2026-02-20'::DATE, '2026-02-24'::DATE);

-- Verificar status após execução
SELECT * FROM verificar_status_backfill();
