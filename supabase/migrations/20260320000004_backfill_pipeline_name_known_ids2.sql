-- Migration: preencher pipeline_name dos 6 opps com pipeline_id conhecido mas pipeline_name NULL
-- A API GHL não retorna pipelineName para esses IDs (pipelines antigos/deletados)
-- Mapeamento derivado de outras opps no banco que têm ambos os campos preenchidos.

UPDATE oportunidades
SET pipeline_name = CASE pipeline_id
  WHEN 'smwSHOBdtMWNh64MMpBw' THEN '[fn] webinário'
  WHEN 'fgh4CfZQ8Un9iRCsgPFw' THEN 'Social Selling'
  WHEN 'QQXqQvYEkwafSCAB1ybC' THEN 'Pré-Vendas MQL'
  WHEN 'sqchZ2kIIZljR6wJ6bko' THEN 'Pré-Vendas nMQL'
  WHEN 'ZWuCjEXM2VDyLCx8CtGU' THEN 'Vendas SQL'
END
WHERE pipeline_name IS NULL
  AND pipeline_id IN (
    'smwSHOBdtMWNh64MMpBw',
    'fgh4CfZQ8Un9iRCsgPFw',
    'QQXqQvYEkwafSCAB1ybC',
    'sqchZ2kIIZljR6wJ6bko',
    'ZWuCjEXM2VDyLCx8CtGU'
  );
