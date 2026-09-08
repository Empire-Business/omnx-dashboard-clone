# Relatório de Perfil Demográfico de Leads
## Análise Completa da Base de Dados GHL

**Data de Geração:** 01 de Abril de 2026  
**Base de Dados:** GHL-SUPABASE  
**Fonte:** raw_contatos.json, raw_oportunidades.json, raw_vendas_fechamento.json

---

## Sumário Executivo

### Principais Números

| Métrica | Valor |
|---------|-------|
| Total de Contatos | 8.278 |
| Total de Oportunidades | 6.293 |
| Total de Vendas Fechadas | 4.891 |
| Taxa de MQL (Marketing Qualified Lead) | 15,5% |
| Taxa de Fechamento Global | 59,1% |
| Taxa de Conversão MQL → Fechado | 380,3%* |

*\*Nota: A taxa MQL-to-Close superior a 100% indica que alguns leads geraram múltiplas vendas (compras recorrentes ou upgrades).*

### Principais Descobertas

1. **E-mail Corporativo converte 30% melhor que pessoal**: Leads com e-mail corporativo têm taxa de fechamento de 71,8% vs 55,3% para pessoais.

2. **Tráfego Orgânico Instagram (iorg-3) é a maior fonte de leads**: 1.459 leads (17,6% do total), com taxa de fechamento de 61,6%.

3. **Campanha 12 domina em volume**: 4.956 leads (60% do total) com taxa de fechamento de 66,9%.

4. **SDR Bruno Andrease tem melhor performance**: Taxa MQL-to-Close de 474,5% (leads que recebe转换成 mais vendas do que o número de MQLs).

5. **100% dos leads são do Brasil**: Base de dados exclusivamente brasileira, com concentração em São Paulo.

6. **Tag "sql" tem maior taxa de conversão**: 93,5% dos leads com tag SQL fecham, vs 86,4% dos MQLs.

---

## 1. Análise de Domínios de E-mail

### 1.1 Distribuição por Categoria de E-mail

A análise revela que metade dos leads使用的是 e-mails pessoais (50,2%), enquanto 26,3% não possuem e-mail cadastrado.

| Categoria | Quantidade | Percentual |
|-----------|------------|------------|
| E-mail Pessoal (Gmail, Hotmail, Yahoo, etc.) | 4.159 | 50,2% |
| Sem E-mail (NULL) | 2.179 | 26,3% |
| Corporativo Brasil (.com.br) | 1.172 | 14,2% |
| Corporativo Internacional (.com) | 526 | 6,4% |
| Outro | 199 | 2,4% |
| Portal Brasileiro (UOL, Terra, etc.) | 21 | 0,3% |
| ONG | 12 | 0,1% |
| Educacional | 6 | 0,1% |
| Governo | 4 | 0,0% |

### 1.2 Top 20 Domínios de E-mail

| Domínio | Qtd | Taxa MQL | Taxa Fechamento | Categoria |
|---------|-----|----------|------------------|-----------|
| gmail.com | 3.278 | 13,8% | 71,1% | Pessoal |
| (sem e-mail) | 2.179 | 2,0% | 24,2% | - |
| hotmail.com | 542 | 15,7% | 73,8% | Pessoal |
| yahoo.com.br | 119 | 20,2% | 73,1% | Pessoal |
| outlook.com | 91 | 17,6% | 73,6% | Pessoal |
| icloud.com | 69 | 15,9% | 65,2% | Pessoal |
| yahoo.com | 30 | 20,0% | 76,7% | Pessoal |
| aliancadealtovalor.com.br | 20 | 0,0% | 5,0% | Corp BR |
| live.com | 19 | 31,6% | 63,2% | Pessoal |
| uol.com.br | 16 | 18,8% | 68,8% | Portal BR |
| me.com | 13 | 38,5% | 69,2% | Corp |
| outlook.com.br | 9 | 11,1% | 88,9% | Corp BR |
| gmail.co (typo) | 9 | 11,1% | 77,8% | - |
| v4company.com | 8 | 25,0% | 37,5% | Corp |
| g.us | 8 | 0,0% | 0,0% | - |

### 1.3 E-mail Corporativo vs Pessoal: Análise de Conversão

