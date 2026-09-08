-- Análise completa de canais orgânicos + metadados de canais orgânicos

CREATE OR REPLACE FUNCTION analisar_organico(
  p_start_date DATE,
  p_end_date DATE,
  p_group_by TEXT DEFAULT 'channel',
  p_utm_source TEXT DEFAULT NULL
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
  WITH paid_sources AS (
    SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL
  ),
  organic_sources AS (
    SELECT utm_source, nome FROM utm_sources_plain WHERE utm_source IS NOT NULL
  ),
  base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      c.utm_source,
      c.tags,
      CASE
        WHEN c.utm_source IS NULL OR TRIM(c.utm_source) = '' THEN 'Sem source'
        WHEN EXISTS (SELECT 1 FROM paid_sources ps WHERE ps.utm_source = c.utm_source) THEN NULL
        WHEN osp.nome IS NOT NULL THEN osp.nome || ' (' || c.utm_source || ')'
        ELSE 'Sem canal (' || c.utm_source || ')'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN organic_sources osp ON osp.utm_source = c.utm_source
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (c.utm_source IS NULL OR TRIM(c.utm_source) = '' OR NOT EXISTS (SELECT 1 FROM paid_sources ps WHERE ps.utm_source = c.utm_source))
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
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
  WHERE b.gkey IS NOT NULL
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$$;

COMMENT ON FUNCTION analisar_organico(DATE, DATE, TEXT, TEXT) IS
'Retorna métricas de canais orgânicos por cohort. Exclui pipeline de recuperação e tráfego pago. Agrupa por nome amigável (utm_source).';

CREATE OR REPLACE FUNCTION listar_utm_sources_plain()
RETURNS TABLE (
  nome TEXT,
  utm_source TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT nome, utm_source
  FROM utm_sources_plain
  WHERE utm_source IS NOT NULL
  ORDER BY nome;
$$;

COMMENT ON FUNCTION listar_utm_sources_plain() IS
'Retorna a lista de canais orgânicos cadastrados (utm_sources_plain).'
