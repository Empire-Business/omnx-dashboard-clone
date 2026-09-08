-- Queries de validação do backfill por região

-- 1) Total de spend dos breakdowns deve bater com meta_ads_insights por data
WITH totais AS (
  SELECT
    i.date,
    i.spend AS spend_insights,
    COALESCE(SUM(b.spend), 0) AS spend_breakdowns
  FROM meta_ads_insights i
  LEFT JOIN meta_ads_insights_breakdowns b
    ON b.insights_id = i.id
   AND b.breakdown_type = 'region'
  GROUP BY i.date, i.spend
)
SELECT
  date,
  spend_insights,
  spend_breakdowns,
  ABS(spend_insights - spend_breakdowns) AS diferenca,
  CASE
    WHEN spend_insights = 0 THEN 0
    ELSE ROUND((ABS(spend_insights - spend_breakdowns) / spend_insights) * 100, 2)
  END AS pct_diferenca
FROM totais
WHERE ABS(spend_insights - spend_breakdowns) > 0.01
ORDER BY date;

-- 2) Regiões retornadas pela Meta que não estão no mapeamento
SELECT DISTINCT
  b.region,
  b.country,
  COUNT(*) AS ocorrencias
FROM meta_ads_insights_breakdowns b
WHERE b.breakdown_type = 'region'
  AND b.region IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM meta_ads_region_mapping m WHERE m.region_name = b.region
  )
GROUP BY b.region, b.country
ORDER BY ocorrencias DESC;

-- 3) Resumo de investimento por região brasileira
SELECT
  m.regiao,
  SUM(b.spend) AS investimento,
  SUM(b.impressions) AS impressoes,
  SUM(b.clicks) AS cliques
FROM meta_ads_insights_breakdowns b
JOIN meta_ads_region_mapping m ON m.region_name = b.region
WHERE b.breakdown_type = 'region'
GROUP BY m.regiao
ORDER BY investimento DESC;

-- 4) Resumo de investimento por UF
SELECT
  m.uf,
  m.regiao,
  SUM(b.spend) AS investimento,
  SUM(b.impressions) AS impressoes,
  SUM(b.clicks) AS cliques
FROM meta_ads_insights_breakdowns b
JOIN meta_ads_region_mapping m ON m.region_name = b.region
WHERE b.breakdown_type = 'region'
GROUP BY m.uf, m.regiao
ORDER BY investimento DESC;
