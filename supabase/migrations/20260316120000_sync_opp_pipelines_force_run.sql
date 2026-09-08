-- Migration: Forçar sincronização de pipeline_name NULL imediatamente
-- Data: 2026-03-16
-- Razão: Maria Clara + 1000+ oups com pipeline_name=NULL mas pipeline_id preenchido
-- Não seriam sincronizadas com a lógica anterior (apenas pipeline_id=NULL)

-- Disparar edge function sync-opp-pipelines com batch_size=100 (vai sincronizar tudo)
-- Isso vai processar oups onde pipeline_id=NULL OU pipeline_name=NULL
SELECT net.http_post(
  url := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-pipelines',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
  ),
  body := jsonb_build_object('batch_size', 500)
) as request_id;
