-- Análise de pré-vendas: reuniões, no-shows, comparecimento e taxas por SDR/closer
-- Visão COHORT: filtra oportunidades.data_lead_recebido no período.

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
      -- MQL: tag "MQL" em contatos.tags (texto ou jsonb convertido para texto)
      (
        c.tags IS NOT NULL AND c.tags::TEXT ILIKE '%MQL%'
      ) AS is_mql
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.data_lead_recebido IS NOT NULL
      AND o.data_lead_recebido >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND o.data_lead_recebido < ((p_end_date + INTERVAL '1 day')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
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
      -- tempo médio entre lead recebido e agendamento, em horas
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

COMMENT ON FUNCTION analisar_pre_vendas(DATE, DATE, TEXT, TEXT, TEXT) IS
'Retorna métricas de pré-vendas (leads, MQLs, conectados, agendamentos, reuniões, no-shows, comparecimento) agrupadas por SDR, closer ou mês.';