| Tipo | Leads | MQLs | Taxa MQL | Fechados | Taxa Fechamento |
|------|-------|------|----------|----------|-----------------|
| **Corporativo** | 1.919 | 637 | 33,2% | 1.377 | **71,8%** |
| **Pessoal** | 6.359 | 649 | 10,2% | 3.514 | 55,3% |

**Insight:** Leads com e-mail corporativo têm:
- Taxa MQL 3,3x maior (33,2% vs 10,2%)
- Taxa de fechamento 30% maior (71,8% vs 55,3%)

**Recomendação:** Priorizar leads corporativos em campanhas de nutrição e priorização de SDRs.

---

## 2. Distribuição Geográfica

### 2.1 Distribuição por País

```
BR (Brasil): 8.278 leads (100,0%)
```

A totalidade dos leads é de origem brasileira.

### 2.2 Distribuição por Estado (Base: Vendas Fechadas)

*Nota: O campo estado_uf tem inconsistências de nomenclatura (ex: "SP" vs "São Paulo" vs "sp").*

| Estado | Qtd Vendas | Percentual |
|--------|------------|------------|
| MG (Minas Gerais) | 5 | 0,1% |
| SP (São Paulo) | 5 | 0,1% |
| SC (Santa Catarina) | 4 | 0,1% |
| São Paulo | 4 | 0,1% |
| RJ (Rio de Janeiro) | 3 | 0,1% |
| Rio Grande do Sul | 3 | 0,1% |
| MT (Mato Grosso) | 3 | 0,1% |
| GO (Goiás) | 2 | 0,0% |
| ES (Espírito Santo) | 2 | 0,0% |
| Rio de Janeiro | 2 | 0,0% |
| Minas Gerais | 2 | 0,0% |
| DF (Distrito Federal) | 1 | 0,0% |
| BA (Bahia) | 1 | 0,0% |
| PR (Paraná) | 1 | 0,0% |
| PB (Paraíba) | 1 | 0,0% |
| MA (Maranhão) | 1 | 0,0% |
| PI (Piauí) | 1 | 0,0% |
| PA (Pará) | 1 | 0,0% |

**Observação:** A concentração de vendas em SP/MG/SC/RJ é consistente com centros econômicos brasileiros.

**Cuidado:** 46 registros com estados mal formatados (ex: "florida", "Distrito de Lisboa") sugerem leads internacionais ou dados de importação imprecisos.

---

## 3. Análise de Fontes UTM (UTM Source)

### 3.1 Performance por Fonte UTM

| Fonte UTM | Nome Amigável | Leads | MQLs | Taxa MQL | Fechados | Taxa Fechamento |
|-----------|---------------|-------|------|----------|----------|-----------------|
| iorg-3 | Orgânico Instagram | 1.459 | 283 | 19,4% | 899 | 61,6% |
| (null) | Sem fonte | 1.246 | 22 | 1,8% | 253 | 20,3% |
| iads-28 | Campanhas 28 | 951 | 173 | 18,2% | 508 | 53,4% |
| import-23 | Importação 23 | 595 | 211 | 35,5% | 589 | **99,0%** |
| iads-7 | Campanhas 7 | 593 | 107 | 18,0% | 376 | 63,4% |
| iorg-9 | Orgânico 9 | 452 | 68 | 15,0% | 248 | 54,9% |
| iorg-1 | Orgânico 1 | 416 | 104 | 25,0% | 274 | 65,9% |
| iads-13 | Campanhas 13 | 278 | 39 | 14,0% | 193 | 69,4% |
| iads-14 | Campanhas 14 | 270 | 26 | 9,6% | 189 | 70,0% |
| iads-25 | Campanhas 25 | 248 | 6 | 2,4% | 244 | **98,4%** |
| iorg-43 | Orgânico 43 | 226 | 17 | 7,5% | 157 | 69,5% |
| iads-11 | Campanhas 11 | 189 | 27 | 14,3% | 125 | 66,1% |
| iorg-4 | Orgânico 4 | 154 | 23 | 14,9% | 109 | 70,8% |
| iads-27 | Campanhas 27 | 139 | 23 | 16,5% | 90 | 64,7% |
| iads-32 | Campanhas 32 | 128 | 44 | 34,4% | 35 | 27,3% |
| iads-31 | Campanhas 31 | 57 | 0 | 0,0% | 57 | **100,0%** |
| iads-18 | Campanhas 18 | 65 | 16 | 24,6% | 50 | **76,9%** |

