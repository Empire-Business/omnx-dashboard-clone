# Análise de Conversas e IA — Relatório Completo

**Data da análise:** 01 de abril de 2026  
**Período dos dados:** Março 2024 a Abril 2026  
**Analista:** Análise Automatizada de Dados GHL

---

## Sumário Executivo

### Visão Geral dos Dados

| Métrica | Valor |
|---------|-------|
| Total de comunicações | 88.752 |
| Total de oportunidades | 6.293 |
| Total de contatos | 8.278 |
| Contatos MQL (com tag) | 4.313 |
| Oportunidades fechadas ganha | 104 |
| Comunicações com `ai_summary` populado | **0** |
| Comunicações com `ai_transcript` populado | **0** |
| Oportunidades com `resumo_ia` populado | **1.383** |

### Principais Descobertas

1. **Os campos `ai_summary` e `ai_transcript` na tabela `comunicacoes` NÃO estão populados.** São 100% nulos. A análise de IA deve ser feita através do campo `resumo_ia` na tabela `oportunidades`, que possui 1.383 registros preenchidos.

2. **Tráfego e crescimento são as dores universais** — 99,2% mencionam problemas com faturamento/vendas, 73,9% reclamam de falta de tempo, 71,5% querem escalar/crescer.

3. **A objeção mais frequente é "preciso de mais informações"** (24,3%), seguida por "budget/restrições financeiras" (4,3%).

4. **Sinais de compra mais comuns:** "agendar reunião" (98,8%) e "indicação/referral" (59,2%).

5. **Pouquíssimas objeções diretas de preço** aparecem nas conversas — apenas 0,5% mencionam explicitamente que "é caro demais".

6. **WhatsApp é o canal dominante** com 34.644 mensagens, superando email (26.284) e SMS (10.676).

---

## 1. Análise de AI Summary

### 1.1 Status dos Campos de IA

```
AVISO: Os campos ai_summary e ai_transcript estão 100% nulos na tabela comunicacoes.
A análise de IA é feita através do campo resumo_ia na tabela oportunidades.
```

### 1.2 Distribuição do resumo_ia por Pipeline

| Pipeline | Total | Com resumo_ia | Fechados Ganha | Taxa Conversão |
|---------|-------|---------------|----------------|----------------|
| Pré-Vendas nMQL | 3.007 | 922 (30,7%) | 0 | 0% |
| Pré-Vendas MQL | 914 | 263 (28,8%) | 1 | 0,1% |
| Vendas SQL | 589 | 142 (24,1%) | **101** | **17,1%** |
| [fn] webinário | 751 | 17 (2,3%) | 0 | 0% |
| Recuperação | 528 | 1 (0,2%) | 1 | 0,2% |
| Social Selling | 278 | 35 (12,6%) | 1 | 0,4% |
| Cami | 38 | 3 (7,9%) | 0 | 0% |

**Insight:** O pipeline de Vendas SQL tem a maior taxa de conversão (17,1%) e representa quase todos os fechamentos. Isso sugere que leads qualificados para venda direta convertem muito melhor.

---

## 2. Análise de Temas e Palavras-Chave

### 2.1 Frequência de Temas nas Conversas

Baseado em 1.383 resumos de IA analisados:

| Tema | Ocorrências | % do Total |
|------|-------------|------------|
| **Preço/Valor** | 1.376 | 99,5% |
| **Dor: Faturamento/Vendas** | 1.372 | 99,2% |
| **Dor: Falta de Tempo** | 1.037 | 75,0% |
| **Produto/Curso/Serviço** | 1.017 | 73,5% |
| **Tráfego Pago** | 952 | 68,8% |
| **Urgência** | 779 | 56,3% |
| **Mudança/Transformação** | 741 | 53,6% |
| **Objeção: Informação** | 442 | 32,0% |
| **Sinal de Interesse** | 406 | 29,4% |
| **Dor: Presença Digital** | 353 | 25,5% |
| **Dor: Falta de Leads** | 304 | 22,0% |
| **Objeção: Concorrência** | 41 | 3,0% |
| **Objeção: Tempo** | 33 | 2,4% |
| **Solução Atual (já tem)** | 31 | 2,2% |
| **Decision Maker** | 29 | 2,1% |
| **Precisa Resolver** | 27 | 2,0% |
| **Objeção: Preço** | 7 | 0,5% |

### 2.2 Comparação: MQL vs Fechados Ganha

