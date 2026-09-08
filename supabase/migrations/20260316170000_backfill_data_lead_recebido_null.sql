-- Migration: Backfill data_lead_recebido = NULL (5 opps)
-- Data: 2026-03-16
-- Razão: 5 oportunidades sem data_lead_recebido ficam invisíveis no cohort
-- Solução: disparar edge function sync-opp-dates que busca createdAt via API GHL

SELECT net.http_post(
  url     := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates',
  headers := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
  ),
  body    := jsonb_build_object('batch_size', 10)
) AS request_id;
