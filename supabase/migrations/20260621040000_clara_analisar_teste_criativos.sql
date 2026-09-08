-- Análise comparativa de criativos (A/B simples) usando métricas da Meta × CRM.

CREATE OR REPLACE FUNCTION analisar_teste_criativos(
  p_start_date DATE,
  p_end_date DATE,
  p_creative_ids TEXT[] DEFAULT NULL,
  p_min_spend NUMERIC DEFAULT 500
)
RETURNS TABLE (
  creative_code TEXT,
  creative_name TEXT,
  status TEXT,
  spend NUMERIC,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  leads_crm BIGINT,
  mqls BIGINT,
  vendas BIGINT,
  faturamento NUMERIC,
  caixa NUMERIC,
  cpmql NUMERIC,
  roas NUMERIC,
  roas_caixa NUMERIC,
  is_valid BOOLEAN,
  is_winner BOOLEAN,
  sample_size BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT *
    FROM analisar_criativos(p_start_date, p_end_date, 'creative', NULL, NULL, 0, 10000)
    WHERE p_creative_ids IS NULL OR p_creative_ids = '{}'::TEXT[] OR creative_code = ANY(p_creative_ids)
  ),
  valid_candidates AS (
    SELECT b.*
    FROM base b
    WHERE b.spend >= COALESCE(p_min_spend, 0)
  ),
  winner AS (
    SELECT vc.creative_code
    FROM valid_candidates vc
    ORDER BY vc.roas_caixa DESC NULLS LAST, vc.spend DESC
    LIMIT 1
  )
  SELECT
    b.creative_code,
    b.creative_name,
    b.status,
    b.spend,
    b.impressions,
    b.clicks,
    b.ctr,
    b.leads_crm,
    b.mqls,
    b.vendas,
    b.faturamento,
    b.caixa,
    b.cpmql,
    b.roas,
    b.roas_caixa,
    (b.spend >= COALESCE(p_min_spend, 0)) AS is_valid,
    (w.creative_code IS NOT NULL AND b.creative_code = w.creative_code) AS is_winner,
    b.leads_crm AS sample_size
  FROM base b
  LEFT JOIN winner w ON w.creative_code = b.creative_code
  ORDER BY b.spend DESC;
END;
$$;

COMMENT ON FUNCTION analisar_teste_criativos(DATE, DATE, TEXT[], NUMERIC) IS
'Retorna comparativo de criativos CR-xxx com indicador de winner baseado em ROAS CAIXA e spend mínimo.';
