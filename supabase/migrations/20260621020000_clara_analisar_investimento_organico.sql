-- Análise de investimento orgânico: custos de equipe cruzados com MQLs e vendas dos canais orgânicos.

CREATE OR REPLACE FUNCTION analisar_investimento_organico(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_category TEXT DEFAULT NULL,
  p_utm_source TEXT DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  investimento NUMERIC,
  leads BIGINT,
  mqls BIGINT,
  conectados BIGINT,
  agendados BIGINT,
  reunioes BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  custo_por_mql NUMERIC,
  custo_por_venda NUMERIC,
  roi_org NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH invest_raw AS (
    SELECT
      i.category,
      COALESCE(oi.utm_source, i.utm_source) AS utm_source,
      oi.amount,
      oi.period_start,
      oi.period_end,
      (oi.period_end - oi.period_start + 1) AS period_days,
      GREATEST(oi.period_start, p_start_date) AS overlap_start,
      LEAST(oi.period_end, p_end_date) AS overlap_end
    FROM organic_investments oi
    JOIN organic_investment_items i ON i.id = oi.item_id
    WHERE i.is_active = true
      AND oi.period_start <= p_end_date
      AND oi.period_end >= p_start_date
      AND (p_category IS NULL OR i.category = p_category)
      AND (p_utm_source IS NULL OR COALESCE(oi.utm_source, i.utm_source, '') ILIKE '%' || p_utm_source || '%')
  ),
  invest_prorated AS (
    SELECT
      ir.category,
      ir.utm_source,
      SUM(ir.amount * GREATEST(ir.overlap_end - ir.overlap_start + 1, 0)::NUMERIC / NULLIF(ir.period_days, 0)) AS prorated_amount
    FROM invest_raw ir
    GROUP BY ir.category, ir.utm_source
  ),
  org_sources AS (
    SELECT usp.utm_source, usp.nome FROM utm_sources_plain usp WHERE usp.utm_source IS NOT NULL
  ),
  org_data AS (
    SELECT
      COALESCE(osp.nome, 'Sem canal') AS canal_nome,
      o.group_key AS canal_key,
      o.leads,
      o.mqls,
      o.conectados,
      o.agendados,
      o.reunioes,
      o.vendas,
      o.faturamento,
      o.caixa
    FROM analisar_organico(p_start_date, p_end_date, 'channel', NULL) o
    LEFT JOIN org_sources osp ON osp.utm_source = o.group_key
  ),
  general_amount AS (
    SELECT COALESCE(SUM(prorated_amount), 0) AS amount
    FROM invest_prorated
    WHERE utm_source IS NULL
  ),
  channel_count AS (
    SELECT GREATEST(COUNT(DISTINCT canal_key), 1) AS cnt FROM org_data
  ),
  invest_by_channel AS (
    SELECT
      od.canal_key,
      od.canal_nome,
      COALESCE(SUM(ip.prorated_amount) FILTER (WHERE ip.utm_source IS NOT NULL AND ip.utm_source = od.canal_key), 0)
        + (SELECT amount FROM general_amount) / (SELECT cnt FROM channel_count) AS investimento,
      od.leads,
      od.mqls,
      od.conectados,
      od.agendados,
      od.reunioes,
      od.vendas,
      od.faturamento,
      od.caixa
    FROM org_data od
    LEFT JOIN invest_prorated ip ON ip.utm_source = od.canal_key
    GROUP BY od.canal_key, od.canal_nome, od.leads, od.mqls, od.conectados, od.agendados, od.reunioes, od.vendas, od.faturamento, od.caixa
  ),
  invest_by_category AS (
    SELECT
      ip.category AS gkey,
      SUM(ip.prorated_amount) AS investimento
    FROM invest_prorated ip
    GROUP BY ip.category
  ),
  invest_total AS (
    SELECT 'Total'::TEXT AS gkey, COALESCE(SUM(prorated_amount), 0) AS investimento FROM invest_prorated
  ),
  invest_by_month AS (
    SELECT
      TO_CHAR((m.month_start)::DATE, 'YYYY-MM') AS gkey,
      COALESCE(SUM(
        ir.amount * GREATEST(
          LEAST(ir.period_end, ((m.month_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE)
          - GREATEST(ir.period_start, (m.month_start)::DATE)
          + 1,
          0
        )::NUMERIC / NULLIF(ir.period_days, 0)
      ), 0) AS investimento
    FROM generate_series(DATE_TRUNC('month', p_start_date)::DATE, DATE_TRUNC('month', p_end_date)::DATE, '1 month'::INTERVAL) m(month_start)
    LEFT JOIN invest_raw ir
      ON ir.period_start <= ((m.month_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE
     AND ir.period_end >= (m.month_start)::DATE
    GROUP BY m.month_start
  ),
  base AS (
    SELECT COALESCE(ibc.canal_nome, ibc.canal_key) AS group_key, ibc.investimento, ibc.leads, ibc.mqls, ibc.conectados, ibc.agendados, ibc.reunioes, ibc.vendas, ibc.faturamento, ibc.caixa
    FROM invest_by_channel ibc
    WHERE p_group_by = 'utm_source'
    UNION ALL
    SELECT ibcat.gkey, ibcat.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_by_category ibcat
    WHERE p_group_by = 'category'
    UNION ALL
    SELECT it.gkey, it.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_total it
    WHERE p_group_by = 'none'
    UNION ALL
    SELECT ibm.gkey, ibm.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_by_month ibm
    WHERE p_group_by = 'month'
  )
  SELECT
    b.group_key,
    COALESCE(b.investimento, 0)::NUMERIC AS investimento,
    COALESCE(b.leads, 0)::BIGINT AS leads,
    COALESCE(b.mqls, 0)::BIGINT AS mqls,
    COALESCE(b.conectados, 0)::BIGINT AS conectados,
    COALESCE(b.agendados, 0)::BIGINT AS agendados,
    COALESCE(b.reunioes, 0)::BIGINT AS reunioes,
    COALESCE(b.vendas, 0)::BIGINT AS vendas,
    COALESCE(b.faturamento, 0)::NUMERIC AS faturamento,
    COALESCE(b.caixa, 0)::NUMERIC AS caixa,
    CASE WHEN COALESCE(b.mqls, 0) > 0 THEN ROUND(b.investimento / b.mqls, 2) ELSE 0 END AS custo_por_mql,
    CASE WHEN COALESCE(b.vendas, 0) > 0 THEN ROUND(b.investimento / b.vendas, 2) ELSE 0 END AS custo_por_venda,
    CASE WHEN COALESCE(b.investimento, 0) > 0 THEN ROUND(b.faturamento / b.investimento, 2) ELSE 0 END AS roi_org
  FROM base b
  ORDER BY investimento DESC;
END;
$$;

COMMENT ON FUNCTION analisar_investimento_organico(DATE, DATE, TEXT, TEXT, TEXT) IS
'Retorna investimento orgânico (custos de equipe) cruzado com MQLs e vendas dos canais orgânicos.';
