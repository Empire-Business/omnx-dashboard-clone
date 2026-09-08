# Estudo de CPV por Região / Estado do Brasil

_Gerado em: 2026-06-18 15:23:57_

## Resumo executivo

- **Período analisado:** nov/2025 a mai/2026 (cohort do painel de tráfego)
- **Investimento total de tráfego (comparativo cohort):** R$ 186.082,45
- **Vendas totais no comparativo cohort:** 16
- **Vendas de tráfego identificadas no CSV de comprantes:** 39
- **Faturamento total (tráfego, CSV):** R$ 483.896,80
- **CPV médio geral (comparativo):** R$ 11.630,15
- **ROAS geral (comparativo):** 2.60

## Recorte de tráfego pago

Fontes consideradas como tráfego pago Meta (critério hardcoded): `iads-11, iads-18, iads-25, iads-28, iads-32, iads-7, iorg-1, iorg-3, iorg-4, iorg-43, iorg-9`.

- Compradores no arquivo: **44**
- Compradores de tráfego pago: **39** (88.6%)
- MQLs no arquivo: **1296**
- MQLs de tráfego pago: **1135** (87.6%)
- Vendas nas campanhas do cohort (9/12/32): **29** → faturamento R$ 1.000.500,20
- Vendas em outras campanhas de tráfego: **10** → faturamento R$ 256.500,14

## ⚠️ Limitações e discrepâncias de dados

> **Atenção:** há uma diferença importante entre as bases de dados:

- O comparativo de campanhas (`Guzela/comparativo-campanhas-cohort.csv`) reporta **16 vendas** para o período.
- O CSV de comprantes (`exports/comprantes-2026.csv`) contém **39 vendas de tráfego pago** no mesmo período, sendo **29** nas campanhas 9/12/32 e **10** em outras campanhas de tráfego.

Isso pode ocorrer por:
1. Diferença na classificação de `utm_sources` entre a tabela do Supabase e o critério usado aqui.
2. O comparativo considera apenas as campanhas 9, 12 e 32; outras campanhas pagas (17, 21, 27, 30) podem ter investimento não capturado.
3. Atraso na atualização de `data_pagamento_entrada` ou diferença de critério entre a exportação do CSV e o script do comparativo.

Para contornar isso, apliquei um **fator de correção uniforme de 2.44x** (39/16) sobre o CPV estimado. Essa correção assume que a distribuição geográfica das vendas não contadas no comparativo é igual às vendas contadas — o que pode não ser verdade.

## Metodologia de alocação

> **Importante:** o Meta Ads não nos entrega investimento por estado. O CPV por estado abaixo é uma estimativa obtida alocando o investimento total por diferentes proxies. Os métodos produzem resultados diferentes e devem ser interpretados em conjunto.

### Métodos utilizados

1. **Proporcional às vendas:** cada estado 'paga' de acordo com quantas vendas gerou. Neste método, o CPV é igual em todos os estados (CPV médio não ajustado).
2. **Proporcional ao faturamento:** cada estado 'paga' de acordo com a receita que gerou. Estados com ticket médio mais alto ficam com CPV maior.
3. **Proporcional aos MQLs:** inferimos o estado dos MQLs pelo DDD do telefone e alocamos o investimento proporcionalmente. CPV = investimento alocado / vendas do estado. Estados com melhor conversão MQL→venda aparecem com CPV menor.

### Leitura das colunas de CPV

- **CPV (método):** estimativa bruta usando o investimento do comparativo dividido pelas vendas do estado.
- **CPV ajustado (método):** CPV bruto multiplicado pelo fator de correção (2.44x) para refletir o CPV médio real do comparativo.

## Resultado por estado

