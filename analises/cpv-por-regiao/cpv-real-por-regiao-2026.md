# CPV, ROAS e ROAS CAIXA por Região — Investimento Real da Meta

_Gerado em: 2026-06-18 21:06:31_

## Regras da conta

- Apenas vendas oriundas de tráfego pago.
- Estado normalizado pelo campo `estado_uf`; quando ausente, inferido pelo DDD do telefone.
- Investimento por região lido de `investimento-por-regiao-meta.csv`.
- **CPV** = investimento real da região / vendas da região
- **ROAS** = faturamento da região / investimento real da região
- **ROAS CAIXA** = entrada (valor pago) da região / investimento real da região

## Resumo geral

- **Investimento total:** R$ 356.404,33
- **Vendas de tráfego:** 39
- **Faturamento total:** R$ 1.257.000,34
- **Entrada total (caixa):** R$ 805.000,04
- **CPV médio geral:** R$ 9.138,57
- **ROAS geral:** 3.53
- **ROAS CAIXA geral:** 2.26

## Resultado por região

| Região | Vendas | % Vendas | Faturamento | Entrada (Caixa) | Investimento | CPV | ROAS | ROAS CAIXA |
|--------|-------:|---------:|------------:|----------------:|-------------:|----:|-----:|-----------:|
| Sudeste | 17 | 43.6% | R$ 564.333,54 | R$ 321.833,36 | R$ 200.287,23 | R$ 11.781,60 | 2.82 | 1.61 |
| Sul | 12 | 30.8% | R$ 397.333,40 | R$ 267.833,34 | R$ 63.241,46 | R$ 5.270,12 | 6.28 | 4.24 |
| Nordeste | 3 | 7.7% | R$ 95.333,40 | R$ 20.333,34 | R$ 46.702,50 | R$ 15.567,50 | 2.04 | 0.44 |
| Centro-Oeste | 5 | 12.8% | R$ 147.500,00 | R$ 147.500,00 | R$ 33.232,90 | R$ 6.646,58 | 4.44 | 4.44 |
| Norte | 1 | 2.6% | R$ 15.000,00 | R$ 10.000,00 | R$ 12.940,24 | R$ 12.940,24 | 1.16 | 0.77 |
| Exterior | 1 | 2.6% | R$ 37.500,00 | R$ 37.500,00 | R$ 0,00 | R$ 0,00 | — | — |

## Observações

> O investimento por região deve vir do breakdown `region` da Meta Ads API. Quando o backfill da Meta gerar `investimento-por-regiao-meta.csv`, basta substituir o arquivo e rodar este script novamente. Até lá, o mock serve apenas para validar o cruzamento de dados.

> **Nota metodológica:** o investimento da Meta é por localização de exibição do anúncio, não necessariamente pelo endereço do comprador. Use como aproximação regional.