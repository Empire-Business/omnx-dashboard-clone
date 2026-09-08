-- Funil de conversão cohort padronizado em RPC

CREATE OR REPLACE FUNCTION analisar_funnel_cohort(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'none',
  p_utm_source TEXT DEFAULT NULL,
  p_utm_campaign_code TEXT DEFAULT NULL,
  p_sdr_name TEXT DEFAULT NULL
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
  caixa NUMERIC
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
      o.sdr_name,
      c.utm_source,
      c.utm_campaign,
      c.tags,
      c.owner_name,
      CASE
        WHEN p_group_by = 'month' THEN COALESCE(TO_CHAR(o.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Sem data')
        WHEN p_group_by = 'sdr' THEN COALESCE(o.sdr_name, c.owner_name, 'Sem SDR')
        WHEN p_group_by = 'campaign' THEN COALESCE(c.utm_campaign, 'Sem campanha')
        WHEN p_group_by = 'channel' THEN COALESCE(c.utm_source, 'Sem canal')
        ELSE 'Total'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
      AND (p_utm_campaign_code IS NULL OR c.utm_campaign = p_utm_campaign_code)
      AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
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
    COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL) AS vendas,
    COALESCE(SUM(vb.fat), 0) AS faturamento,
    COALESCE(SUM(vb.ent), 0) AS caixa
  FROM base b
  LEFT JOIN vendas_base vb ON vb.oportunidade_id = b.id
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$$;

COMMENT ON FUNCTION analisar_funnel_cohort(DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Retorna funil de conversão cohort (data_lead_recebido) por agrupamento. Exclui pipeline de recuperação.';