| Tema | MQL (%) | Fechados (%) | Diferença |
|------|---------|--------------|-----------|
| Dor: Falta de Tempo | 75% | 57% | -18 pp |
| Dor: Falta de Leads | 22% | 43% | **+21 pp** |
| Urgência | 56% | 67% | +11 pp |
| Dor: Presença Digital | 26% | 38% | +12 pp |
| Objeção: Informação | 30% | 10% | -20 pp |
| Sinal de Interesse | 28% | 14% | -14 pp |

**Insights:**
- Leads que **fecham mencionam mais dor de falta de leads** (+21pp) — são mais conscientes do problema de aquisição
- Fechados mostram **mais urgência** (+11pp) — estão mais motivados a agir
- MQLs ainda precisam de **mais informação** (-20pp) — estão em fase de qualificação

---

## 3. Tipologia de Objeções

### 3.1 Taxonomy de Objeções

| Categoria | Objeção Específica | Ocorrências | % |
|----------|-------------------|-------------|---|
| **Informação** | Precisa de mais detalhes | 336 | 24,3% |
| **Budget** | Não tem dinheiro/restrição | 59 | 4,3% |
| **Concorrência** | Já tem outra solução | 36 | 2,6% |
| **Concorrência** | Está comparando | 5 | 0,4% |
| **Autoridade** | Precisa falar com jefe/sócio | 4 | 0,3% |
| **Preço** | Pediu desconto | 3 | 0,2% |
| **Preço** | "É caro demais" | 0 | 0,0% |
| **Timing** | "Preciso pensar" | 0 | 0,0% |
| **Timing** | "Não é agora" | 0 | 0,0% |

### 3.2 Análise de Objeções nas Mensagens

| Palavra-Chave | Ocorrências | Observação |
|---------------|-------------|------------|
| "depois" | 8.972 | Na maioria são mensagens de follow-up/adiamento, não objeção |
| "outro" | 6.639 | Geralmente refere-se a "outro post", "outro conteúdo" |
| "não tenho" | 79 | Potencial objeção de budget |
| "já tenho" | 9 | Objeção de concorrência |
| "vou ver" | 25 | Possível objeção de timing |
| "muito caro" | 1 | Objeção direta de preço raríssima |

**Insight Crítico:** A objeção direta de preço **"é caro demais"** é quase inexistente nas conversas (apenas 1 menção em 88k mensagens). Isso sugere que:
1. O preço não é o principal blocker
2. As objeções estão sendo resolvidas antes de chegarem ao campo
3. O público é de alto ticket e já está habituado a investir

---

## 4. Inventário de Pain Points

### 4.1 Dor Points Identificados

| Dor | Ocorrências | % | Severidade |
|-----|-------------|---|------------|
| **Falta de Tempo** | 1.022 | 73,9% | 🔴 Alta |
| **Escalar/Crescer** | 989 | 71,5% | 🔴 Alta |
| **Presença Digital Fraca** | 152 | 11,0% | 🟡 Média |
| **Falta de Leads** | 19 | 1,4% | 🟢 Baixa (no texto) |
| **Vendas Baixas** | 16 | 1,2% | 🟢 Baixa (no texto) |
| **Tráfego/Audiência Baixa** | 10 | 0,7% | 🟢 Baixa (no texto) |
| **Concorrência** | 8 | 0,6% | 🟢 Baixa |

**Observação:** Os percentages baixos em algumas dores no resumo_ia não significam que não são importantes — significa que o resumo estruturado foca em certos campos. As mensagens brutas mostram outras tendências.

### 4.2 Dor Points nas Mensagens Brutas

Nas mensagens brutas (`mensagem_body`), foram identificados padrões diferentes:

- **Interesse em compra:** 10.628 mensagens (12,0%)
- **Perguntas sobre preço:** 10.579 mensagens (11,9%)
- **Dúvidas/Questões:** 8.644 mensagens (9,7%)
- **Agendamento:** 6.731 mensagens (7,6%)
- **Urgência:** 70 mensagens (0,1%)

---

## 5. Sinais de Compra

### 5.1 Sinais Positivos Identificados

| Sinal | Ocorrências | % |
|-------|-------------|---|
| **Agendar Reunião** | 1.366 | 98,8% |
| **Indicação/Referral** | 819 | 59,2% |
| **Urgência/Resolução** | 170 | 12,3% |
| **Compromisso/Confirmação** | 30 | 2,2% |
| **Pergunta sobre pagamento** | 2 | 0,1% |

### 5.2 Análise de Mensagens de Leads que Fecharam