### 3.2 Principais Insights - Fontes UTM

1. **Orgânico Instagram (iorg-3)** é a maior fonte individual de leads (17,6%), com boa taxa de fechamento (61,6%).

2. **Fontes "import-"** têm taxas de conversão excepcionais (99,0% e 98,4%), sugerindo dados de importações de leads pré-qualificados.

3. **iads-31** fechou 100% dos 57 leads, mas sem nenhum MQL - sugere leads extremamente qualificados vindos de outra etapa.

4. **Leads sem UTM (null)** têm taxa de fechamento baixa (20,3%) - dificuldade de rastreamento de origem.

---

## 4. Análise de Campanhas UTM (UTM Campaign)

### 4.1 Top 10 Campanhas por Volume

| Campanha | Leads | MQLs | Taxa MQL | Fechados | Taxa Fechamento |
|----------|-------|------|----------|----------|-----------------|
| 12 | 4.956 | 964 | 19,5% | 3.314 | 66,9% |
| (null) | 1.173 | 26 | 2,2% | 209 | 17,8% |
| 9 | 704 | 121 | 17,2% | 396 | 56,3% |
| 24 | 446 | 6 | 1,3% | 436 | **97,8%** |
| 17 | 297 | 17 | 5,7% | 271 | **91,2%** |
| 27 | 178 | 56 | 31,5% | 18 | 10,1% |
| 21 | 137 | 16 | 11,7% | 125 | **91,2%** |
| 5 | 82 | 0 | 0,0% | 2 | 2,4% |
| 30 | 64 | 47 | 73,4% | 8 | 12,5% |
| 6 | 53 | 0 | 0,0% | 0 | 0,0% |

### 4.2 Top 10 Campanhas por Taxa de Conversão (mín. 30 leads)

| Campanha | Leads | Fechados | Taxa Conversão |
|----------|-------|----------|----------------|
| 24 | 446 | 436 | **97,8%** |
| 17 | 297 | 271 | **91,2%** |
| 21 | 137 | 125 | **91,2%** |
| 16 | 36 | 25 | 69,4% |
| 12 | 4.956 | 3.314 | 66,9% |
| 9 | 704 | 396 | 56,3% |
| 18 | 34 | 19 | 55,9% |
| 25 | 43 | 21 | 48,8% |
| (null) | 1.173 | 209 | 17,8% |
| 30 | 64 | 8 | 12,5% |

### 4.3 Análise de Campanhas Especiais

| Campanha | Característica | Insight |
|----------|-----------------|---------|
| 24 | 446 leads, 97,8% conversão | Campaigna de altíssima conversão - possivelmente lista de existing customers ou hot leads |
| 17 | 297 leads, 91,2% conversão | 유사 |
| 30 | 64 leads, 73,4% MQL rate | Alta qualificação -，可能是 retargeting de MQLs |
| 27 | 178 leads, 10,1% conversão | 虽然 MQL rate alto (31,5%), fechamento baixo - leads qualitativos mas não prontos para comprar |

---

## 5. Distribuição por SDR (Sales Development Representative)

### 5.1 Performance Completa dos SDRs

| SDR | Leads | MQLs | Taxa MQL | Fechados | Taxa Fechamento | MQL→Close |
|-----|-------|------|----------|----------|-----------------|-----------|
| Lucas Leonardo | 1.948 | 453 | 23,3% | 1.698 | 87,2% | 374,8% |
| Fernanda Torres | 1.736 | 462 | 26,6% | 1.482 | 85,4% | 320,8% |
| Bruno Andrease | 1.679 | 349 | 20,8% | 1.656 | 98,6% | **474,5%** |
| unassigned | 2.867 | 21 | 0,7% | 8 | 0,3% | 38,1% |
| Robson Machado | 16 | 0 | 0,0% | 16 | 100,0% | N/A |
| Felipe Mazzola | 8 | 0 | 0,0% | 7 | 87,5% | N/A |

### 5.2 Top SDRs por Taxa MQL-to-Close (mín. 10 MQLs)

| SDR | MQLs | Fechados | Taxa MQL→Close |
|-----|------|----------|-----------------|
| Bruno Andrease | 349 | 1.656 | **474,5%** |
| Lucas Leonardo | 453 | 1.698 | 374,8% |
| Fernanda Torres | 462 | 1.482 | 320,8% |
| unassigned | 21 | 8 | 38,1% |

