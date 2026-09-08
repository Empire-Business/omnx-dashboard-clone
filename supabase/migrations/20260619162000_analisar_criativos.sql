-- Análise de criativos/anúncios: investimento Meta × vendas CRM
-- Agrupa por criativo (CR-xxx), anúncio, campanha ou conjunto.

CREATE OR REPLACE FUNCTION analisar_criativos(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'creative',
  p_creative_id TEXT DEFAULT NULL,
  p_campaign_name TEXT DEFAULT NULL,
  p_min_spend NUMERIC DEFAULT 0,
  p_limit INTEGER DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  creative_code TEXT,
  creative_name TEXT,
  status TEXT,
  spend NUMERIC,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  cpm NUMERIC,
  leads_meta BIGINT,
  leads_crm BIGINT,
  mqls BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  cpl_crm NUMERIC,
  cpmql NUMERIC,
  cpv NUMERIC,
  roas NUMERIC,
  roas_caixa NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH meta_raw AS (
    SELECT
      CASE
        WHEN p_group_by = 'ad' THEN COALESCE(mai.ad_name, 'Sem anúncio')
        WHEN p_group_by = 'campaign' THEN COALESCE(mai.campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(mai.adset_name, 'Sem conjunto')
        ELSE (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
      END AS meta_key,
      CASE
        WHEN p_group_by = 'creative' THEN (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
        ELSE NULL
      END AS creative_num,
      mai.spend,
      mai.impressions,
      mai.clicks,
      mai.leads
    FROM meta_ads_insights mai
    WHERE mai.date >= p_start_date
      AND mai.date <= p_end_date
      AND (p_campaign_name IS NULL OR mai.campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (
        p_group_by != 'creative' OR mai.ad_name ~ 'CR-(\d+)'
      )
  ),
  meta_aggr AS (
    SELECT
      mr.meta_key,
      mr.creative_num,
      SUM(mr.spend) AS sum_spend,
      SUM(mr.impressions)::BIGINT AS sum_impressions,
      SUM(mr.clicks)::BIGINT AS sum_clicks,
      SUM(mr.leads)::BIGINT AS sum_leads_meta
    FROM meta_raw mr
    GROUP BY mr.meta_key, mr.creative_num
  ),
  crm_raw AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS crm_key,
      o.id AS opp_id,
      c.tags,
      vf.id AS venda_id,
      vf.valor_faturado,
      vf.valor_entrada
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id AND vf.data_pagamento_entrada IS NOT NULL
    WHERE o.data_lead_recebido >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND o.data_lead_recebido < ((p_end_date + INTERVAL '1 day')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND c.utm_term IS NOT NULL
      AND c.utm_term ~ 'CR-(\d+)'
      AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
  ),
  crm_aggr AS (
    SELECT
      cr.crm_key,
      COUNT(DISTINCT cr.opp_id)::BIGINT AS sum_leads_crm,
      COUNT(DISTINCT cr.opp_id) FILTER (WHERE cr.tags IS NOT NULL AND cr.tags::TEXT ILIKE '%MQL%')::BIGINT AS sum_mqls,
      COUNT(DISTINCT cr.venda_id) FILTER (WHERE cr.venda_id IS NOT NULL)::BIGINT AS sum_vendas,
      SUM(COALESCE(cr.valor_faturado, 0)) AS sum_faturamento,
      SUM(COALESCE(cr.valor_entrada, 0)) AS sum_caixa
    FROM crm_raw cr
    GROUP BY cr.crm_key
  ),
  all_keys AS (
    SELECT meta_key AS jkey FROM meta_aggr
    UNION
    SELECT crm_key AS jkey FROM crm_aggr
  ),
  joined AS (
    SELECT
      ak.jkey,
      ma.creative_num,
      COALESCE(ma.sum_spend, 0) AS sum_spend,
      COALESCE(ma.sum_impressions, 0) AS sum_impressions,
      COALESCE(ma.sum_clicks, 0) AS sum_clicks,
      COALESCE(ma.sum_leads_meta, 0) AS sum_leads_meta,
      COALESCE(ca.sum_leads_crm, 0) AS sum_leads_crm,
      COALESCE(ca.sum_mqls, 0) AS sum_mqls,
      COALESCE(ca.sum_vendas, 0) AS sum_vendas,
      COALESCE(ca.sum_faturamento, 0) AS sum_faturamento,
      COALESCE(ca.sum_caixa, 0) AS sum_caixa
    FROM all_keys ak
    LEFT JOIN meta_aggr ma ON ma.meta_key = ak.jkey
    LEFT JOIN crm_aggr ca ON ca.crm_key = ak.jkey
  ),
  enriched AS (
    SELECT
      j.jkey,
      j.creative_num,
      nc.name AS notion_name,
      nc.status AS notion_status,
      j.sum_spend,
      j.sum_impressions,
      j.sum_clicks,
      j.sum_leads_meta,
      j.sum_leads_crm,
      j.sum_mqls,
      j.sum_vendas,
      j.sum_faturamento,
      j.sum_caixa,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_clicks::NUMERIC / j.sum_impressions) * 100, 2) ELSE 0 END AS calc_ctr,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_spend / j.sum_impressions) * 1000, 2) ELSE 0 END AS calc_cpm,
      CASE WHEN j.sum_leads_crm > 0 THEN ROUND(j.sum_spend / j.sum_leads_crm, 2) ELSE 0 END AS calc_cpl_crm,
      CASE WHEN j.sum_mqls > 0 THEN ROUND(j.sum_spend / j.sum_mqls, 2) ELSE 0 END AS calc_cpmql,
      CASE WHEN j.sum_vendas > 0 THEN ROUND(j.sum_spend / j.sum_vendas, 2) ELSE 0 END AS calc_cpv,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_faturamento / j.sum_spend, 2) ELSE 0 END AS calc_roas,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_caixa / j.sum_spend, 2) ELSE 0 END AS calc_roas_caixa
    FROM joined j
    LEFT JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || j.creative_num
      AND nc.database_type = 'paid'
  )
  SELECT
    e.jkey AS group_key,
    ('CR-' || e.creative_num)::TEXT AS creative_code,
    COALESCE(e.notion_name, 'Criativo ' || 'CR-' || e.creative_num) AS creative_name,
    COALESCE(e.notion_status, 'Desconhecido') AS status,
    e.sum_spend,
    e.sum_impressions,
    e.sum_clicks,
    e.calc_ctr,
    e.calc_cpm,
    e.sum_leads_meta,
    e.sum_leads_crm,
    e.sum_mqls,
    e.sum_vendas,
    e.sum_faturamento,
    e.sum_caixa,
    e.calc_cpl_crm,
    e.calc_cpmql,
    e.calc_cpv,
    e.calc_roas,
    e.calc_roas_caixa
  FROM enriched e
  WHERE e.sum_spend >= COALESCE(p_min_spend, 0)
    AND (p_creative_id IS NULL OR e.jkey ILIKE '%' || p_creative_id || '%')
  ORDER BY e.sum_spend DESC
  LIMIT COALESCE(p_limit, 10000);
END;
$$;

COMMENT ON FUNCTION analisar_criativos(DATE, DATE, TEXT, TEXT, TEXT, NUMERIC, INTEGER) IS
'Retorna métricas de criativos/anúncios da Meta Ads cruzadas com vendas do CRM via padrão CR-xxx.';
