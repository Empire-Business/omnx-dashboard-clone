-- Migration: Corrigir pipeline_name = NULL para Maria Clara + outras oups orfãs
-- Data: 2026-03-16
-- Razão: Alguns registros ainda têm pipeline_name=NULL mesmo com pipeline_id preenchido
-- Solução: Atualizar com base no mapeamento pipeline_id → pipeline_name

-- Mapeamento conhecido de pipeline_id para pipeline_name
UPDATE oportunidades
SET pipeline_name = CASE
  WHEN pipeline_id = 'QQXqQvYEkwafSCAB1ybC' THEN 'Pré-Vendas MQL'
  WHEN pipeline_id = 'H7Nz08hgySOJ9upSYSPL' THEN 'Pré-Vendas nMQL'
  WHEN pipeline_id = 'sqchZ2kIIZljR6wJ6bko' THEN 'Pré-Vendas nMQL'
  ELSE pipeline_name
END
WHERE pipeline_name IS NULL
  AND pipeline_id IS NOT NULL;

-- Verificar quantos foram atualizados
SELECT COUNT(*) as updated_count
FROM oportunidades
WHERE pipeline_name IS NULL;