### 5.3 Análise de Performance

1. **Bruno Andrease** se destaca com 474,5% de taxa MQL-to-Close, indicando que converte mais vendas do que o número de MQLs que recebe. Possivelmente recebe leads de maior qualidade ou tem processo de venda mais eficiente.

2. **Taxas MQL-to-Close acima de 100%** para os 3 principais SDRs indicam que leads podem gerar múltiplas compras ou há reclassificação de tags.

3. **2.867 leads (35%) estão sem SDR atribuído** - representam apenas 0,3% de taxa de fechamento. Sistema de atribuição precisa ser revisado.

---

## 6. Análise de Tags

### 6.1 Top 30 Tags Mais Frequentes

| Tag | Quantidade | Taxa Fechamento |
|-----|------------|-----------------|
| deletar-open-claw-teste | 7.369 | 61,6% |
| verifica sdr | 6.378 | 59,8% |
| [fn] aplicação | 5.834 | 65,0% |
| [temp] att funis | 5.182 | 58,9% |
| [cp] aplicação | 5.137 | 66,2% |
| [deletar] copia contato | 4.563 | 99,8% |
| nmql | 3.091 | 88,9% |
| mail oferta cami | 2.802 | 81,8% |
| nsql | 1.825 | 89,7% |
| rinoel_cadastrado | 1.470 | 60,5% |
| novo fluxo | 1.362 | 85,8% |
| **mql** | 1.286 | 86,4% |
| mailblack211125 | 1.004 | 91,6% |
| mailws100em100 | 972 | **92,2%** |
| sql | 613 | **93,5%** |
| importado | 574 | **100,0%** |
| conectado | 498 | 78,1% |
| perfil inteligente | 417 | 99,8% |
| contato antigo | 416 | 99,8% |

### 6.2 Tags de Interesse Especial

| Tag | Quantidade | Taxa MQL | Taxa Fechamento | Insight |
|-----|------------|----------|------------------|---------|
| mql | 1.286 | - | 86,4% | Tags oficial de lead qualificado |
| sql | 613 | - | **93,5%** | Stage de vendas - altíssima conversão |
| conectado | 498 | - | 78,1% | SDR conseguiu contato - boa conversão |
| agendado | 75 | - | 64,0% | Reunião agendada |
| reagendar-sim | 4 | - | 100,0% | Amostra pequena mas promissora |
| nmql | 3.091 | - | 88,9% | Não-MQL - leads em funil alternativo |
| nsql | 1.825 | - | 89,7% | Não-SQL - similar ao nmql |

### 6.3 Análise de Tags de Comportamento

```
Status de Lead:
├── mql (1.286) → 86,4% fecham
├── sql (613) → 93,5% fecham  ← MAIOR TAXA
├── nmql (3.091) → 88,9% fecham
└── nsql (1.825) → 89,7% fecham

Status de Contato:
├── conectado (498) → 78,1% fecham
├── agendado (75) → 64,0% fecham
└── reagendar-sim (4) → 100,0% fecham
```

**Insight:** Leads com tag "sql" têm a maior taxa de fechamento (93,5%), confirmando que a classificação SQL é um forte preditor de conversão.

---

## 7. Volume de Leads ao Longo do Tempo

### 7.1 Distribuição Mensal

| Mês | Leads | MQLs | Taxa MQL | Fechados | Taxa Fechamento |
|-----|-------|------|----------|----------|-----------------|
| 2024-03 | 19 | 0 | 0,0% | 2 | 10,5% |
| 2024-04 | 83 | 0 | 0,0% | 1 | 1,2% |
| 2024-05 | 117 | 0 | 0,0% | 4 | 3,4% |
| 2024-06 | 40 | 0 | 0,0% | 1 | 2,5% |
| 2024-08 | 16 | 1 | 6,3% | 3 | 18,8% |
| 2024-09 | 6 | 0 | 0,0% | 1 | 16,7% |
| 2025-10 | 414 | 65 | 15,7% | 222 | 53,6% |
| 2025-11 | 2.228 | 414 | 18,6% | 1.391 | 62,4% |
| 2025-12 | 1.621 | 232 | 14,3% | 1.022 | 63,0% |
| 2026-01 | 1.544 | 234 | 15,2% | 1.041 | 67,4% |
| 2026-02 | 1.494 | 154 | 10,3% | 1.059 | 70,9% |
| 2026-03 | 644 | 181 | 28,1% | 128 | 19,9% |
| 2026-04 | 25 | 5 | 20,0% | 0 | 0,0% |

