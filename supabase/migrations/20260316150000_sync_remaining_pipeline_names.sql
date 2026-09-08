-- Migration: Sincronizar pipeline_names restantes (batch 2)
-- Data: 2026-03-16
-- Pipeline_ids identificados: ZWuCjEXM2VDyLCx8CtGU, sqchZ2kIIZljR6wJ6bko, H7Nz08hgySOJ9upSYSPL

UPDATE oportunidades
SET pipeline_name = CASE
  WHEN pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU' THEN 'Vendas SQL'
  WHEN pipeline_id = 'sqchZ2kIIZljR6wJ6bko' THEN 'Pré-Vendas nMQL'
  WHEN pipeline_id = 'H7Nz08hgySOJ9upSYSPL' THEN 'Pré-Vendas nMQL'
  ELSE pipeline_name
END
WHERE pipeline_name IS NULL
  AND pipeline_id IN ('ZWuCjEXM2VDyLCx8CtGU', 'sqchZ2kIIZljR6wJ6bko', 'H7Nz08hgySOJ9upSYSPL');

-- Resultado
SELECT pipeline_id, COUNT(*) as total
FROM oportunidades
WHERE pipeline_name IS NULL
GROUP BY pipeline_id
ORDER BY total DESC;
