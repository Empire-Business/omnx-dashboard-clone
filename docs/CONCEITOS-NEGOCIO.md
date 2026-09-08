# Conceitos de Negócio

---

## MQL — Definição

**MQL (Marketing Qualified Lead) = Lead que recebeu a TAG "MQL" no GHL (qualificação pelo marketing).**

⚠️ **IMPORTANTE:** MQL é definido pela **TAG no GHL**, não pelo pipeline. Uma pessoa pode ter a tag MQL e estar em diferentes pipelines (Pré-Vendas MQL, Vendas SQL, etc.) ou ter saído do pipeline MQL mas ainda ter a tag MQL no contato.

### Como identificar MQL no sistema

1. **No GHL:** Verificar se o contato/oportunidade tem a tag "MQL"
2. **No Supabase:** Buscar em `oportunidades` onde o contato associado tem a tag MQL (campo `tags` ou relacionamento com tabela de tags)

```sql
-- CORRETO: buscar por tag no GHL ou no campo tags em contatos
-- (Depende de como as tags são armazenadas no seu schema)

-- ERRADO: filtrar apenas por pipeline_name = 'Pré-Vendas MQL'
-- (Um MQL pode ter saído desse pipeline)
```

### Classificação por Pipeline vs Qualificação por TAG

| Pipeline | Significado | Qualificação MQL |
|----------|-------------|------------------|
| Pré-Vendas MQL | Lead em estágio de pré-venda | Pode ter TAG MQL |
| Pré-Vendas nMQL | Lead não qualificado em pré-venda | TAG NMQL (sem MQL) |
| Vendas SQL | Lead em estágio de venda | Pode ter TAG MQL (MQL que evoluiu) |
| [fn] webinário | Funil de webinário | Pode ter TAG MQL se qualificado |
| Social Selling | Contato via social | TAG varia |
| Recuperação | Leads reativados | TAG varia |

> **Regra:** Um lead com TAG MQL sempre é MQL, independente do pipeline atual.

> ⚠️ **Pipeline Recuperação (`pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'`) = leads antigos reativados, não novos leads gerados.**
> **EXCLUÍDO de todas as contagens de leads novos, MQL, funil e cohort nos dashboards.**
> Filtro aplicado em `useTrafego.ts` e `usePreVendas.ts` via `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)`.

### Histórico de Renomeação (Fev/2026)

Os campos com prefixo "mql"/"sql" foram renomeados para evitar confusão com a classificação de pipeline:

| Nome Antigo | Nome Novo |
|-------------|-----------|
| `data_mql_lead_recebido` | `data_lead_recebido` |
| `data_mql_contato_N` | `data_tentativa_N` |
| `data_mql_conectado` | `data_conectado` |
| `data_mql_no_show` | `data_no_show` |
| `data_mql_perdido` | `data_perdido` |
| `data_mql_qualificado` | `data_qualificado` |
| `data_mql_reuniao_marcada` | `data_agendamento_reuniao` |
| `data_sql_*` | `data_*_vendas` |

---

## Lead = Oportunidade

**Regra de negócio:** LEAD = OPORTUNIDADE CRIADA. Um contato pode ter N oportunidades.

```
João Silva (Contato — 1 registro em contatos)
├── Oportunidade ID: abc123 (Lead #1) — Formulário em 01/02/2026
├── Oportunidade ID: def456 (Lead #2) — Formulário em 15/02/2026
└── Oportunidade ID: ghi789 (Lead #3) — Formulário em 20/02/2026
```

- `contatos`: 1 registro por pessoa
- `oportunidades`: N registros por pessoa
- Relacionamento: `contatos.id` ← `oportunidades.contato_id` (1:N)

**Implicação:** ao contar leads, contar oportunidades — não contatos.

---

## COHORT vs PRODUTIVIDADE

Toda análise, relatório ou dashboard deve seguir uma das duas abordagens. **Nunca misturar na mesma análise.**

| Abordagem | Filtro Principal | Pergunta respondida |
|-----------|------------------|---------------------|
| **COHORT** | Data de **geração** do lead (`data_lead_recebido`) | "O que aconteceu com os leads gerados em X?" |
| **PRODUTIVIDADE** | Data do **evento** (`data_conectado`, `data_agendamento_reuniao`, `data_realizacao_vendas`, `data_pagamento_entrada`, etc.) | "O que foi produzido no período X?" |

### ⚠️ Critério de "Venda Fechada" = `data_pagamento_entrada`

**IMPORTANTE:** Uma oportunidade só conta como "venda fechada" quando `vendas_fechamento.data_pagamento_entrada` está preenchida. O campo `oportunidades.data_fechado` indica apenas que o deal foi movido para a etapa "Fechado" no GHL — isso NÃO confirma pagamento. Sem `data_pagamento_entrada`, o lead não aparece como venda em nenhum painel.

### Exemplo

```sql
-- COHORT: leads de janeiro que viraram vendas COM PAGAMENTO CONFIRMADO
SELECT COUNT(*) FROM oportunidades o
JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
WHERE o.data_lead_recebido >= '2026-01-01T00:00:00-03:00'
  AND o.data_lead_recebido < '2026-02-01T00:00:00-03:00'
  AND vf.data_pagamento_entrada IS NOT NULL;

-- PRODUTIVIDADE: vendas com pagamento recebido em janeiro
SELECT COUNT(*) FROM vendas_fechamento
WHERE data_pagamento_entrada >= '2026-01-01' AND data_pagamento_entrada < '2026-02-01';
```

### Quando usar cada um

| Caso de uso | Abordagem |
|-------------|-----------|
| Avaliar qualidade de aquisição | COHORT |
| ROI de campanhas | COHORT |
| Tempo de ciclo de venda | COHORT |
| Metas operacionais do time | PRODUTIVIDADE |
| Dashboard em tempo real | PRODUTIVIDADE |
| Faturamento do período | PRODUTIVIDADE |

### Regra operacional da Produtividade

- Cada métrica de produtividade deve usar a **data do próprio evento**.
- As etapas são **independentes**. Não existe lógica de funil onde uma coluna prende a outra no modo produtividade.
- Mapeamento canônico por etapa:
  - `Leads` e `MQLs` → `data_lead_recebido`
  - `Conectados` → `data_conectado`
  - `Agendados` → `data_agendamento_reuniao` ou `data_agendamento_vendas`, conforme o módulo
  - `Reuniões` → `data_realizacao_vendas`
  - `Fechados` → `vendas_fechamento.data_pagamento_entrada`
- `data_lead_recebido` e contagem de MQLs **não podem limitar** métricas operacionais como conectados, agendados, reuniões, fechados, faturamento e caixa.
- Em produtividade, percentuais de conversão, funis encadeados e qualquer visualização que dependa da etapa anterior são inconsistentes com a regra de negócio e não devem ser usados.

Documento completo: [`ANALISE-COHORT-VS-PRODUTIVIDADE.md`](../ANALISE-COHORT-VS-PRODUTIVIDADE.md)
