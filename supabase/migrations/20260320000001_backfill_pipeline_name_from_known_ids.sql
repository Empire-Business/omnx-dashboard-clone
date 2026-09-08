-- Migration: backfill pipeline_name para opps com pipeline_id preenchido mas pipeline_name NULL
--
-- Causa: sync-opp-pipelines sempre retornava pipeline_name: null (bug corrigido na edge function).
-- O cron preencheu pipeline_id mas nunca pipeline_name.
--
-- Solução: derivar pipeline_name a partir do pipeline_id já conhecido em outras opps do banco.

UPDATE oportunidades o
SET pipeline_name = (
  SELECT pipeline_name
  FROM oportunidades ref
  WHERE ref.pipeline_id = o.pipeline_id
    AND ref.pipeline_name IS NOT NULL
  LIMIT 1
)
WHERE o.pipeline_name IS NULL
  AND o.pipeline_id IS NOT NULL;
