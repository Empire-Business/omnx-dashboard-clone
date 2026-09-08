-- ============================================================
-- Fix: cron sync_contact_attribution_job usava token placeholder
--
-- A migration original (20260408190000) tinha 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
-- como literal — o pg_cron enviava exatamente essa string como Authorization,
-- causando 401 em toda execução silenciosamente.
--
-- A edge function foi também redeployada com verify_jwt=false, então
-- qualquer token (inclusive a anon key) é aceito. Usamos a anon key
-- hardcoded — mesmo padrão dos outros crons do projeto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_contact_attribution_job()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT := 'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-attribution';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer REMOVED_ANON_KEY_SET_ENV_VAR_SUPABASE_ANON_KEY'
    ),
    body := jsonb_build_object(
      'batch_size',       100,
      'apply_batch_size', 300
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;
