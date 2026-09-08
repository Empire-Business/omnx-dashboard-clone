-- Meta Ads insights agregados por campanha/conjunto/anúncio/dia

CREATE OR REPLACE FUNCTION analisar_meta_ads(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'campaign',
  p_campaign_name TEXT DEFAULT NULL,
  p_adset_name TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  group_key TEXT,
  spend NUMERIC,
  impressions BIGINT,
  clicks BIGINT,
  leads BIGINT,
  landing_page_views BIGINT,
  ctr NUMERIC,
  cpm NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      CASE
        WHEN p_group_by = 'campaign' THEN COALESCE(campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(adset_name, 'Sem conjunto')
        WHEN p_group_by = 'ad' THEN COALESCE(ad_name, 'Sem anúncio')
        WHEN p_group_by = 'day' THEN COALESCE(date::TEXT, 'Sem data')
        ELSE 'Total'
      END AS gkey,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(leads) AS leads,
      SUM(landing_page_views) AS lp_views
    FROM meta_ads_insights
    WHERE date >= p_start_date
      AND date <= p_end_date
      AND (p_campaign_name IS NULL OR campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (p_adset_name IS NULL OR adset_name ILIKE '%' || p_adset_name || '%')
    GROUP BY gkey
  )
  SELECT
    a.gkey AS group_key,
    COALESCE(a.spend, 0) AS spend,
    COALESCE(a.impressions, 0)::BIGINT AS impressions,
    COALESCE(a.clicks, 0)::BIGINT AS clicks,
    COALESCE(a.leads, 0)::BIGINT AS leads,
    COALESCE(a.lp_views, 0)::BIGINT AS landing_page_views,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.clicks::NUMERIC / a.impressions) * 100, 2) ELSE 0 END AS ctr,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.spend / a.impressions) * 1000, 2) ELSE 0 END AS cpm
  FROM agg a
  ORDER BY a.spend DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION analisar_meta_ads(DATE, DATE, TEXT, TEXT, TEXT, INTEGER) IS
'Retorna insights da Meta Ads agregados por campanha, adset, anúncio ou dia.';