De 861 mensagens de entrada (inbound) de contatos que fecharam:

| Padrão | Ocorrências | % |
|--------|-------------|---|
| **Confirmação (sim, ok, perfeito)** | 156 | 18,1% |
| **Pergunta sobre pagamento** | 52 | 6,0% |
| **Urgência** | 34 | 3,9% |
| **Agendamento** | 32 | 3,7% |
| **Contrato/Assinatura** | 23 | 2,7% |
| **Começar/Iniciar** | 6 | 0,7% |

**Amostras de mensagens de leads que fecharam:**

```
Bruno Barcellos: "Sim"
Bruno Barcellos: "Perfeito"
Bruno Barcellos: "quando poder falar"
Antonio Carneiro: "Sim"
Antonio Carneiro: "beleza"
Antonio Carneiro: "Pode"
Petrônio Medeiros Filho: "Olá Larissa, posso sim"
Thiago Bonfim: "Pode tocar essa parte contratual direto com a Raisa!"
```

**Insight:** Leads que fecham usam linguagem direta e confirmadora. Não há enrolação.

---

## 6. Análise de Mensagens de Comunicação

### 6.1 Distribuição por Canal

| Canal | Volume | % |
|-------|--------|---|
| WhatsApp | 34.644 | 39,0% |
| Email | 26.284 | 29,6% |
| SMS | 10.676 | 12,0% |
| Ligação (call) | 16.114 | 18,1% |
| Mensagem (webchat) | 1.033 | 1,2% |

### 6.2 Distribuição por Direção

| Direção | Volume | % |
|---------|--------|---|
| Outbound | 50.110 | 56,4% |
| Unknown | 26.284 | 29,6% |
| Inbound | 12.358 | 13,9% |

### 6.3 Distribuição por SDR

| SDR | Mensagens |
|-----|-----------|
| Fernanda Torres | 29.294 |
| Lucas Leonardo | 27.997 |
| Bruno Andrease | 24.875 |
| Felipe Mazzola | 318 |
| Antonio Gabriel | 14 |
| Larissa Theophilo | 2 |

### 6.4 Fonte das Comunicações

| Fonte | Volume | % |
|-------|--------|---|
| Workflow | 40.097 | 45,2% |
| App | 29.346 | 33,1% |
| API | 10.486 | 11,8% |

---

## 7. Perfis de Clientes por Segmento

### 7.1 Tipos de Negócio Mencionados

| Segmento | Ocorrências | % |
|----------|-------------|---|
| Marketing/Tráfego | 1.377 | 99,6% |
| Serviços | 792 | 57,3% |
| Infoproduto | 226 | 16,3% |
| Educação | 171 | 12,4% |
| Construção/Civil | 62 | 4,5% |
| Alimentação | 51 | 3,7% |
| Saúde | 32 | 2,3% |
| E-commerce | 31 | 2,2% |
| Tecnologia | 27 | 2,0% |

### 7.2 Nível de Investimento Mencionado

| Nível | Ocorrências | % |
|-------|-------------|---|
| Sem investimento | 388 | 28,1% |
| Baixo (< R$ 3 mil) | 338 | 24,4% |
| Médio (R$ 3-10 mil) | 29 | 2,1% |
| Alto (> R$ 10 mil) | 37 | 2,7% |
| Indefinido | 16 | 1,2% |

### 7.3 Nível de Faturamento Mencionado

| Faturamento | Ocorrências | % |
|-------------|-------------|---|
| R$ 120-300 mil | 843 | 61,0% |
| Até R$ 120 mil | 563 | 40,7% |
| R$ 300-700 mil | 208 | 15,0% |
| R$ 700 mil - 1 mi | 152 | 11,0% |
| Acima de R$ 1 mi | 42 | 3,0% |

---

## 8. Análise de Mensagens de Alto Intento

### 8.1 Volume de Mensagens com Alto Intento

- Total de mensagens de entrada: 12.358
- Mensagens com intenção de compra: 10.628 (12,0%)
- Mensagens perguntando sobre preço: 10.579 (11,9%)
- Mensagens com urgência: 70 (0,1%)

### 8.2 Exemplos de Mensagens com Alto Intento

**Mensagem 1 - Interesse direto:**
```
"Sim, mas não respondeu minha pergunta se é venda de algum produto, 
pois não irei comprar nenhum serviço no momento"
```

**Mensagem 2 - Solicitação de reunião:**
```
"bom dia, para mim melhor as 16:00 (horário de Mato Grosso), pode ser?"
```

