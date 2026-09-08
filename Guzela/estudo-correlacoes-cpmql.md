# Estudo de Correlações: Métricas Meta Ads vs CPMQL

**Objetivo:** Descobrir quais métricas do Meta Ads têm correlação com CPMQL baixo (custo por MQL), para ajudar na seleção e escalada de criativos.

**Base:** 29 criativos com mais de 3 leads no CRM e pelo menos 1 MQL. Dados históricos completos da conta.

---

## Correlações de Pearson (n=29 criativos)

| Métrica | Correlação com CPMQL | Interpretação |
|---------|---------------------|---------------|
| **% MQL (taxa de qualificação)** | **-0.595** | **Correlação negativa moderada-forte** — quanto maior a % de leads que viram MQL, menor o CPMQL |
| CPL (custo por lead) | +0.397 | Correlação positiva moderada — CPL alto tende a CPMQL alto |
| CTR (click-through rate) | +0.384 | Correlação positiva moderada — CTR alto tende a CPMQL **mais alto** |
| Video Hook Rate | +0.099 | Sem correlação prática |
| Conv. Página | +0.043 | Sem correlação linear (mas tem comportamento não-linear — ver abaixo) |
| CPM | +0.039 | Sem correlação |

> Convenção: correlação negativa significa "quanto maior a métrica, menor o CPMQL" (desejável). Positiva significa "quanto maior a métrica, maior o CPMQL" (indesejável).

---

## Análise por Quartis: CTR vs CPMQL

| Quartil | Faixa CTR | CPMQL médio |
|---------|-----------|-------------|
| Q1 (menor CTR) | 0.9% – 1.6% | **R$ 82** ← melhor |
| Q2 | 1.7% – 2.2% | R$ 151 |
| Q3 | 2.2% – 2.7% | R$ 128 |
| Q4 (maior CTR) | 2.7% – 13.4% | **R$ 276** ← pior |

**Conclusão CTR:** CTR alto não é sinal de qualidade de lead no seu negócio. Criativos com CTR muito alto (acima de 2.7%) atraem público curioso mas não qualificado — CPMQL 3x maior do que criativos com CTR moderado/baixo.

---

## Análise por Quartis: Video Hook Rate vs CPMQL

| Quartil | Faixa Video Hook | CPMQL médio |
|---------|-----------------|-------------|
| Q1 (menor) | 0% – 16% | R$ 116 |
| Q2 | 16% – 23% | R$ 124 |
| Q3 | 23% – 31% | R$ 191 |
| Q4 (maior) | 31% – 46% | R$ 202 |

**Conclusão Video Hook:** Sem correlação negativa útil. Video hook alto não prediz CPMQL baixo — de fato o padrão é levemente inverso (hooks muito engajantes atraem público amplo mas não necessariamente qualificado).

---

## Análise por Quartis: Conv. Página vs CPMQL

| Quartil | Faixa Conv. Página | CPMQL médio |
|---------|--------------------|-------------|
| Q1 (menor) | 0% – 3.1% | R$ 231 ← ruim |
| Q2 | 3.6% – 11.7% | R$ 109 |
| Q3 | **11.8% – 31.1%** | **R$ 69 ← melhor** |
| Q4 (maior) | 32% – 128% | R$ 209 ← ruim |

**Conclusão Conv. Página:** Comportamento de curva em U invertido. A zona ótima é **Conv. Página entre 12% e 31%**. Abaixo disso, a página não converte bem. Acima disso, a landing page é tão genérica que converte qualquer um (inclusive não qualificados).

---

## Top 10 Criativos (menor CPMQL) — dados reais

| Criativo | Investimento | Leads | MQL | % MQL | CPMQL | CTR | Video Hook | Conv. Página |
|----------|-------------|-------|-----|-------|-------|-----|------------|--------------|
| CR-3 | R$ 140 | 24 | 24 | 100% | **R$ 5,82** | 1.6% | 5% | 0% |
| CR-187 | R$ 105 | 9 | 4 | 44% | **R$ 26,30** | 1.6% | 17% | 6% |
| CR-238 | R$ 147 | 5 | 5 | 100% | **R$ 29,44** | 1.7% | 15% | 0% |
| CR-269 | R$ 1.020 | 23 | 23 | 100% | **R$ 44,35** | 2.7% | 28% | 25% |
| CR-408 | R$ 10.428 | 222 | 221 | 99.5% | **R$ 47,19** | 2.5% | 24% | 16% |
| CR-248 | R$ 52.837 | 990 | 989 | 99.9% | **R$ 53,42** | 1.8% | 33% | 12% |
| CR-2 | R$ 88.064 | 1.624 | 1.613 | 99.3% | **R$ 54,60** | 2.3% | 24% | 31% |
| CR-227 | R$ 287 | 5 | 5 | 100% | **R$ 57,39** | 1.2% | 14% | 3% |
| CR-415 | R$ 351 | 6 | 6 | 100% | **R$ 58,50** | 1.0% | 14% | 8% |
| CR-324 | R$ 22.745 | 345 | 342 | 99.1% | **R$ 66,51** | 2.0% | 20% | 12% |

