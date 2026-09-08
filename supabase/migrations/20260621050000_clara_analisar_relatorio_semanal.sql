-- Relatório semanal executivo: compara semana atual vs anterior com métricas principais.

CREATE OR REPLACE FUNCTION analisar_relatorio_semanal(
  p_week_start DATE DEFAULT NULL
)
RETURNS TABLE (
  metric TEXT,
  current_value NUMERIC,
  previous_value NUMERIC,
  change_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_prev_week_start DATE;
  v_prev_week_end DATE;
BEGIN
  -- Semana comercial: segunda a domingo
  v_week_start := COALESCE(p_week_start, (
    date_trunc('week', timezone('America/Sao_Paulo', now()))::DATE
  ));
  v_week_end := v_week_start + 6;
  v_prev_week_start := v_week_start - 7;
  v_prev_week_end := v_prev_week_start + 6;

  RETURN QUERY
  WITH curr_funnel AS (
    SELECT * FROM analisar_funnel_cohort(v_week_start, v_week_end, 'none', NULL, NULL, NULL)
  ),
  prev_funnel AS (
    SELECT * FROM analisar_funnel_cohort(v_prev_week_start, v_prev_week_end, 'none', NULL, NULL, NULL)
  ),
  curr_revenue AS (
    SELECT
      COUNT(*) AS vendas,
      SUM(COALESCE(vf.valor_faturado, 0)) AS faturamento,
      SUM(COALESCE(vf.valor_entrada, 0)) AS caixa
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada >= (v_week_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (v_week_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
  ),
  prev_revenue AS (
    SELECT
      COUNT(*) AS vendas,
      SUM(COALESCE(vf.valor_faturado, 0)) AS faturamento,
      SUM(COALESCE(vf.valor_entrada, 0)) AS caixa
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada >= (v_prev_week_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (v_prev_week_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
  ),
  curr_meta AS (
    SELECT COALESCE(SUM(spend), 0) AS spend FROM meta_ads_insights WHERE date BETWEEN v_week_start AND v_week_end
  ),
  prev_meta AS (
    SELECT COALESCE(SUM(spend), 0) AS spend FROM meta_ads_insights WHERE date BETWEEN v_prev_week_start AND v_prev_week_end
  ),
  metrics AS (
    SELECT 'leads'::TEXT AS metric,
           (SELECT leads FROM curr_funnel) AS current_value,
           (SELECT leads FROM prev_funnel) AS previous_value
    UNION ALL
    SELECT 'mqls'::TEXT,
           (SELECT mqls FROM curr_funnel),
           (SELECT mqls FROM prev_funnel)
    UNION ALL
    SELECT 'conectados'::TEXT,
           (SELECT conectados FROM curr_funnel),
           (SELECT conectados FROM prev_funnel)
    UNION ALL
    SELECT 'agendados'::TEXT,
           (SELECT agendados FROM curr_funnel),
           (SELECT agendados FROM prev_funnel)
    UNION ALL
    SELECT 'reunioes'::TEXT,
           (SELECT reunioes FROM curr_funnel),
           (SELECT reunioes FROM prev_funnel)
    UNION ALL
    SELECT 'vendas'::TEXT,
           (SELECT vendas FROM curr_revenue),
           (SELECT vendas FROM prev_revenue)
    UNION ALL
    SELECT 'faturamento'::TEXT,
           (SELECT faturamento FROM curr_revenue),
           (SELECT faturamento FROM prev_revenue)
    UNION ALL
    SELECT 'caixa'::TEXT,
           (SELECT caixa FROM curr_revenue),
           (SELECT caixa FROM prev_revenue)
    UNION ALL
    SELECT 'spend_meta'::TEXT,
           (SELECT spend FROM curr_meta),
           (SELECT spend FROM prev_meta)
  )
  SELECT
    m.metric,
    COALESCE(m.current_value, 0) AS current_value,
    COALESCE(m.previous_value, 0) AS previous_value,
    CASE
      WHEN COALESCE(m.previous_value, 0) > 0
        THEN ROUND(((COALESCE(m.current_value, 0) - m.previous_value) / m.previous_value) * 100, 2)
      WHEN COALESCE(m.current_value, 0) > 0 THEN 100
      ELSE 0
    END AS change_pct
  FROM metrics m
  ORDER BY CASE m.metric
    WHEN 'leads' THEN 1
    WHEN 'mqls' THEN 2
    WHEN 'conectados' THEN 3
    WHEN 'agendados' THEN 4
    WHEN 'reunioes' THEN 5
    WHEN 'vendas' THEN 6
    WHEN 'faturamento' THEN 7
    WHEN 'caixa' THEN 8
    WHEN 'spend_meta' THEN 9
    ELSE 10
  END;
END;
$$;

COMMENT ON FUNCTION analisar_relatorio_semanal(DATE) IS
'Retorna relatório semanal executivo comparando semana atual vs anterior: leads, MQLs, vendas, faturamento, caixa e investimento Meta.';
