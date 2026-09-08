-- Metas vs Realizado para a Clara.
-- Retorna metas cadastradas, realizado (snapshot mais recente ou cálculo via fonte de dados),
-- gap, progresso % e projeção de fechamento do período.
-- Segurança: SECURITY INVOKER, STABLE, sem exposição de PII.

CREATE OR REPLACE FUNCTION analisar_metas_vs_realizado(
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_metric_name TEXT DEFAULT NULL,
  p_area_key TEXT DEFAULT NULL,
  p_scope_label TEXT DEFAULT NULL,
  p_group_by TEXT DEFAULT 'none'
)
RETURNS TABLE (
  group_key TEXT,
  period_start DATE,
  period_end DATE,
  metric_name TEXT,
  area_key TEXT,
  scope_label TEXT,
  target_value NUMERIC,
  actual_value NUMERIC,
  gap NUMERIC,
  progress_pct NUMERIC,
  projected_value NUMERIC,
  projection_basis TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_today DATE;
BEGIN
  -- Resolução do período: padrão = mês atual em São Paulo
  v_start := COALESCE(
    p_period_start,
    (date_trunc('month', timezone('America/Sao_Paulo', now())))::DATE
  );
  v_end := COALESCE(
    p_period_end,
    (date_trunc('month', timezone('America/Sao_Paulo', now())) + INTERVAL '1 month - 1 day')::DATE
  );
  v_today := (timezone('America/Sao_Paulo', now()))::DATE;

  RETURN QUERY
  WITH matched_versions AS (
    SELECT
      gv.id AS goal_version_id,
      gv.target_value,
      gv.period_start AS gv_period_start,
      gv.period_end AS gv_period_end,
      gd.scope_type,
      gd.scope_id,
      gd.scope_label,
      gmd.area_key AS m_area_key,
      gmd.metric_key,
      gmd.metric_name AS m_metric_name,
      gmd.provider_key,
      gmd.unit
    FROM goal_versions gv
    JOIN goal_definitions gd ON gd.id = gv.goal_definition_id
    JOIN goal_metric_definitions gmd ON gmd.id = gd.metric_definition_id
    WHERE gv.period_start <= v_end
      AND gv.period_end >= v_start
      AND (p_metric_name IS NULL
           OR gmd.metric_name ILIKE '%' || p_metric_name || '%'
           OR gmd.metric_key ILIKE '%' || p_metric_name || '%')
      AND (p_area_key IS NULL OR gmd.area_key = p_area_key)
      AND (p_scope_label IS NULL OR gd.scope_label ILIKE '%' || p_scope_label || '%')
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (gs.goal_version_id)
      gs.goal_version_id,
      gs.actual_value,
      gs.snapshot_date
    FROM goal_snapshots gs
    WHERE gs.goal_version_id IN (SELECT mv.goal_version_id FROM matched_versions mv)
      AND gs.snapshot_date <= v_today
    ORDER BY gs.goal_version_id, gs.snapshot_date DESC
  ),
  computed_actual AS (
    SELECT
      mv.goal_version_id,
      COALESCE(
        ls.actual_value,
        CASE
          -- MQLs (tráfego pago ou orgânico): leads com tag MQL no período
          WHEN mv.provider_key IN ('trafego.mql_count', 'organico.mql_count') THEN (
            SELECT COUNT(*)::NUMERIC
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_lead_recebido >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_lead_recebido <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND c.tags IS NOT NULL
              AND c.tags::TEXT ILIKE '%MQL%'
              AND (
                mv.scope_label = 'Global'
                OR c.utm_source = mv.scope_label
                OR c.utm_source ILIKE '%' || mv.scope_label || '%'
              )
          )
          -- Agendamentos produzidos no período
          WHEN mv.provider_key = 'prevendas.agendamentos' THEN (
            SELECT COUNT(*)::NUMERIC
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_agendamento_reuniao >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_agendamento_reuniao <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND (
                mv.scope_label = 'Global'
                OR COALESCE(o.sdr_name, c.owner_name) = mv.scope_label
                OR COALESCE(o.sdr_name, c.owner_name) ILIKE '%' || mv.scope_label || '%'
              )
          )
          -- Quantidade de vendas fechadas (pagamento confirmado)
          WHEN mv.provider_key = 'vendas.closed_count' THEN (
            SELECT COUNT(*)::NUMERIC
            FROM vendas_fechamento vf
            WHERE vf.data_pagamento_entrada >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND vf.data_pagamento_entrada <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          )
          -- Faturamento fechado
          WHEN mv.provider_key = 'vendas.closed_revenue' THEN (
            SELECT COALESCE(SUM(vf.valor_faturado), 0)::NUMERIC
            FROM vendas_fechamento vf
            WHERE vf.data_pagamento_entrada >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND vf.data_pagamento_entrada <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          )
          -- Taxa de conversão de reuniões (%)
          WHEN mv.provider_key = 'vendas.conversion_rate' THEN (
            SELECT CASE
              WHEN COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) > 0
              THEN ROUND(
                (COUNT(*) FILTER (WHERE vf.oportunidade_id IS NOT NULL)::NUMERIC
                 / NULLIF(COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL), 0)) * 100,
                2
              )
              ELSE NULL
            END
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            LEFT JOIN vendas_fechamento vf
              ON vf.oportunidade_id = o.id
             AND vf.data_pagamento_entrada IS NOT NULL
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_realizacao_vendas >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_realizacao_vendas <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND (
                mv.scope_label = 'Global'
                OR o.vendedor_closer = mv.scope_label
                OR o.vendedor_closer ILIKE '%' || mv.scope_label || '%'
              )
          )
          ELSE NULL
        END
      ) AS actual_value
    FROM matched_versions mv
    LEFT JOIN latest_snapshots ls ON ls.goal_version_id = mv.goal_version_id
  ),
  detail AS (
    SELECT
      CASE
        WHEN p_group_by = 'none' THEN COALESCE(mv.m_metric_name, '—') || ' | ' || COALESCE(mv.scope_label, 'Global')
        WHEN p_group_by = 'metric' THEN COALESCE(mv.m_metric_name, '—')
        WHEN p_group_by = 'area' THEN COALESCE(mv.m_area_key, '—')
        WHEN p_group_by = 'scope' THEN COALESCE(mv.scope_label, 'Global')
        ELSE COALESCE(mv.scope_label, 'Global')
      END AS gkey,
      mv.gv_period_start AS p_start,
      mv.gv_period_end AS p_end,
      mv.m_metric_name,
      mv.m_area_key,
      mv.scope_label,
      mv.target_value,
      ca.actual_value,
      CASE
        WHEN ca.actual_value IS NOT NULL THEN ca.actual_value - mv.target_value
        ELSE NULL
      END AS v_gap,
      CASE
        WHEN ca.actual_value IS NOT NULL AND mv.target_value > 0
        THEN ROUND((ca.actual_value / mv.target_value) * 100, 2)
        ELSE NULL
      END AS v_progress_pct,
      CASE
        WHEN ca.actual_value IS NULL THEN NULL
        WHEN v_today > mv.gv_period_end THEN ca.actual_value
        WHEN v_today < mv.gv_period_start THEN ca.actual_value
        WHEN (mv.gv_period_end - mv.gv_period_start + 1) > 0
         AND (v_today - mv.gv_period_start + 1) > 0
         AND (v_today - mv.gv_period_start + 1) < (mv.gv_period_end - mv.gv_period_start + 1)
        THEN ROUND(
          ca.actual_value
          / ((LEAST(GREATEST(v_today - mv.gv_period_start + 1, 0), mv.gv_period_end - mv.gv_period_start + 1))::NUMERIC
             / NULLIF(mv.gv_period_end - mv.gv_period_start + 1, 0)),
          2
        )
        ELSE ca.actual_value
      END AS v_projected_value
    FROM matched_versions mv
    JOIN computed_actual ca ON ca.goal_version_id = mv.goal_version_id
  )
  SELECT
    d.gkey AS group_key,
    MIN(d.p_start)::DATE AS period_start,
    MAX(d.p_end)::DATE AS period_end,
    CASE WHEN p_group_by = 'none' THEN MAX(d.m_metric_name) ELSE NULL END AS metric_name,
    CASE WHEN p_group_by = 'none' THEN MAX(d.m_area_key) ELSE NULL END AS area_key,
    CASE WHEN p_group_by = 'none' THEN MAX(d.scope_label) ELSE NULL END AS scope_label,
    SUM(d.target_value)::NUMERIC AS target_value,
    SUM(d.actual_value)::NUMERIC AS actual_value,
    SUM(d.v_gap)::NUMERIC AS gap,
    CASE
      WHEN SUM(d.target_value) > 0
      THEN ROUND((SUM(d.actual_value) / SUM(d.target_value)) * 100, 2)
      ELSE NULL
    END AS progress_pct,
    SUM(d.v_projected_value)::NUMERIC AS projected_value,
    CASE
      WHEN v_today > MAX(d.p_end) THEN 'Período encerrado'
      WHEN v_today < MIN(d.p_start) THEN 'Período não iniciado'
      ELSE 'Projeção por proporção do período decorrido'
    END AS projection_basis
  FROM detail d
  GROUP BY d.gkey
  ORDER BY
    CASE WHEN p_group_by = 'none' THEN 0 ELSE 1 END,
    d.gkey;
END;
$$;

COMMENT ON FUNCTION analisar_metas_vs_realizado(DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Retorna metas vs realizado para a Clara. Se não houver snapshot, calcula o realizado via fonte de dados (MQLs, vendas, faturamento, agendamentos). '
'group_by: none | metric | area | scope.';

NOTIFY pgrst, 'reload schema';
