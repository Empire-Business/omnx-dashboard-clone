-- Migration: Fazer backfill de vendas_fechamento com dados antigos dos webhooks
--
-- Reprocessa todos os webhooks que têm dados de faturamento mas não foram
-- processados pela função extrair_vendas_fechamento_do_webhook

BEGIN;

-- Reprocessar todos os webhooks com dados de faturamento
WITH webhooks_com_faturamento AS (
    SELECT
        w.id,
        w.payload,
        TRIM(w.payload->>'id') as opp_id,
        TRIM(w.payload->>'contact_id') as contact_ghl_id
    FROM webhooks_ghl w
    WHERE w.payload->>'id' IS NOT NULL
      AND (
          w.payload->'customData'->>'{{ opportunity.valor_entrada }}' IS NOT NULL
          OR w.payload->'customData'->>'{{ opportunity.numero_parcelas }}' IS NOT NULL
          OR w.payload->'customData'->>'{{ opportunity.valor_parcela }}' IS NOT NULL
          OR w.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}' IS NOT NULL
      )
)
INSERT INTO vendas_fechamento (
    oportunidade_id, contato_id,
    nome_contratante, cpf_cnpj_contratante,
    logradouro_rua_avenida, numero_endereco, complemento_endereco,
    bairro, municipio, estado_uf, cep,
    produto_vendido, observacoes_venda,
    forma_pagamento,
    valor_entrada, numero_parcelas, valor_parcela,
    data_pagamento_entrada
)
SELECT DISTINCT
    o.id as oportunidade_id,
    c.id as contato_id,
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.nome_contratante }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.cpf_cnpj_contratante }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.numero_endereco }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.complemento_endereco }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.bairro }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.municipio }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.estado_uf }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.cep }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.produto_vendido }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.observacoes_venda }}'), ''),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.forma_pagamento }}'), ''),
    COALESCE((w.payload->'customData'->>'{{ opportunity.valor_entrada }}')::DECIMAL, 0),
    COALESCE((w.payload->'customData'->>'{{ opportunity.numero_parcelas }}')::INTEGER, 0),
    COALESCE((w.payload->'customData'->>'{{ opportunity.valor_parcela }}')::DECIMAL, 0),
    NULLIF(TRIM(w.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ
FROM webhooks_com_faturamento w
INNER JOIN oportunidades o ON o.ghl_opportunity_id = w.opp_id
INNER JOIN contatos c ON c.ghl_id = w.contact_ghl_id
WHERE NOT EXISTS (
    SELECT 1 FROM vendas_fechamento vf
    WHERE vf.oportunidade_id = o.id
)
ON CONFLICT (oportunidade_id) DO UPDATE SET
    nome_contratante = EXCLUDED.nome_contratante,
    cpf_cnpj_contratante = EXCLUDED.cpf_cnpj_contratante,
    logradouro_rua_avenida = EXCLUDED.logradouro_rua_avenida,
    numero_endereco = EXCLUDED.numero_endereco,
    complemento_endereco = EXCLUDED.complemento_endereco,
    bairro = EXCLUDED.bairro,
    municipio = EXCLUDED.municipio,
    estado_uf = EXCLUDED.estado_uf,
    cep = EXCLUDED.cep,
    produto_vendido = EXCLUDED.produto_vendido,
    observacoes_venda = EXCLUDED.observacoes_venda,
    forma_pagamento = EXCLUDED.forma_pagamento,
    valor_entrada = EXCLUDED.valor_entrada,
    numero_parcelas = EXCLUDED.numero_parcelas,
    valor_parcela = EXCLUDED.valor_parcela,
    data_pagamento_entrada = EXCLUDED.data_pagamento_entrada,
    updated_at = NOW();

-- Verificar resultado
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM vendas_fechamento WHERE created_at >= NOW() - INTERVAL '1 minute';
    RAISE NOTICE 'Backfill: % registros de vendas criados/atualizados', v_count;
END $$;

COMMIT;
