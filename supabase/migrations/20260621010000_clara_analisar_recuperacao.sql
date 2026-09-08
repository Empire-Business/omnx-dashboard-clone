-- Análise do pipeline de Recuperação: leads perdidos, reativados, vendas e taxa de reconquista.

CREATE OR REPLACE FUNCTION analisar_recuperacao(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_sdr_name TEXT DEFAULT NULL,
  p_lost_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  group_key TEXT,
  leads BIGINT,
  mqls BIGINT,
  conectados BIGINT,
  agendados BIGINT,
  reunioes BIGINT,
  perdidos BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  taxa_reconquista NUMERIC
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
      o.data_realizacao_vendas,
      o.status,
      o.lost_reason,
      o.motivo_perda,
      o.data_perdido,
      o.data_perdido_vendas,
      o.sdr_name,
      c.tags,
      c.owner_name,
      CASE
        WHEN p_group_by = 'month' THEN COALESCE(TO_CHAR(o.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Sem data')
        WHEN p_group_by = 'sdr' THEN COALESCE(o.sdr_name, c.owner_name, 'Sem SDR')
        WHEN p_group_by = 'lost_reason' THEN COALESCE(NULLIF(TRIM(o.lost_reason), ''), NULLIF(TRIM(o.motivo_perda), ''), 'Sem motivo')
        WHEN p_group_by = 'status' THEN COALESCE(o.status, 'Sem status')
        ELSE 'Total'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.pipeline_id IS NOT DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
      AND (p_lost_reason IS NULL
           OR COALESCE(o.lost_reason, '') ILIKE '%' || p_lost_reason || '%'
           OR COALESCE(o.motivo_perda, '') ILIKE '%' || p_lost_reason || '%')
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      SUM(vf.valor_faturado) AS fat,
      SUM(vf.valor_entrada) AS ent
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada IS NOT NULL
    GROUP BY vf.oportunidade_id
  )
  SELECT
    b.gkey AS group_key,
    COUNT(*) AS leads,
    COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
    COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
    COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
    COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes,
    COUNT(*) FILTER (WHERE b.status = 'lost' OR b.data_perdido IS NOT NULL OR b.data_perdido_vendas IS NOT NULL) AS perdidos,
    COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL) AS vendas,
    COALESCE(SUM(vb.fat), 0) AS faturamento,
    COALESCE(SUM(vb.ent), 0) AS caixa,
    ROUND((COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS taxa_reconquista
  FROM base b
  LEFT JOIN vendas_base vb ON vb.oportunidade_id = b.id
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$$;

COMMENT ON FUNCTION analisar_recuperacao(DATE, DATE, TEXT, TEXT, TEXT) IS
'Retorna métricas do pipeline de Recuperação (Sn1Guqcm6zwZNTVOOf5L): leads, perdidos, vendas, faturamento e taxa de reconquista.';
