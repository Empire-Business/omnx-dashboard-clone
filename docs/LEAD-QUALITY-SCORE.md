# Score de Qualidade Real do MQL

## Status

| Campo | Valor |
|-------|-------|
| Documento | `LEAD-QUALITY-SCORE.md` |
| Data | 2026-04-13 10:10 BRT |
| Status | Implementado no frontend |
| Escopo padrão | Apenas oportunidades com tag `MQL` |
| Visão principal | Cohort + snapshot |

---

## Objetivo

Dar um termômetro único por lead sem misturar aquisição com produtividade pura do time.

A unidade de análise continua sendo a regra canônica do projeto:

- **Lead = oportunidade**
- **MQL = tag `MQL` em `contatos.tags`**
- **Compra = `vendas_fechamento.data_pagamento_entrada`**
- **Recuperação = excluído**

O score foi desenhado para responder:

1. esse MQL respondeu?
2. ele conectou e agendou?
3. avançou no processo comercial?
4. comprou de fato?

---

## Fórmula oficial

```text
lead_quality_score = (pontos_ganhos / pontos_elegiveis) * 100
```

### Por que usar `pontos_elegiveis`

O lead não pode ser penalizado por uma etapa que ainda não teve tempo de maturar.

Exemplo:
- lead com 4 dias não perde ponto por ainda não ter compra
- lead com 15 dias já pode ser cobrado por resposta e agendamento
- lead com 120 dias pode ser comparado de ponta a ponta

---

## Blocos do score

Cada bloco vale até **25 pontos**.

### 1. Resposta inicial — até 25 pts

- `+10` se houve inbound em até 7 dias
- `+8` se `data_conectado` ocorreu em até 7 dias
- `+7` se a primeira resposta do lead veio em até 24h
- `+5` se veio em até 72h
- `+3` se veio em até 7 dias

**Elegibilidade:** a partir de D+1 ou assim que houver resposta/conexão.

### 2. Agendamento — até 25 pts

- `+15` se `data_agendamento_reuniao` ocorreu em até 7 dias
- `+10` se `data_reuniao_agendada` ficou em até 10 dias do lead
- `-5` se houve `data_no_show` sem reunião realizada, sem deixar o bloco negativo

**Elegibilidade:** a partir de D+10 ou assim que houver agendamento/no-show.

### 3. Avanço comercial — até 25 pts

- `+10` se `data_qualificado` estiver preenchida
- `+10` se `data_realizacao_vendas` ocorreu em até 30 dias
- `+5` se o lead entrou em fase comercial (`data_negociacao`, `data_agendamento_vendas`, `data_realizacao_vendas` ou pipeline de vendas)

**Elegibilidade:** a partir de D+30 ou assim que houver avanço.

### 4. Resultado final — até 25 pts

- `+25` se `data_pagamento_entrada` ocorreu em até 90 dias

**Elegibilidade:** a partir de D+90 ou assim que houver pagamento confirmado.

---

## Buckets do termômetro

| Score | Bucket |
|------:|--------|
| 85-100 | Excelente |
| 70-84 | Bom |
| 50-69 | Medio |
| 30-49 | Fraco |
| 0-29 | Critico |

---

## Maturidade do lead

Além da nota, cada lead recebe um estágio de maturidade:

| Idade do lead | Estágio |
|---------------|---------|
| 0-6 dias | `recente` |
| 7-9 dias | `em_resposta` |
| 10-29 dias | `em_agendamento` |
| 30-89 dias | `em_avanco` |
| 90+ dias | `maduro` |

Isso ajuda a interpretar um score baixo recente sem confundir com lead velho que já teve toda a chance de evoluir.

---

## Agregação por filtro

Na aba `Leads`, o resumo do score considera apenas MQLs com score calculável e pode agrupar por:

- canal
- funil
- campanha
- SDR
- estágio

Cada grupo exibe:

- quantidade de MQLs
- score médio
- bucket médio
- `% respondeu em 7d`
- `% agendou em 7d`
- `% comprou em 90d`

---

## Fontes de dados usadas

- `oportunidades.data_lead_recebido`
- `oportunidades.data_conectado`
- `oportunidades.data_agendamento_reuniao`
- `oportunidades.data_reuniao_agendada`
- `oportunidades.data_qualificado`
- `oportunidades.data_negociacao`
- `oportunidades.data_agendamento_vendas`
- `oportunidades.data_realizacao_vendas`
- `oportunidades.data_no_show`
- `contatos.tags`
- `comunicacoes.direction = 'inbound'` + `data_comunicacao`
- `vendas_fechamento.data_pagamento_entrada`

---

## Observações importantes

- O score **não** substitui KPIs de produtividade do time; ele mede a qualidade real observada do MQL no cohort.
- O score principal é **único**, mas sua composição continua auditável por blocos.
- O resumo por filtro deve ser interpretado sempre no mesmo universo base da tela.

Ver também:

- `docs/CONCEITOS-NEGOCIO.md`
- `docs/MQL-TAG-CLASSIFICATION.md`
- `docs/KPI-SDR-LEADERBOARD.md`
