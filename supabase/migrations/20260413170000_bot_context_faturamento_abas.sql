-- bot_context: explica a diferença de faturamento entre abas (COHORT vs PRODUTIVIDADE)
-- Atualizar sem redeploy: UPDATE bot_context SET content = '...' WHERE key = 'faturamento_por_aba';

INSERT INTO bot_context (key, title, content, ordem) VALUES
('faturamento_por_aba', 'Faturamento por Aba — COHORT vs PRODUTIVIDADE', $BOT$
Cada aba do dashboard calcula "faturamento" de forma diferente.

**Aba Aquisição e Aba Tráfego Pago — COHORT faturamento:**
Mostra pagamentos de leads gerados no período, sem limite superior de data.
→ Inclui pagamentos feitos EM ABRIL de leads gerados em MARÇO.
→ NÃO inclui pagamentos de leads antigos recebidos no período.
SQL equivalente:
```sql
SELECT SUM(vf.valor_faturado) AS faturamento_cohort
FROM vendas_fechamento vf
JOIN oportunidades o ON o.id = vf.oportunidade_id
WHERE vf.data_pagamento_entrada >= '{startISO}'
  AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
  AND o.data_lead_recebido >= '{startISO}'
  AND o.data_lead_recebido <= '{endISO}'
```
→ query_funnel_cohort já retorna faturamento_brl com esse cálculo.

**Aba Vendas / Financeiro — PRODUTIVIDADE faturamento:**
Mostra pagamentos recebidos no período, independente de quando o lead entrou.
→ Inclui pagamentos de leads antigos recebidos no período.
SQL equivalente:
```sql
SELECT COUNT(*) AS vendas, SUM(valor_faturado) AS faturamento, SUM(valor_entrada) AS caixa
FROM vendas_fechamento
WHERE data_pagamento_entrada >= '{startISO}'
  AND data_pagamento_entrada <= '{endISO}'
```
→ query_revenue_produtividade usa esse cálculo.

**MARÇO/2026 (valores reais confirmados no banco):**
- PRODUTIVIDADE: R$ 317.500,20 — 10 vendas (pagamentos recebidos em março)
- COHORT: R$ 215.833,40 — 7 vendas de leads de março

**Regra:** Se o usuário diz que a aba mostra um número diferente do que o bot calculou,
usar run_sql_query para confirmar o valor atual no banco e identificar se a divergência
é COHORT vs PRODUTIVIDADE.
$BOT$, 35)

ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  ordem = EXCLUDED.ordem,
  ativo = true;
