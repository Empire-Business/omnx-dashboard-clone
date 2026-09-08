-- Migration: Backfill completo de op_vencimentos_parcelas
--
-- CONTEXTO (2026-03-23):
-- Após corrigir a chave no trigger (20260323100000), 4.861 registros ainda têm
-- op_vencimentos_parcelas = NULL. Este backfill pega o valor mais recente de cada
-- webhook para todos os vendas_fechamento com NULL.
--
-- Para os que não têm o campo em nenhum webhook → permanece NULL (campo genuinamente
-- não preenchido no GHL).

UPDATE vendas_fechamento vf
SET
    op_vencimentos_parcelas = sub.op_vencimentos,
    updated_at              = NOW()
FROM (
    SELECT DISTINCT ON (o.id)
        o.id AS opp_pk_id,
        NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_vencimentos_e_parcelas}}'), '') AS op_vencimentos
    FROM webhooks_ghl w
    JOIN oportunidades o ON o.ghl_opportunity_id = w.payload->>'id'
    WHERE NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_vencimentos_e_parcelas}}'), '') IS NOT NULL
    ORDER BY o.id, w.created_at DESC
) sub
WHERE
    vf.oportunidade_id = sub.opp_pk_id
    AND vf.op_vencimentos_parcelas IS NULL
    AND sub.op_vencimentos IS NOT NULL;
