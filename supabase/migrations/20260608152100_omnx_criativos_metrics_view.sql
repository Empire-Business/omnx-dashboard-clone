-- Migration: Criar view e RPC de métricas por criativo
-- Descrição: Agrega dados Meta Ads + CRM por criativo (CR-xxx)
-- Projeto: OMNX Criativos
-- Data: 2026-06-08

-- ============================================================
-- VIEW: v_creative_metrics
-- Métricas agregadas por criativo (join Meta + CRM)
-- ============================================================
CREATE OR REPLACE VIEW v_creative_metrics AS
WITH meta_by_creative AS (
  SELECT
    (regexp_match(ad_name, 'CR-(\d+)'))[1] AS creative_num,
    SUM(spend) AS total_spend,
    SUM(impressions) AS total_impressions,
    SUM(clicks) AS total_clicks,
    SUM(leads) AS total_leads_meta,
    SUM(landing_page_views) AS total_lp_views,
    SUM(video_views) AS total_video_views,
    AVG(ctr) AS avg_ctr,
    AVG(cpm) AS avg_cpm
  FROM meta_ads_insights
  WHERE ad_name ~ 'CR-\d+'
  GROUP BY creative_num
),
crm_by_creative AS (
  SELECT
    (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS creative_num,
    COUNT(*) AS total_leads_crm,
    COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS total_mql,
    COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) AS total_reunioes,
    COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS total_vendas,
    COALESCE(SUM(vf.valor_faturado), 0) AS total_faturamento,
    COALESCE(SUM(vf.valor_entrada), 0) AS total_caixa
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
  WHERE c.utm_term ~ 'CR-\d+'
  GROUP BY creative_num
)
SELECT
  'CR-' || m.creative_num AS creative_code,
  nc.id AS creative_id,
  nc.workspace_id,
  nc.name AS creative_name,
  nc.external_id,
  nc.format,
  nc.profile,
  
  -- Métricas Meta
  m.total_spend,
  m.total_impressions,
  m.total_clicks,
  m.total_leads_meta,
  m.total_lp_views,
  m.total_video_views,
  m.avg_ctr,
  m.avg_cpm,
  
  -- Métricas CRM
  COALESCE(c.total_leads_crm, 0) AS leads_crm,
  COALESCE(c.total_mql, 0) AS mql_count,
  COALESCE(c.total_reunioes, 0) AS reunioes,
  COALESCE(c.total_vendas, 0) AS vendas,
  COALESCE(c.total_faturamento, 0) AS faturamento,
  COALESCE(c.total_caixa, 0) AS caixa,
  
  -- Métricas derivadas
  CASE WHEN c.total_leads_crm > 0 
    THEN m.total_spend / c.total_leads_crm 
  END AS cpl_crm,
  CASE WHEN c.total_mql > 0 
    THEN m.total_spend / c.total_mql 
  END AS cpmql,
  CASE WHEN c.total_vendas > 0 
    THEN m.total_spend / c.total_vendas 
  END AS cpv,
  CASE WHEN m.total_spend > 0 
    THEN c.total_faturamento / m.total_spend 
  END AS roas
  
FROM meta_by_creative m
LEFT JOIN crm_by_creative c ON c.creative_num = m.creative_num
LEFT JOIN notion_creatives nc ON nc.external_id = 'CR-' || m.creative_num
  AND nc.database_type = 'paid';

-- ============================================================
-- RPC: get_creative_metrics
-- Função parametrizada para consumo pelo app
-- ============================================================
CREATE OR REPLACE FUNCTION get_creative_metrics(
  p_workspace_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_creative_id UUID DEFAULT NULL
)
RETURNS TABLE (
  creative_code TEXT,
  creative_id UUID,
  creative_name TEXT,
  total_spend NUMERIC,
  total_impressions BIGINT,
  total_clicks BIGINT,
  leads_crm BIGINT,
  mql_count BIGINT,
  cpl_crm NUMERIC,
  cpmql NUMERIC,
  vendas BIGINT,
  faturamento NUMERIC,
  roas NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
    GROUP BY cr_num
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS cr_num,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    'CR-' || m.cr_num,
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
  LEFT JOIN crm_agg c ON c.cr_num = m.cr_num
  LEFT JOIN notion_creatives nc ON nc.external_id = 'CR-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$$;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
