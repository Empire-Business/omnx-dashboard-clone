-- Análise detalhada de vendas por closer, produto ou forma de pagamento
-- Visão PRODUTIVIDADE: filtra vendas_fechamento.data_pagamento_entrada no período.

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
      AND vf.data_pagamento_entrada >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND vf.data_pagamento_entrada < ((p_end_date + INTERVAL '1 day')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
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

-- Comentário para documentação
COMMENT ON FUNCTION analisar_vendas(DATE, DATE, TEXT, TEXT, TEXT, TEXT) IS
'Retorna vendas (visão produtividade por data_pagamento_entrada) agrupadas por closer, produto ou forma de pagamento.';