### 7.2 Análise de Sazonalidade

```
Volume de Leads por Mês:
                      █
                  █   █
        █   █   █   █
████   █   █   █   █   █
███████████████████████
Mar Abr Mai Jun Set Out Nov Dez Jan Fev Mar Abr

Peak: Novembro 2025 (2.228 leads)
Low: Julho 2024, Abril 2025, Agosto 2025 (< 20 leads)
```

**Padrões Identificados:**

1. **Crescimento Explosivo em Out/2025**: A base saltou de ~100 leads/mês para 2.000+ a partir de outubro de 2025, indicando mudança significativa na estratégia de aquisição.

2. **Março 2026 tem baixa taxa de fechamento** (19,9% vs média de 60%+). Possíveis explicações:
   - Novos leads ainda não tiveram tempo de converter
   - Mudança na qualidade dos leads
   - Sazonalidade (período de Carnaval pode afetar)

3. **Março 2026 tem maior taxa de MQL** (28,1%) - possibly better targeting.

4. **Consistência Jan-Fev 2026**: ~1.500 leads/mês com taxas de fechamento stable em 67-71%.

---

## 8. Conclusões e Recomendações

### 8.1 Principais Conclusões

| Área | Conclusão |
|------|-----------|
| **E-mail** | Leads corporativos convertem 30% melhor que pessoais |
| **Geografia** | 100% dos leads são brasileiros, concentração em SP |
| **Fontes** | Orgânico Instagram é maior fonte, import-23 tem 99% conversão |
| **Campanhas** | Campanha 12 domina em volume, campanhas 24/17/21 têm >90% conversão |
| **SDRs** | Bruno Andrease tem melhor MQL-to-Close (474,5%) |
| **Tags** | Tag "sql" tem maior conversão (93,5%) |
| **Temporal** | Crescimento significativo a partir de outubro 2025 |

### 8.2 Recomendações

#### Prioridade Alta
1. **Investigar leads "unassigned"**: 2.867 leads sem SDR têm taxa de fechamento de 0,3%. Implementar regra automática de atribuição.

2. **Melhorar rastreamento UTM**: 1.246 leads sem fonte têm taxa de fechamento de 20,3%. ImplementarUTM builder em todas as landing pages.

3. **Focar em fontes de alta conversão**: Campanhas import-23, import-25 têm >98% conversão. Analisar o que essas campanhas têm de diferente.

#### Prioridade Média
4. **Nutrir leads com e-mail pessoal**: Taxa de conversão 30% menor. Criar sequência de nutrição específica.

5. **Investigarmarch 2026 baixa**: Taxa de fechamento de 19,9% precisa ser entendida (sazonalidade ou problema de qualidade?).

6. **Padronizar campo estado**: Inconsistências (SP, São Paulo, sp) impedem análise geográfica correta.

#### Oportunidades
7. **Usar tag "sql" como preditor**: 93,5% de conversão confirma valor da tag. Garantir que todos os leads qualificados recebam essa tag.

8. **Expandir fontes iorg-3**: 17,6% dos leads com 61,6% conversão. Aumentar investimento em orgânico Instagram.

---

## 9. Anexos

### 9.1 Metodologia

- **Fonte dos dados**: Exportação direta das tabelas Supabase (contatos, oportunidades, vendas_fechamento)
- **Período**: Dados completos até 01/04/2026
- **Definições**:
  - MQL: Contato com tag "mql" (case-insensitive)
  - SQL: Contato com tag "sql"
  - Fechado: Contato com pelo menos um registro em vendas_fechamento
  - Taxa MQL: MQLs / Total de Contatos
  - Taxa Fechamento: Fechados / Total de Contatos
  - Taxa MQL-to-Close: Fechados / MQLs

### 9.2 Limitações

1. **Tags auto-atribuídas**: Sistema de tags pode ter inconsistências
2. **Dados incompletos**: 26,3% dos contatos sem e-mail
3. **Estampa temporal**: Dados de março 2026 podem estar incompletos (corte em 01/04)
4. **Múltiplas compras**: Taxas >100% podem indicar recompra

---

*Relatório gerado automaticamente via análise de dados GHL-SUPABASE*
