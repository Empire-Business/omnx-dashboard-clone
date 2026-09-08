-- Migration: Backfill de idempotência do OpenClaw para contratos já assinados
--
-- PROBLEMA:
-- A coluna oportunidades.openclaw_notificado_em passou a ser usada como trava
-- de idempotência em 20260324010000. Porém, contratos históricos já assinados
-- antes dessa migration ficaram com link em vendas_fechamento, mas sem a marca
-- de "já notificado".
--
-- EFEITO COLATERAL:
-- Ao atualizar uma oportunidade antiga que já tinha contrato assinado, o sistema
-- podia reenviar para o OpenClaw porque via:
--   - oportunidade em stage Assinada
--   - link já existente
--   - openclaw_notificado_em = NULL
--
-- SOLUÇÃO:
-- Fazer um backfill único da marca de idempotência apenas para oportunidades que,
-- pelo estado atual do banco, já devem ser tratadas como "assinadas históricas":
--   1. têm link de contrato em vendas_fechamento
--   2. e estão em Assinada no pipeline Vendas SQL
--      OU já têm data_da_assinatura_do_contrato preenchida
--
-- IMPORTANTE:
-- Isso NÃO bloqueia leads ainda não assinados. Ex.: link genérico/ruim fora de
-- Assinada e sem data de assinatura continua sem marcação.

WITH historicos_assinados AS (
  SELECT
    o.id AS oportunidade_id,
    COALESCE(vf.updated_at, o.updated_at, NOW()) AS marcado_em
  FROM public.oportunidades o
  INNER JOIN public.vendas_fechamento vf
    ON vf.oportunidade_id = o.id
  WHERE o.openclaw_notificado_em IS NULL
    AND NULLIF(TRIM(vf.op_link_do_contrato_assinado), '') IS NOT NULL
    AND (
      (
        o.pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
        AND o.pipeline_stage_id = 'Assinada'
      )
      OR vf.data_da_assinatura_do_contrato IS NOT NULL
    )
)
UPDATE public.oportunidades o
SET openclaw_notificado_em = h.marcado_em
FROM historicos_assinados h
WHERE o.id = h.oportunidade_id;
