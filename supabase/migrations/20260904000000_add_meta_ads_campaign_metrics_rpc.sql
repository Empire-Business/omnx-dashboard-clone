-- RPC: agrega metricas de meta_ads_insights por campanha nos ultimos N dias.
-- Usada pela sub-aba Meta Ads no modulo Anuncios.

CREATE OR REPLACE FUNCTION public.get_meta_ads_campaign_metrics(
  p_workspace_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE(
  campaign_id text,
  campaign_name text,
  total_spend numeric,
  total_impressions bigint,
  total_clicks bigint,
  total_leads bigint,
  avg_ctr numeric,
  avg_cpc numeric,
  days_active bigint,
  last_date date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    i.campaign_id,
    i.campaign_name,
    COALESCE(SUM(i.spend), 0) AS total_spend,
    COALESCE(SUM(i.impressions), 0) AS total_impressions,
    COALESCE(SUM(i.clicks), 0) AS total_clicks,
    COALESCE(SUM(i.leads) + SUM(i.onsite_web_leads) + SUM(i.fb_pixel_leads), 0) AS total_leads,
    CASE WHEN SUM(i.impressions) > 0
      THEN SUM(i.clicks)::numeric / SUM(i.impressions)::numeric
      ELSE 0
    END AS avg_ctr,
    CASE WHEN SUM(i.clicks) > 0
      THEN SUM(i.spend) / SUM(i.clicks)::numeric
      ELSE 0
    END AS avg_cpc,
    COUNT(DISTINCT i.date) AS days_active,
    MAX(i.date) AS last_date
  FROM public.meta_ads_insights i
  WHERE i.workspace_id = p_workspace_id
    AND i.campaign_id IS NOT NULL
    AND i.date >= CURRENT_DATE - (p_days || ' days')::interval
  GROUP BY i.campaign_id, i.campaign_name
  ORDER BY total_spend DESC
  LIMIT 100;
$$;

COMMENT ON FUNCTION public.get_meta_ads_campaign_metrics IS
  'Metricas agregadas por campanha Meta nos ultimos N dias (padrao 30). Usada pela sub-aba Meta Ads.';
