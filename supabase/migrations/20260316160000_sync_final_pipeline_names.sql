-- Migration: Sincronização final de todos os pipeline_names conhecidos
-- Data: 2026-03-16
-- Razão: consolidar todos os IDs em uma única update

UPDATE oportunidades
SET pipeline_name = CASE
  WHEN pipeline_id = 'QQXqQvYEkwafSCAB1ybC' THEN 'Pré-Vendas MQL'
  WHEN pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU' THEN 'Vendas SQL'
  WHEN pipeline_id = 'fgh4CfZQ8Un9iRCsgPFw' THEN 'Social Selling'
  WHEN pipeline_id = 'Pns0NE0KtoJ6UhviKEU9' THEN 'Incompleto'
  WHEN pipeline_id = 'smwSHOBdtMWNh64MMpBw' THEN '[fn] webinário'
  WHEN pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L' THEN 'Recuperação'
  WHEN pipeline_id = 'sqchZ2kIIZljR6wJ6bko' THEN 'Pré-Vendas nMQL'
  WHEN pipeline_id = 'H7Nz08hgySOJ9upSYSPL' THEN 'Pré-Vendas nMQL'
  ELSE pipeline_name
END
WHERE pipeline_name IS NULL
  AND pipeline_id IS NOT NULL;

SELECT COUNT(*) as still_null_after FROM oportunidades WHERE pipeline_name IS NULL AND pipeline_id IS NOT NULL;
