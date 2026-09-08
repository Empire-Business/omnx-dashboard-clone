-- ============================================================
-- Infra de repair de attribution para contatos form-fb
-- Cria mapeamento de custom fields GHL e agenda cron de 5 min
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ghl_custom_field_mappings (
  logical_name TEXT PRIMARY KEY,
  ghl_custom_field_id TEXT NOT NULL UNIQUE,
  field_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ghl_custom_field_mappings IS
'Mapeamento entre nome lógico do projeto e ID real do custom field do GHL.';

COMMENT ON COLUMN public.ghl_custom_field_mappings.logical_name IS
'Nome lógico usado no código (ex: utm_source, tt_content).';

COMMENT ON COLUMN public.ghl_custom_field_mappings.ghl_custom_field_id IS
'ID do custom field do GHL retornado por GET /locations/{locationId}/customFields.';

INSERT INTO public.ghl_custom_field_mappings (logical_name, ghl_custom_field_id, field_key, enabled)
VALUES
  ('utm_source',   'BeZlZgTZedSXh7WOMb0W', 'contact.utm_source',   true),
  ('utm_campaign', 's49ocZH0HpfSmfGVKGeI', 'contact.utm_campaign', true),
  ('utm_medium',   'vygws99BOTOH209Eg8E6', 'contact.utm_medium',   true),
  ('utm_content',  'zstms0PuQ1SIhAZ02Hx8', 'contact.utm_content',  true),
  ('utm_term',     'Uin8EAp165gnB5bNmi3x', 'contact.utm_term',     true),
  ('tt_content',   'XOiBY347RGJQ1qh2PZAL', 'contact.tt_content',   true),
  ('tt_term',      'S3OVITvwZdLMswVNgFQT', 'contact.tt_term',      true),
  ('tt_campaign',  '22dzhSoOwE60prUlvmoC', 'contact.tt_campaign',  true),
  ('tt_source',    'FoZhxGFs2uDNmlejxAiS', 'contact.tt_source',    true),
  ('tt_medium',    'ZKNu0k0DMGTTDFUra5bw', 'contact.tt_medium',    true)
ON CONFLICT (logical_name) DO UPDATE
SET
  ghl_custom_field_id = EXCLUDED.ghl_custom_field_id,
  field_key = EXCLUDED.field_key,
  enabled = EXCLUDED.enabled,
  updated_at = now();

-- Cron function
DROP FUNCTION IF EXISTS public.sync_contact_attribution_job();

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
      'Authorization', 'Bearer <SERVICE_ROLE_KEY_REDACTED>'
    ),
    body := jsonb_build_object(
      'batch_size', 100,
      'apply_batch_size', 300
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$$;

SELECT cron.unschedule('sync-contact-attribution')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sync-contact-attribution'
);

SELECT cron.schedule(
  'sync-contact-attribution',
  '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
  'SELECT public.sync_contact_attribution_job()'
);
