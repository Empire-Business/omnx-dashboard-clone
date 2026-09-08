-- Recalcula as colunas financeiras a partir do cronograma real (`pagamentos`),
-- para as vendas do omnx-desk que o webhook do GHL esmagou.
--
-- Regra idêntica à de `crm-registrar-venda`:
--   entrada  = item com sinal "Entrada"; na falta, o de data mais antiga
--   parcelas = todos os demais itens
--   valor_parcela = média das parcelas (para a coluna GERADA valor_faturado
--                   fechar com a soma real dos pagamentos)
--
-- Só toca linhas de origem omnx_desk/empiredesk cujo valor_faturado diverge da
-- soma dos pagamentos em mais de R$ 1 — em 31/08/2026 eram exatamente 2 linhas
-- (opps 8ba650b9 e 27343eb6, ambas de R$ 48.000). Idempotente: rodar de novo
-- não muda nada depois de corrigido.
BEGIN;

WITH alvo AS (
  SELECT v.id,
         v.pagamentos,
         (SELECT COALESCE(SUM((p->>'valor')::NUMERIC), 0)
            FROM jsonb_array_elements(v.pagamentos) p) AS soma
  FROM vendas_fechamento v
  WHERE v.origem IN ('omnx_desk', 'empiredesk')
    AND jsonb_array_length(COALESCE(v.pagamentos, '[]'::jsonb)) > 0
    AND ABS(COALESCE(v.valor_faturado, 0)
            - (SELECT COALESCE(SUM((p->>'valor')::NUMERIC), 0)
                 FROM jsonb_array_elements(v.pagamentos) p)) > 1
),
calc AS (
  SELECT a.id,
         entrada.valor        AS valor_entrada,
         entrada.forma        AS forma_pagamento,
         parcelas.n           AS numero_parcelas,
         CASE WHEN parcelas.n > 0 THEN parcelas.soma / parcelas.n END AS valor_parcela
  FROM alvo a
  CROSS JOIN LATERAL (
    SELECT (p->>'valor')::NUMERIC AS valor, p->>'forma' AS forma, p->>'data' AS data
    FROM jsonb_array_elements(a.pagamentos) p
    ORDER BY (LOWER(COALESCE(p->>'sinal', '')) LIKE '%entrada%') DESC, p->>'data'
    LIMIT 1
  ) entrada
  CROSS JOIN LATERAL (
    SELECT COUNT(*)::INT AS n, COALESCE(SUM((p->>'valor')::NUMERIC), 0) AS soma
    FROM jsonb_array_elements(a.pagamentos) p
    WHERE LOWER(COALESCE(p->>'sinal', '')) NOT LIKE '%entrada%'
  ) parcelas
)
UPDATE vendas_fechamento v
SET valor_entrada   = c.valor_entrada,
    numero_parcelas = c.numero_parcelas,
    valor_parcela   = c.valor_parcela,
    forma_pagamento = COALESCE(c.forma_pagamento, v.forma_pagamento),
    updated_at      = NOW()
FROM calc c
WHERE v.id = c.id;

-- Conferência: depois do UPDATE nenhuma linha do desk pode divergir.
SELECT COUNT(*) AS ainda_divergentes
FROM vendas_fechamento v
WHERE v.origem IN ('omnx_desk', 'empiredesk')
  AND jsonb_array_length(COALESCE(v.pagamentos, '[]'::jsonb)) > 0
  AND ABS(COALESCE(v.valor_faturado, 0)
          - (SELECT COALESCE(SUM((p->>'valor')::NUMERIC), 0)
               FROM jsonb_array_elements(v.pagamentos) p)) > 1;

COMMIT;