| UF | Região | Vendas | MQLs | Faturamento | Ticket Médio | % Vendas | % Fat | CPV (vendas) | CPV ajust. | CPV (fat) | CPV ajust. | CPV (MQLs) | CPV ajust. |
|----|--------|-------:|-----:|------------:|-------------:|---------:|------:|-------------:|-----------:|----------:|-----------:|-----------:|-----------:|
| MG | Sudeste | 7 | 97 | R$ 296.666,80 | R$ 42.380,97 | 17.9% | 23.6% | R$ 4.771,34 | R$ 11.630,15 | R$ 6.273,95 | R$ 15.292,75 | R$ 2.708,58 | R$ 6.602,17 |
| SC | Sul | 7 | 75 | R$ 214.000,00 | R$ 30.571,43 | 17.9% | 17.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.525,70 | R$ 11.031,39 | R$ 2.094,27 | R$ 5.104,77 |
| SP | Sudeste | 5 | 433 | R$ 146.000,00 | R$ 29.200,00 | 12.8% | 11.6% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.322,68 | R$ 10.536,53 | R$ 16.927,25 | R$ 41.260,17 |
| MT | Centro-Oeste | 4 | 19 | R$ 110.000,00 | R$ 27.500,00 | 10.3% | 8.8% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.071,02 | R$ 9.923,10 | R$ 928,46 | R$ 2.263,12 |
| RS | Sul | 3 | 53 | R$ 95.833,40 | R$ 31.944,47 | 7.7% | 7.6% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.728,96 | R$ 11.526,84 | R$ 3.453,21 | R$ 8.417,20 |
| PR | Sul | 2 | 76 | R$ 87.500,00 | R$ 43.750,00 | 5.1% | 7.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 6.476,61 | R$ 15.786,75 | R$ 7.427,66 | R$ 18.104,92 |
| RJ | Sudeste | 3 | 101 | R$ 61.666,74 | R$ 20.555,58 | 7.7% | 4.9% | R$ 4.771,34 | R$ 11.630,15 | R$ 3.042,98 | R$ 7.417,27 | R$ 6.580,65 | R$ 16.040,33 |
| ES | Sudeste | 2 | 18 | R$ 60.000,00 | R$ 30.000,00 | 5.1% | 4.8% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.441,11 | R$ 10.825,20 | R$ 1.759,18 | R$ 4.288,01 |
| MA | Nordeste | 1 | 10 | R$ 50.000,00 | R$ 50.000,00 | 2.6% | 4.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 7.401,85 | R$ 18.042,00 | R$ 1.954,65 | R$ 4.764,45 |
| GO | Centro-Oeste | 1 | 32 | R$ 37.500,00 | R$ 37.500,00 | 2.6% | 3.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 5.551,38 | R$ 13.531,50 | R$ 6.254,87 | R$ 15.246,25 |
| PT | Exterior | 1 | 0 | R$ 37.500,00 | R$ 37.500,00 | 2.6% | 3.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 5.551,38 | R$ 13.531,50 | — | — |
| PB | Nordeste | 1 | 5 | R$ 33.333,40 | R$ 33.333,40 | 2.6% | 2.7% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.934,57 | R$ 12.028,02 | R$ 977,32 | R$ 2.382,23 |
| TO | Norte | 1 | 5 | R$ 15.000,00 | R$ 15.000,00 | 2.6% | 1.2% | R$ 4.771,34 | R$ 11.630,15 | R$ 2.220,55 | R$ 5.412,60 | R$ 977,32 | R$ 2.382,23 |
| BA | Nordeste | 1 | 28 | R$ 12.000,00 | R$ 12.000,00 | 2.6% | 1.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 1.776,44 | R$ 4.330,08 | R$ 5.473,01 | R$ 13.340,47 |

## Resultado por região

| Região | Vendas | MQLs | Faturamento | Ticket Médio | % Vendas | % Fat | CPV (vendas) | CPV ajust. | CPV (fat) | CPV ajust. | CPV (MQLs) | CPV ajust. |
|--------|-------:|-----:|------------:|-------------:|---------:|------:|-------------:|-----------:|----------:|-----------:|-----------:|-----------:|
| Sudeste | 17 | 649 | R$ 564.333,54 | R$ 33.196,09 | 43.6% | 44.9% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.914,25 | R$ 11.978,48 | R$ 6.475,82 | R$ 15.784,80 |
| Sul | 12 | 204 | R$ 397.333,40 | R$ 33.111,12 | 30.8% | 31.6% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.901,67 | R$ 11.947,81 | R$ 2.883,68 | R$ 7.028,98 |
| Centro-Oeste | 5 | 94 | R$ 147.500,00 | R$ 29.500,00 | 12.8% | 11.7% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.367,09 | R$ 10.644,78 | R$ 3.189,02 | R$ 7.773,23 |
| Nordeste | 3 | 115 | R$ 95.333,40 | R$ 31.777,80 | 7.7% | 7.6% | R$ 4.771,34 | R$ 11.630,15 | R$ 4.704,29 | R$ 11.466,70 | R$ 6.502,43 | R$ 15.849,66 |
| Exterior | 1 | 0 | R$ 37.500,00 | R$ 37.500,00 | 2.6% | 3.0% | R$ 4.771,34 | R$ 11.630,15 | R$ 5.551,38 | R$ 13.531,50 | — | — |
| Norte | 1 | 35 | R$ 15.000,00 | R$ 15.000,00 | 2.6% | 1.2% | R$ 4.771,34 | R$ 11.630,15 | R$ 2.220,55 | R$ 5.412,60 | R$ 5.937,00 | R$ 14.471,43 |

## Insights e cuidados

- O **Sudeste** concentra a maior parte das vendas e do faturamento, o que é esperado pelo tamanho do mercado e pela concentração de investimento em anúncios nessa região.
- Estados com poucas vendas (1–2) têm CPV muito volátil — uma única venda a mais ou a menos muda completamente o número.
- O método **proporcional ao faturamento** pode ser útil quando queremos entender quanto cada região 'custa' em relação ao valor que gera.
- O método **proporcional aos MQLs** depende da qualidade da inferência por DDD. Alguns MQLs podem ter telefone incorreto ou DDD não mapeado.
- O **CPV ajustado** é uma aproximação. O valor real só pode ser obtido com o investimento por estado diretamente da Meta Ads API.

## Próximos passos recomendados

1. **Alinhar as bases:** verificar por que o comparativo cohort reporta 16 vendas enquanto o CSV tem 39 vendas de tráfego.
2. **Validar na tabela `utm_sources`** quais sources realmente são tráfego pago.
3. **Extrair do Meta Ads API** os insights com breakdown por região para obter investimento real por estado.
4. **Cruzar campanha/criativo** com estado da venda para identificar criativos que performam melhor em cada região.

---

Arquivos gerados: `cpv-por-regiao-2026.csv` e `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/analises/cpv-por-regiao/cpv-por-regiao-agregado-2026.csv`.