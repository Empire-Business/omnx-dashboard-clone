-- Análise completa de traqueamento por source/campanha (visão cohort ou produtividade)

CREATE OR REPLACE FUNCTION analisar_trafego(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'source',
  p_utm_source TEXT DEFAULT NULL,
  p_utm_campaign_code TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'cohort'
)
RETURNS TABLE (
  group_key TEXT,
  leads BIGINT,
  mqls BIGINT,
  conectados BIGINT,
  agendados BIGINT,
  reunioes BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  investimento_meta NUMERIC,
  cpl NUMERIC,
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
  WITH leads_base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      c.utm_source,
      c.utm_campaign,
      c.tags,
      CASE
        WHEN p_group_by = 'campaign' THEN COALESCE(uc.nome, c.utm_campaign, 'Sem campanha')
        WHEN p_group_by = 'channel' THEN COALESCE(us.public_code, c.utm_source, 'Sem canal')
        ELSE COALESCE(c.utm_source, 'Sem source')
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
    LEFT JOIN utm_campaigns uc ON uc.utm_campaign::TEXT = c.utm_campaign
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND c.utm_source IS NOT NULL
      AND c.utm_source != ''
      AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
      AND (
        (p_mode = 'cohort'
         AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
         AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ)
        OR p_mode = 'produtividade'
      )
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
      AND (p_utm_campaign_code IS NULL OR c.utm_campaign = p_utm_campaign_code)
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      vf.valor_faturado,
      vf.valor_entrada,
      CASE
        WHEN p_mode = 'produtividade'
          AND vf.data_pagamento_entrada >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND vf.data_pagamento_entrada <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
        THEN true
        WHEN p_mode = 'cohort' AND vf.data_pagamento_entrada IS NOT NULL
        THEN true
        ELSE false
      END AS dentro_periodo
    FROM vendas_fechamento vf
  ),
  meta_base AS (
    SELECT
      COALESCE(us.utm_source, 'Sem source') AS gkey,
      COALESCE(SUM(mai.spend), 0) AS investimento
    FROM utm_sources us
    LEFT JOIN meta_ads_insights mai
      ON mai.ad_name ILIKE '%' || us.public_code || '%'
     AND mai.date BETWEEN p_start_date AND p_end_date
    WHERE (p_utm_source IS NULL OR us.utm_source ILIKE '%' || p_utm_source || '%')
      AND p_group_by = 'source'
    GROUP BY us.utm_source
    UNION ALL
    SELECT
      COALESCE(campaign_name, 'Sem campanha') AS gkey,
      SUM(spend) AS investimento
    FROM meta_ads_insights
    WHERE date BETWEEN p_start_date AND p_end_date
      AND (p_utm_campaign_code IS NULL OR campaign_name ILIKE '%' || p_utm_campaign_code || '%')
      AND p_group_by = 'campaign'
    GROUP BY campaign_name
  ),
  aggr AS (
    SELECT
      lb.gkey,
      COUNT(*) AS qtd_leads,
      COUNT(*) FILTER (WHERE lb.tags IS NOT NULL AND lb.tags::TEXT ILIKE '%MQL%') AS qtd_mqls,
      COUNT(*) FILTER (WHERE lb.data_conectado IS NOT NULL) AS qtd_conectados,
      COUNT(*) FILTER (WHERE lb.data_agendamento_reuniao IS NOT NULL) AS qtd_agendados,
      COUNT(*) FILTER (WHERE lb.data_realizacao_vendas IS NOT NULL) AS qtd_reunioes,
      COUNT(*) FILTER (WHERE vb.dentro_periodo) AS qtd_vendas,
      SUM(CASE WHEN vb.dentro_periodo THEN vb.valor_faturado ELSE 0 END) AS sum_faturamento,
      SUM(CASE WHEN vb.dentro_periodo THEN vb.valor_entrada ELSE 0 END) AS sum_caixa
    FROM leads_base lb
    LEFT JOIN vendas_base vb ON vb.oportunidade_id = lb.id
    GROUP BY lb.gkey
  )
  SELECT
    a.gkey AS group_key,
    a.qtd_leads,
    a.qtd_mqls,
    a.qtd_conectados,
    a.qtd_agendados,
    a.qtd_reunioes,
    a.qtd_vendas,
    COALESCE(a.sum_faturamento, 0),
    COALESCE(a.sum_caixa, 0),
    COALESCE(mb.investimento, 0),
    CASE WHEN a.qtd_leads > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_leads, 2) ELSE 0 END,
    CASE WHEN a.qtd_mqls > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_mqls, 2) ELSE 0 END,
    CASE WHEN a.qtd_vendas > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_vendas, 2) ELSE 0 END,
    CASE WHEN COALESCE(mb.investimento, 0) > 0 THEN ROUND(COALESCE(a.sum_faturamento, 0) / mb.investimento, 2) ELSE 0 END,
    CASE WHEN COALESCE(mb.investimento, 0) > 0 THEN ROUND(COALESCE(a.sum_caixa, 0) / mb.investimento, 2) ELSE 0 END
  FROM aggr a
  LEFT JOIN meta_base mb ON mb.gkey = a.gkey
  ORDER BY COALESCE(mb.investimento, 0) DESC;
END;
$$;

COMMENT ON FUNCTION analisar_trafego(DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Retorna análise completa de traqueamento por source, campanha ou canal. Modos: cohort (data_lead_recebido) ou produtividade (data_pagamento_entrada).';
