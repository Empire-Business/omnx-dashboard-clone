-- Suporta criativos nativos com prefixo AN- além dos criativos do Notion (CR-).
-- Mantém sync com Notion ativo e garante que métricas casem ambos os prefixos.

-- 1. Garante default para source e backfill dos registros existentes
ALTER TABLE notion_creatives
  ALTER COLUMN source SET DEFAULT 'native';

ALTER TABLE notion_creatives
  DROP CONSTRAINT IF EXISTS notion_creatives_source_check;

ALTER TABLE notion_creatives
  ADD CONSTRAINT notion_creatives_source_check CHECK (source IN ('notion', 'native', 'import'));

UPDATE notion_creatives
  SET source = 'notion'
  WHERE source IS NULL OR source = '';

-- 2. Recria view v_creative_metrics reconhecendo CR- e AN-
CREATE OR REPLACE VIEW v_creative_metrics AS
WITH meta_by_creative AS (
  SELECT
    (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[2] AS creative_num,
    (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[1] AS creative_prefix,
    SUM(meta_ads_insights.spend) AS total_spend,
    SUM(meta_ads_insights.impressions) AS total_impressions,
    SUM(meta_ads_insights.clicks) AS total_clicks,
    SUM(meta_ads_insights.leads) AS total_leads_meta,
    SUM(meta_ads_insights.landing_page_views) AS total_lp_views,
    SUM(meta_ads_insights.video_views) AS total_video_views,
    AVG(meta_ads_insights.ctr) AS avg_ctr,
    AVG(meta_ads_insights.cpm) AS avg_cpm
  FROM meta_ads_insights
  WHERE meta_ads_insights.ad_name ~ '(CR|AN)-\d+'::text
  GROUP BY
    (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[2],
    (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[1]
),
crm_by_creative AS (
  SELECT
    (regexp_match(c.utm_term, '(CR|AN)-(\d+)'::text))[2] AS creative_num,
    (regexp_match(c.utm_term, '(CR|AN)-(\d+)'::text))[1] AS creative_prefix,
    COUNT(*) AS total_leads_crm,
    COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS total_mql,
    COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) AS total_reunioes,
    COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS total_vendas,
    COALESCE(SUM(vf.valor_faturado), 0) AS total_faturamento,
    COALESCE(SUM(vf.valor_entrada), 0) AS total_caixa
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
  WHERE c.utm_term ~ '(CR|AN)-\d+'::text
  GROUP BY
    (regexp_match(c.utm_term, '(CR|AN)-(\d+)'::text))[2],
    (regexp_match(c.utm_term, '(CR|AN)-(\d+)'::text))[1]
)
SELECT
  m.creative_prefix || '-' || m.creative_num AS creative_code,
  nc.id AS creative_id,
  nc.workspace_id,
  nc.name AS creative_name,
  nc.external_id,
  nc.format,
  nc.profile,
  m.total_spend,
  m.total_impressions,
  m.total_clicks,
  m.total_leads_meta,
  m.total_lp_views,
  m.total_video_views,
  m.avg_ctr,
  m.avg_cpm,
  COALESCE(c.total_leads_crm, 0) AS leads_crm,
  COALESCE(c.total_mql, 0) AS mql_count,
  COALESCE(c.total_reunioes, 0) AS reunioes,
  COALESCE(c.total_vendas, 0) AS vendas,
  COALESCE(c.total_faturamento, 0) AS faturamento,
  COALESCE(c.total_caixa, 0) AS caixa,
  CASE WHEN c.total_leads_crm > 0 THEN m.total_spend / c.total_leads_crm::numeric ELSE NULL END AS cpl_crm,
  CASE WHEN c.total_mql > 0 THEN m.total_spend / c.total_mql::numeric ELSE NULL END AS cpmql,
  CASE WHEN c.total_vendas > 0 THEN m.total_spend / c.total_vendas::numeric ELSE NULL END AS cpv,
  CASE WHEN m.total_spend > 0 THEN c.total_faturamento / m.total_spend ELSE NULL END AS roas
FROM meta_by_creative m
LEFT JOIN crm_by_creative c
  ON c.creative_num = m.creative_num AND c.creative_prefix = m.creative_prefix
LEFT JOIN notion_creatives nc
  ON nc.external_id = m.creative_prefix || '-' || m.creative_num
  AND nc.database_type = 'paid'::text;

-- 3. Atualiza RPC get_creative_metrics (assinatura curta)
CREATE OR REPLACE FUNCTION get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

-- 4. Atualiza RPC get_creative_metrics (assinatura longa com filtros)
CREATE OR REPLACE FUNCTION get_creative_metrics(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_creative_id uuid DEFAULT NULL::uuid,
  p_campaign_names text[] DEFAULT NULL::text[],
  p_adset_names text[] DEFAULT NULL::text[],
  p_ad_names text[] DEFAULT NULL::text[],
  p_channels text[] DEFAULT NULL::text[],
  p_funil_tags text[] DEFAULT NULL::text[],
  p_cp_tags text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  creative_code text, creative_id uuid, creative_name text,
  total_spend numeric, total_impressions bigint, total_clicks bigint,
  leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric,
  vendas bigint, faturamento numeric, roas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign_codes text[];
  v_funil_codes text[];
  v_cp_codes text[];
  v_channel_public_codes text[];
BEGIN
  IF p_campaign_names IS NOT NULL AND array_length(p_campaign_names, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_campaign_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_campaign_names);
  END IF;

  IF p_funil_tags IS NOT NULL AND array_length(p_funil_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_funil_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(uc.funnels) AS f WHERE f = ANY(p_funil_tags)
      );
  END IF;

  IF p_cp_tags IS NOT NULL AND array_length(p_cp_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_cp_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_cp_tags);
  END IF;

  IF p_channels IS NOT NULL AND array_length(p_channels, 1) > 0 THEN
    SELECT array_agg(DISTINCT us.public_code)
    INTO v_channel_public_codes
    FROM utm_sources us
    WHERE us.workspace_id = p_workspace_id
      AND us.utm_source = ANY(p_channels)
      AND us.public_code IS NOT NULL;
  END IF;

  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
      AND (p_campaign_names IS NULL OR array_length(p_campaign_names, 1) IS NULL OR mai.campaign_name = ANY(p_campaign_names))
      AND (p_adset_names IS NULL OR array_length(p_adset_names, 1) IS NULL OR mai.adset_name = ANY(p_adset_names))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR mai.ad_name = ANY(p_ad_names)
        OR ((regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] || '-' || (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2]) = ANY(p_ad_names)
      )
      AND (
        v_channel_public_codes IS NULL OR array_length(v_channel_public_codes, 1) IS NULL
        OR mai.ad_name ~ ANY(v_channel_public_codes)
      )
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
      AND (p_channels IS NULL OR array_length(p_channels, 1) IS NULL OR c.utm_source = ANY(p_channels))
      AND (v_campaign_codes IS NULL OR array_length(v_campaign_codes, 1) IS NULL OR c.utm_campaign = ANY(v_campaign_codes))
      AND (v_funil_codes IS NULL OR array_length(v_funil_codes, 1) IS NULL OR c.utm_campaign = ANY(v_funil_codes))
      AND (v_cp_codes IS NULL OR array_length(v_cp_codes, 1) IS NULL OR c.utm_campaign = ANY(v_cp_codes))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR c.utm_term = ANY(p_ad_names)
      )
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$;

COMMENT ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid) IS
  'Retorna métricas agregadas por criativo (CR- ou AN-) sem filtros avançados.';

COMMENT ON FUNCTION public.get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[]) IS
  'Retorna métricas agregadas por criativo (CR- ou AN-) com filtros de campanha, conjunto, anúncio, canal, funil e campanha [cp].';

-- 5. RPC auxiliar para gerar próximo ID sequencial por workspace e prefixo
CREATE OR REPLACE FUNCTION get_max_creative_number(p_workspace_id uuid, p_prefix text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(
    (regexp_match(external_id, '^' || p_prefix || '-(\d+)$'))[1]::bigint
  ), 0)
  FROM notion_creatives
  WHERE workspace_id = p_workspace_id
    AND external_id ~ ('^' || p_prefix || '-\d+$');
$$;

COMMENT ON FUNCTION public.get_max_creative_number(uuid, text) IS
  'Retorna o maior número sequencial já usado para um prefixo (CR ou AN) no workspace.';