---

## Bottom 10 Criativos (maior CPMQL) — dados reais

| Criativo | Investimento | Leads | MQL | % MQL | CPMQL | CTR | Video Hook | Conv. Página |
|----------|-------------|-------|-----|-------|-------|-----|------------|--------------|
| CR-570 | R$ 882 | 60 | 6 | **10%** | R$ 147 | 0.9% | 19% | 41% |
| CR-674 | R$ 989 | 6 | 6 | 100% | R$ 165 | 2.2% | 24% | 32% |
| CR-444 | R$ 186 | 7 | 1 | **14%** | R$ 186 | 1.4% | 0% | 129% |
| CR-225 | R$ 3.006 | 16 | 16 | 100% | R$ 188 | 1.9% | 17% | 5% |
| CR-172 | R$ 657 | 6 | 3 | **50%** | R$ 219 | **5.3%** | 24% | 0% |
| CR-168 | R$ 3.600 | 20 | 16 | 80% | R$ 225 | 2.3% | 23% | 4% |
| CR-434 | R$ 923 | 25 | 3 | **12%** | R$ 308 | 2.2% | 34% | 85% |
| CR-565 | R$ 449 | 17 | 1 | **6%** | R$ 449 | 2.0% | 0% | 39% |
| CR-154 | R$ 635 | 6 | 1 | **17%** | R$ 635 | **9.3%** | 32% | 0% |
| CR-146 | R$ 697 | 4 | 1 | **25%** | R$ 697 | **5.1%** | 31% | 0% |

---

## Resumo Executivo

### 1. A métrica mais preditiva é % MQL — e ela não está no Meta

A correlação mais forte com CPMQL baixo é a **taxa de qualificação (MQL/Leads)** com correlação de **-0.595**. Isso não é uma métrica do Meta Ads — é do CRM. Significa que o criativo em si determina a qualidade do público que atrai, e isso só aparece quando você cruza com os dados do CRM.

**Implicação prática:** Para testar se um novo criativo vai gerar CPMQL baixo, você precisa rodar ele por tempo suficiente para acumular leads e medir a taxa de MQL. Não tem como saber isso só pelo painel do Meta.

### 2. CTR alto é sinal de alerta, não de sucesso

Correlação CTR ↔ CPMQL = **+0.384** (positiva). Criativos com CTR acima de 2.7% têm CPMQL médio de **R$ 276** — 3,4x maior do que criativos com CTR baixo (R$ 82). Os três piores criativos (CR-172, CR-154, CR-146) têm CTR de 5-9% e taxa MQL de 17-50%.

**Implicação prática:** Se um criativo tem CTR muito alto, suspeite. Pode estar atraindo público curioso mas não qualificado. No contexto do seu negócio, CTR entre **1.5% e 2.5%** parece ser a zona mais saudável.

### 3. Video Hook não prediz qualidade de lead

Correlação Video Hook ↔ CPMQL = **+0.099** (praticamente zero). Você pode ter video hook de 46% e CPMQL de R$ 200, ou video hook de 5% e CPMQL de R$ 6 (CR-3). Hooks que prendem qualquer um não filtram o público qualificado.

**Implicação prática:** Não use video hook como critério de qualidade de criativo para o seu negócio. É um indicador de entretenimento, não de intenção de compra.

### 4. Conv. Página tem zona ótima entre 12-31%

Criativos com Conv. Página entre 12% e 31% têm CPMQL médio de **R$ 69**. Abaixo de 3% (R$ 231) e acima de 32% (R$ 209) o CPMQL piora.

**Implicação prática:** Se a landing page está convertendo demais (>32%), pode estar com qualificação fraca — CTA ou copy muito genéricos. Se está convertendo pouco (<3%), a mensagem do criativo não está alinhada com a página.

### 5. Descoberta surpreendente: os 3 maiores criativos em volume têm CPMQL ótimo

CR-2 (88k investidos, 1613 MQLs, R$55), CR-248 (52k, 989 MQLs, R$53) e CR-324 (22k, 342 MQLs, R$66) — todos com **taxa MQL acima de 99%** e CTR entre 1.8% e 2.3%. Esses criativos já provaram escala com qualidade. São o benchmark a replicar.

---

## Critério de Teste Sugerido para Novos Criativos

Para decidir se um criativo vale escalar, monitorar nesta ordem:

1. **Taxa de MQL (% MQL):** meta ≥ 30% após primeiros 20 leads
2. **CTR:** manter entre 1.5% – 2.5% (sinal de seletividade)
3. **Conv. Página:** buscar zona 12% – 31%
4. **Video Hook e CPM:** usar apenas para diagnóstico criativo, não como critério de qualidade de lead

---

*Estudo gerado em 2026-04-30. Base: 29 criativos, 6.709 registros Meta Ads, dados históricos completos.*
