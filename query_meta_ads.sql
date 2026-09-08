SELECT 
  'meta_ads_insights' as tabela,
  COUNT(*) as registros,
  MIN(date) as primeira_data,
  MAX(date) as ultima_data,
  COALESCE(MAX(fetched_at), MAX(updated_at)) as ultima_atualizacao
FROM meta_ads_insights;
