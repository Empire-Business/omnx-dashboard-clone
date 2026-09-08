-- Alinha `data_pagamento_entrada` das vendas do omnx-desk com a data que o
-- financeiro registrou no desk.
--
-- Contexto: até a migration 20261021000000, o webhook do GHL sobrescrevia a data
-- com o que o closer digitava no campo `{{opportunity.data_pagamento_entrada}}`.
-- Quatro vendas ficaram com data diferente da do desk (conferido em 31/08/2026):
--
--   opp 356b8fb1 — desk 09/06/2026, CRM 02/06/2026  (7 dias)
--   opp 531bd9ef — desk 18/06/2026, CRM 17/06/2026  (1 dia)
--   opp 8ba650b9 — desk 06/08/2026, CRM 05/08/2026  (1 dia)
--   opp 27343eb6 — desk 13/08/2026, CRM 12/08/2026  (1 dia)
--
-- A data manda em qual dia/mês a venda entra nos painéis, então vale alinhar.
-- Fonte de verdade = desk. Grava meio-dia BRT, exatamente como `crm-registrar-venda`,
-- para não errar na borda do fuso.
--
-- Idempotente: rodar de novo não muda nada.
BEGIN;

UPDATE vendas_fechamento v
SET data_pagamento_entrada = (d.data_desk || 'T12:00:00-03:00')::timestamptz,
    updated_at = NOW()
FROM (VALUES
  ('356b8fb1', '2026-06-09'),
  ('531bd9ef', '2026-06-18'),
  ('8ba650b9', '2026-08-06'),
  ('27343eb6', '2026-08-13')
) AS d(prefixo, data_desk)
WHERE v.oportunidade_id::text LIKE d.prefixo || '%'
  AND v.origem IN ('omnx_desk', 'empiredesk')
  AND (v.data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo')::date
      IS DISTINCT FROM d.data_desk::date;

-- Conferência: as quatro devem sair com a data do desk.
SELECT left(oportunidade_id::text, 8) AS opp,
       (data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo')::date AS pago_em,
       valor_faturado::numeric(12,2) AS faturado
FROM vendas_fechamento
WHERE oportunidade_id::text LIKE '356b8fb1%'
   OR oportunidade_id::text LIKE '531bd9ef%'
   OR oportunidade_id::text LIKE '8ba650b9%'
   OR oportunidade_id::text LIKE '27343eb6%'
ORDER BY 2;

COMMIT;
