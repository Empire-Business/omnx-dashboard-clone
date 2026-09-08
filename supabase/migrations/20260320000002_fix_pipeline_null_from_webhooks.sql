-- Migration: corrigir opps com pipeline_id=NULL usando dados dos próprios webhooks
--
-- Problema: 6 opps têm pipeline_id=NULL mesmo que webhooks posteriores
-- tenham chegado com pipeline_id preenchido.
--
-- Causa raiz: migration 20260322000000 trocou COALESCE por NULLIF no UPDATE —
-- um webhook sem pipeline_id sobrescreve o valor existente com NULL.
-- Isso precisa ser corrigido (issue separado abaixo). Por ora, fix manual.
--
-- Esta migration: preenche pipeline_id e pipeline_name usando o webhook
-- mais recente que tem pipeline_id não-vazio para cada oportunidade.

UPDATE oportunidades o
SET
  pipeline_id   = w_latest.pipeline_id,
  pipeline_name = w_latest.pipeline_name
FROM (
  SELECT DISTINCT ON (TRIM(payload->>'id'))
    TRIM(payload->>'id')          AS ghl_opportunity_id,
    TRIM(payload->>'pipeline_id') AS pipeline_id,
    TRIM(payload->>'pipeline_name') AS pipeline_name
  FROM webhooks_ghl
  WHERE payload->>'id' IS NOT NULL
    AND TRIM(payload->>'pipeline_id') != ''
    AND payload->>'pipeline_id' IS NOT NULL
  ORDER BY TRIM(payload->>'id'), created_at DESC
) w_latest
WHERE o.ghl_opportunity_id = w_latest.ghl_opportunity_id
  AND o.pipeline_id IS NULL;
