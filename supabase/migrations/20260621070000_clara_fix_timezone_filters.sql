-- Corrige filtros de data em RPCs que usavam conversão de timezone ambígua.
-- O padrão antigo (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo') era sensível ao
-- timezone da sessão do banco e podia deslocar o início/fim do período em 3h.
-- Novo padrão: constrói literal TIMESTAMPTZ com offset -03:00 explicitamente.

CREATE OR REPLACE FUNCTION analisar_vendas(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_closer_name TEXT DEFAULT NULL,
  p_produto TEXT DEFAULT NULL,
  p_forma_pagamento TEXT DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  ticket_medio NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      vf.id,
      vf.oportunidade_id,
      vf.valor_faturado,
      vf.valor_entrada,
      COALESCE(vf.closer_nome, o.vendedor_closer, 'Sem closer') AS closer,
      vf.produto_vendido AS produto,
      vf.forma_pagamento AS forma
    FROM vendas_fechamento vf
    JOIN oportunidades o ON o.id = vf.oportunidade_id
    WHERE vf.data_pagamento_entrada IS NOT NULL
      AND vf.data_pagamento_entrada >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_closer_name IS NULL OR COALESCE(vf.closer_nome, o.vendedor_closer, '') ILIKE '%' || p_closer_name || '%')
      AND (p_produto IS NULL OR vf.produto_vendido ILIKE '%' || p_produto || '%')
      AND (p_forma_pagamento IS NULL OR vf.forma_pagamento ILIKE '%' || p_forma_pagamento || '%')
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'closer' THEN COALESCE(b.closer, 'Sem closer')
        WHEN p_group_by = 'product' THEN COALESCE(b.produto, 'Sem produto')
        WHEN p_group_by = 'payment_method' THEN COALESCE(b.forma, 'Sem forma de pagamento')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS qtd,
      SUM(COALESCE(b.valor_faturado, 0)) AS fat,
      SUM(COALESCE(b.valor_entrada, 0)) AS cxa
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey,
    a.qtd,
    a.fat,
    a.cxa,
    CASE WHEN a.qtd > 0 THEN ROUND(a.fat / a.qtd, 2) ELSE 0 END
  FROM aggr a
  ORDER BY a.fat DESC;
END;
$$;

CREATE OR REPLACE FUNCTION analisar_pre_vendas(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_sdr_name TEXT DEFAULT NULL,
  p_closer_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  leads BIGINT,
  mqls BIGINT,
  conectados BIGINT,
  agendamentos BIGINT,
  reunioes_agendadas BIGINT,
  reunioes_realizadas BIGINT,
  no_shows BIGINT,
  taxa_comparecimento NUMERIC,
  tempo_medio_agendamento_horas NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_reuniao_agendada,
      o.data_reuniao_realizada,
      o.data_no_show,
      o.data_realizacao_vendas,
      COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr,
      COALESCE(o.vendedor_closer, 'Sem closer') AS closer,
      (
        c.tags IS NOT NULL AND c.tags::TEXT ILIKE '%MQL%'
      ) AS is_mql
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.data_lead_recebido IS NOT NULL
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND (p_sdr_name IS NULL OR COALESCE(o.sdr_name, c.owner_name, '') ILIKE '%' || p_sdr_name || '%')
      AND (p_closer_name IS NULL OR COALESCE(o.vendedor_closer, '') ILIKE '%' || p_closer_name || '%')
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'sdr' THEN b.sdr
        WHEN p_group_by = 'closer' THEN b.closer
        WHEN p_group_by = 'month' THEN TO_CHAR(b.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS qtd_leads,
      COUNT(*) FILTER (WHERE b.is_mql) AS qtd_mqls,
      COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS qtd_conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS qtd_agendamentos,
      COUNT(*) FILTER (WHERE b.data_reuniao_agendada IS NOT NULL) AS qtd_reunioes_agendadas,
      COUNT(*) FILTER (WHERE b.data_reuniao_realizada IS NOT NULL) AS qtd_reunioes_realizadas,
      COUNT(*) FILTER (WHERE b.data_no_show IS NOT NULL) AS qtd_no_shows,
      AVG(
        EXTRACT(EPOCH FROM (b.data_agendamento_reuniao::TIMESTAMPTZ - b.data_lead_recebido)) / 3600.0
      ) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS avg_horas
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey,
    a.qtd_leads,
    a.qtd_mqls,
    a.qtd_conectados,
    a.qtd_agendamentos,
    a.qtd_reunioes_agendadas,
    a.qtd_reunioes_realizadas,
    a.qtd_no_shows,
    ROUND(
      CASE
        WHEN (a.qtd_reunioes_realizadas + a.qtd_no_shows) > 0
        THEN (a.qtd_reunioes_realizadas::NUMERIC / (a.qtd_reunioes_realizadas + a.qtd_no_shows)) * 100
        ELSE 0
      END,
      2
    ) AS tx_comparecimento,
    ROUND(a.avg_horas::NUMERIC, 2) AS tmp_medio_horas
  FROM aggr a
  ORDER BY a.qtd_leads DESC;
END;
$$;

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
    WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
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