**Mensagem 3 - Negociação:**
```
"Vc consegue chegar em 37500 divido em 10 x ao menos ?"
"Vc está disposta a negociar sua proposta? preciso adequa-la ao budget 
já que não estava previsto esse projeto."
```

**Mensagem 4 - Solicitação de material:**
```
"Me manda o material pf"
```

---

## 9. Recomendações para Tratamento de Objeções

### 9.1 Objeção: "Preciso de mais informações"

**Frequência:** 24,3% (336 casos)

**Estratégia recomendada:**
1. Enviar automaticamente case de sucesso relevant ao segmento
2. Oferecer diagnóstico gratuito de 15 minutos
3. Fornecer calculadora de ROI
4. Criar sequência de emails com conteúdo educativo

### 9.2 Objeção: "Não tenho budget"

**Frequência:** 4,3% (59 casos)

**Estratégia recomendada:**
1. Apresentar opções de parcelamento
2. Mostrar custo da inação (quanto está perdendo por não agir)
3. Oferecer entrada menores com piloto
4. Destacar garantia de resultado

### 9.3 Objeção: "Já tenho outra solução"

**Frequência:** 2,6% (36 casos)

**Estratégia recomendada:**
1. Descobrir o que já tem e o que não está funcionando
2. Posicionar como complemento, não concorrente
3. Mostrar diferencial de resultado vs. solução atual
4. Oferecer trial de 7 dias

### 9.4 Objeção: "Preciso falar com meu chefe/sócio"

**Frequência:** 0,3% (4 casos)

**Estratégia recomendada:**
1. Oferecer materiais para apresentar ao decisor
2. Propor uma segunda reunião com o decisor
3. Enviar gravação/demonstração para consumo assíncrono
4. Criar sense of urgency com deadline de oferta

---

## 10. Recomendações de Ação

### 10.1 Para SDRs

1. **Foco em dor de leads:** Leads que fecham mencionam +21pp mais dor de falta de leads. Pergunte: "Você tem Leads suficientes hoje?"

2. **Crie urgência legítima:** Fechados mostram +11pp mais urgência. Use dados de mercado e prazos reais.

3. **Reduce information requests:** MQLs precisam de -20pp menos informação. Qualifique mais na primeira chamada.

### 10.2 Para Copy/Marketing

1. **Endereçar falta de tempo:** 73,9% mencionam tempo como barreira. Posicione a solução como "faça em 20 minutos/dia".

2. **Foco em crescimento/escala:** 71,5% querem escalar. Mostre casos de crescimento real.

3. **Use urgência sem ser manipulativo:** 56,3% respondem a urgência. Janelas de oportunidade reais funcionam.

### 10.3 Para Fechamento

1. **Confirmação rápida é bom sinal:** 18,1% dos fechados confirmam direto. Reconheça e avance.

2. **Negociação é bom sinal:** Quem negocia quer comprar. Esteja preparado para ceder em troca de fechamento.

3. **Follow-up curto funciona:** Mensagens curtas ("Sim", "Perfeito") indicam alto interesse.

---

## 11. Limitações da Análise

1. **Campos AI não populados:** `ai_summary` e `ai_transcript` estão 100% nulos na tabela `comunicacoes`. Análise baseada apenas em `resumo_ia` de oportunidades.

2. **Resumo_ia é gerado por IA:** Pode conter vieses ou informações padronizadas. Considere validar com conversas reais.

3. **Contexto perdido:** Análise de palavras-chave não captura tom, sarcasmo, ou contexto situacional.

4. **Dados desbalanceados:** 104 fechamentos vs 6.293 oportunidades = 1,7% de taxa. Amostra pequena para conclusões estatísticas robustas.

---

## 12. Próximos Passos Recomendados

1. [ ] **Popular campos ai_summary/ai_transcript** na tabela comunicacoes via integração com provedor de IA
2. [ ] **Criar dashboard de sinais de compra** em tempo real baseado nos padrões identificados
3. [ ] **Implementar scoring de lead** baseado nos sinais de interesse e dor
4. [ ] **Treinar equipe** nos handling de objeções identificadas
5. [ ] **A/B testar mensagens** de follow-up baseadas nos insights de urgência

---

*Relatório gerado automaticamente em 01/04/2026 às 00:30 BRT*  
*Fonte: raw_comunicacoes.json, raw_oportunidades.json, raw_contatos.json*  
*Total de registros analisados: 88.752 comunicações + 6.293 oportunidades + 8.278 contatos*