-- Diagnóstico: Verificar estrutura da tabela meta_ads_insights
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'meta_ads_insights' 
ORDER BY ordinal_position;
