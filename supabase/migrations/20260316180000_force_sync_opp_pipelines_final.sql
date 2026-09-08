-- Migration: Forçar sincronização final de pipeline_name = NULL (4 registros)
-- Data: 2026-03-16
-- Motivo: 4 opps ainda com pipeline_name NULL apesar de terem pipeline_id válido
-- Ação: Disparar sync-opp-pipelines com batch maior para garantir

SELECT net.http_post(
  url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
  ),
  body    := jsonb_build_object('batch_size', 10)
) AS request_id;
