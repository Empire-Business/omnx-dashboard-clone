-- Migration: Backfill de cpf_cnpj_contratante e complemento_endereco em vendas_fechamento
--
-- CONTEXTO (2026-03-23):
-- A migration 20260323030000 corrigiu o trigger para ler as chaves corretas do GHL,
-- mas o backfill daquela migration só atualizou forma_pagamento e produto_vendido.
-- Os campos cpf_cnpj_contratante e complemento_endereco ficaram com NULL em todos
-- os 47 registros existentes, mesmo tendo dados disponíveis nos webhooks.
--
-- CHAVES CONFIRMADAS via jsonb_object_keys() em webhook real:
--   cpf_cnpj_contratante  → '{{ opportunity.cpf_ou_cnpj_do_contratante }}'  (com espaços)
--   complemento_endereco  → '{{ opportunity.complemento_do_endereo }}'       (com espaços; typo do GHL: "endereo" sem ç)
--
-- op_vencimentos_parcelas → campo '{{ opportunity.op_vencimentos_e_parcelas }}' NÃO EXISTE
--   em nenhum webhook (count=0). O campo nunca foi preenchido no GHL. O trigger já
--   está pronto para quando isso acontecer — nada a backfillar.
--
-- RESULTADO ESPERADO: 47 registros atualizados (todos com valor_entrada > 0 ou parcelas > 0)

UPDATE vendas_fechamento vf
SET
    cpf_cnpj_contratante = COALESCE(sub.cpf_cnpj, vf.cpf_cnpj_contratante),
    complemento_endereco = COALESCE(sub.complemento, vf.complemento_endereco),
    updated_at           = NOW()
FROM (
    SELECT DISTINCT ON (o.id)
        o.id AS opp_pk_id,
        NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), '') AS cpf_cnpj,
        NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}'), '')      AS complemento
    FROM webhooks_ghl w
    JOIN oportunidades o ON o.ghl_opportunity_id = w.payload->>'id'
    WHERE
        NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), '') IS NOT NULL
        OR NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}'), '')   IS NOT NULL
    ORDER BY o.id, w.created_at DESC  -- webhook mais recente por oportunidade
) sub
WHERE
    vf.oportunidade_id = sub.opp_pk_id
    AND (sub.cpf_cnpj IS NOT NULL OR sub.complemento IS NOT NULL);

-- Verificação
DO $$
DECLARE
    v_sem_cpf INTEGER;
    v_sem_complemento INTEGER;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE cpf_cnpj_contratante IS NULL),
        COUNT(*) FILTER (WHERE complemento_endereco IS NULL)
    INTO v_sem_cpf, v_sem_complemento
    FROM vendas_fechamento
    WHERE valor_entrada > 0 OR numero_parcelas > 0;

    RAISE NOTICE 'Backfill concluído — sem CPF: %, sem complemento: %', v_sem_cpf, v_sem_complemento;
END $$;
