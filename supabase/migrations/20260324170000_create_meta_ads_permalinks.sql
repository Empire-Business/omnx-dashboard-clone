-- Migration: Cria tabela meta_ads_permalinks
-- Armazena URLs públicos dos anúncios via Meta Marketing API
-- Populada pela edge function sync-ad-permalinks (cron diário)

CREATE TABLE IF NOT EXISTS meta_ads_permalinks (
  ad_id                   TEXT        PRIMARY KEY,
  creative_code           TEXT,                      -- CR-XXX extraído do ad_name
  instagram_permalink_url TEXT,                      -- Link do post no Instagram
  permalink_url           TEXT,                      -- Link do post no Facebook
  fetched_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_ads_permalinks_creative_code_idx
  ON meta_ads_permalinks (creative_code);

COMMENT ON TABLE meta_ads_permalinks IS
  'URLs públicos dos anúncios Meta (Instagram/Facebook) sincronizados via Meta Marketing API. '
  'Populada pela edge function sync-ad-permalinks.';

COMMENT ON COLUMN meta_ads_permalinks.ad_id IS
  'ID do anúncio na Meta Marketing API.';

COMMENT ON COLUMN meta_ads_permalinks.creative_code IS
  'Código do criativo no formato CR-XXX, extraído do campo ad_name do Meta.';

COMMENT ON COLUMN meta_ads_permalinks.instagram_permalink_url IS
  'URL pública do post no Instagram. Preferencial para exibição.';

COMMENT ON COLUMN meta_ads_permalinks.permalink_url IS
  'URL pública do post no Facebook. Fallback quando instagram_permalink_url está vazio.';

-- Cron: rodar sync-ad-permalinks todo dia às 02:00 BRT (05:00 UTC)
SELECT cron.schedule(
  'sync-ad-permalinks-daily',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.supabase_url') || '/functions/v1/sync-ad-permalinks',
    body   := '{"request_source":"cron"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
  $$
);
