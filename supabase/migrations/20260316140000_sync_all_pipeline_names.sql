-- Migration: Sincronizar todos os pipeline_names conhecidos
-- Data: 2026-03-16
-- Razão: Ainda há 1000 oups com pipeline_name=NULL
-- Estratégia: Mapear pipeline_ids conhecidos; deixar desconhecidos para edge function

UPDATE oportunidades
SET pipeline_name = CASE
  -- Conhecidos
  WHEN pipeline_id = 'QQXqQvYEkwafSCAB1ybC' THEN 'Pré-Vendas MQL'
  WHEN pipeline_id = 'fgh4CfZQ8Un9iRCsgPFw' THEN 'Social Selling'
  WHEN pipeline_id = 'Pns0NE0KtoJ6UhviKEU9' THEN 'Incompleto'
  WHEN pipeline_id = 'smwSHOBdtMWNh64MMpBw' THEN '[fn] webinário'
  WHEN pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L' THEN 'Recuperação'
  -- Desconhecidos (8DAr28W959nKNsmTL8qy, rYTsaCEFqnm4NDZxYo7t) — deixar para edge function
  ELSE pipeline_name
END
WHERE pipeline_name IS NULL
  AND pipeline_id IS NOT NULL;

-- Log
SELECT
  COUNT(*) as still_null,
  COUNT(CASE WHEN pipeline_name IS NOT NULL THEN 1 END) as now_filled
FROM oportunidades
WHERE pipeline_id IN ('8DAr28W959nKNsmTL8qy', 'rYTsaCEFqnm4NDZxYo7t');
