# Modelo de Lead Scoring Preditivo

**Versão:** 1.0  
**Data:** 2026-04-01  
**Autoria:** Análise de Dados GHL-Supabase  

---

## 1. Metodologia

### 1.1 Objetivo
Criar um modelo de pontuação preditiva para leads B2B de alto ticket que priorize automaticamente leads com maior probabilidade de conversão, optimizando o tempo da equipa de vendas.

### 1.2 Fonte de Dados
| Dataset | Registos | Descrição |
|---------|----------|-----------|
| raw_contatos.json | 8.278 | Contactos com dados demográficos e firmográficos |
| raw_oportunidades.json | 6.293 | Oportunidades com estágios e datas de pipeline |
| raw_comunicacoes.json | 88.752 | Comunicações (emails, chamadas, mensagens) |
| raw_vendas_fechamento.json | 4.895 | Vendas fechadas com pagamento confirmado |

### 1.3 Definição de "Buyer" (Alvo)
Um lead é considerado **comprador** quando `vendas_fechamento.data_pagamento_entrada` está preenchido — indicando pagamento real, não apenas movimento no pipeline.

### 1.4 Framework de Features

```
SCORE FINAL = 
  ├─ A. FIT DEMOGRÁFICO/FIRMOGRÁFICO (25%)
  │    ├─ A1. Tipo de Email (corporativo vs pessoal)
  │    ├─ A2. Fonte de Tráfego (qualidade)
  │    ├─ A3. Qualidade da Campaign
  │    └─ A4. Pipeline/Etapa Atual
  │
  ├─ B. ENGAJAMENTO COMPORTAMENTAL (35%)
  │    ├─ B1. Total de Comunicações
  │    ├─ B2. Ratio de Mensagens Recebidas (inbound)
  │    ├─ B3. Tempo até 1ª Resposta
  │    ├─ B4. Número de Reuniões Agendadas
  │    ├─ B5. Número de Reuniões Realizadas
  │    ├─ B6. Duração Total de Chamadas
  │    └─ B7. Taxa de Mensagens Lidas
  │
  ├─ C. PROGRESSÃO DE ESTÁGIO (25%)
  │    ├─ C1. Dias até Estar Conectado
  │    ├─ C2. Dias até Agendamento de Reunião
  │    ├─ C3. Dias até Reunião Realizada
  │    ├─ C4. Velocidade de Progressão no Pipeline
  │    └─ C5. Quantidade de Etapas Avançadas
  │
  └─ D. SINAIS EXPLÍCITOS (15%)
       ├─ D1. Presença de Tag MQL
       ├─ D2. Presença de Tag SQL
       ├─ D3. Presença de Tag [fn]
       ├─ D4. SDR Atribuído
       └─ D5. Estágio do Pipeline (Pré-Vendas vs Vendas)
```

---

## 2. Definição Detalhada de Features

### 2.1 A. Fit Demográfico/Firmográfico (Peso: 25%)

#### A1. Tipo de Email (Corporate vs Personal) — **5 pontos máx**
| Categoria | Pontos | Critério |
|----------|--------|----------|
| Corporativo | 5 | Email com domínio de empresa (não gmail, yahoo, hotmail, outlook, etc.) |
| Personalizado | 3 | Domínio menos comum (icloud, live, etc.) |
| Pessoal | 1 | Domínios populares gratuitos |

**Domínios pessoais bloqueados:** gmail.com, yahoo.com, yahoo.com.br, hotmail.com, outlook.com, outlook.com.br, live.com, msn.com,icloud.com, aol.com, terra.com.br, uol.com.br, progmail.com

#### A2. Fonte de Tráfego — **5 pontos máx**
| Fonte | Pontos |
|-------|--------|
| Paid (Google, Facebook, Instagram Ads) | 5 |
| Organic High-Intent (Indicação, Social Selling) | 4 |
| Referral | 3 |
| Direct | 2 |
| Unknown/Null | 1 |

#### A3. Qualidade da Campagem UTM — **5 pontos máx**
Baseado na análise histórica de conversão por `utm_campaign`:
| Categoria | Pontos |
|----------|--------|
| Alta conversão histórica (>5%) | 5 |
| Média-alta (3-5%) | 4 |
| Média (1-3%) | 3 |
| Baixa (<1%) | 2 |
| Desconhecida | 1 |

#### A4. Pipeline/Etapa Atual — **5 pontos máx**
| Pipeline | Pontos |
|----------|--------|
| Vendas SQL ( Closed-Won pipeline) | 5 |
| Pré-Vendas MQL | 4 |
| Pré-Vendas nMQL | 3 |
| Qualificação | 2 |
| Open/Primeiro Contato | 1 |

**Máximo Parcial A:** 25 pontos

---

### 2.2 B. Engajamento Comportamental (Peso: 35%)

#### B1. Total de Comunicações — **7 pontos máx**
| Nº Comunicações | Pontos |
|-----------------|--------|
| 15+ | 7 |
| 10-14 | 6 |
| 7-9 | 5 |
| 4-6 | 4 |
| 2-3 | 3 |
| 1 | 2 |
| 0 | 0 |

#### B2. Ratio de Mensagens Recebidas (Inbound) — **6 pontos máx**
Percentagem de comunicações onde o lead respondeu ou iniciou:
| Ratio Inbound | Pontos |
|---------------|--------|
| 60%+ | 6 |
| 40-59% | 5 |
| 25-39% | 4 |
| 15-24% | 3 |
| 5-14% | 2 |
| 1-4% | 1 |
| 0% | 0 |

#### B3. Tempo até 1ª Resposta — **6 pontos máx**
| Tempo | Pontos |
|-------|--------|
| < 1 hora | 6 |
| 1-4 horas | 5 |
| 4-12 horas | 4 |
| 12-24 horas | 3 |
| 1-3 dias | 2 |
| 3-7 dias | 1 |
| > 7 dias ou sem resposta | 0 |

#### B4. Número de Reuniões Agendadas — **4 pontos máx**
| Reuniões Agendadas | Pontos |
|--------------------|--------|
| 3+ | 4 |
| 2 | 3 |
| 1 | 2 |
| 0 | 0 |

#### B5. Número de Reuniões Realizadas — **6 pontos máx**
| Reuniões Realizadas | Pontos |
|---------------------|--------|
| 3+ | 6 |
| 2 | 5 |
| 1 | 4 |
| 0 (mas agendadas) | 2 |
| 0 (sem agendamento) | 0 |

#### B6. Duração Total de Chamadas — **3 pontos máx**
| Duração Acumulada | Pontos |
|-------------------|--------|
| 30+ minutos | 3 |
| 10-29 minutos | 2 |
| 1-9 minutos | 1 |
| 0 minutos | 0 |

#### B7. Taxa de Mensagens Lidas — **3 pontos máx**
Baseado em mensagens de email com status de leitura:
| Taxa de Leitura | Pontos |
|------------------|--------|
| 80%+ | 3 |
| 50-79% | 2 |
| 1-49% | 1 |
| 0% ou N/A | 0 |

**Máximo Parcial B:** 35 pontos

---

### 2.3 C. Progressão de Estágio (Peso: 25%)

#### C1. Dias até Estar Conectado — **6 pontos máx**
| Dias desde lead | Pontos |
|-----------------|--------|
| 0-2 dias | 6 |
| 3-7 dias | 5 |
| 8-14 dias | 4 |
| 15-30 dias | 3 |
| 31-60 dias | 2 |
| 61-90 dias | 1 |
| > 90 dias ou não conectado | 0 |

#### C2. Dias até Agendamento de Reunião — **5 pontos máx**
| Dias desde lead | Pontos |
|-----------------|--------|
| 0-7 dias | 5 |
| 8-14 dias | 4 |
| 15-30 dias | 3 |
| 31-60 dias | 2 |
| 61-90 dias | 1 |
| > 90 dias ou não agendou | 0 |

#### C3. Dias até Reunião Realizada — **6 pontos máx**
| Dias desde lead | Pontos |
|-----------------|--------|
| 0-14 dias | 6 |
| 15-30 dias | 5 |
| 31-60 dias | 4 |
| 61-90 dias | 3 |
| > 90 dias | 2 |
| Nunca realizada | 0 |

#### C4. Velocidade de Progressão — **4 pontos máx**
| Etapas avançadas | Pontos |
|------------------|--------|
| 5+ etapas | 4 |
| 3-4 etapas | 3 |
| 2 etapas | 2 |
| 1 etapa | 1 |
| Nenhuma | 0 |

#### C5. Estágio Atual do Pipeline — **4 pontos máx**
| Estágio | Pontos |
|---------|--------|
| Fechado/Ganho | 4 |
| Reunião Realizada | 4 |
| Reunião Agendada | 3 |
| Negociação | 3 |
| Qualificação | 2 |
| Primeiro Contato | 1 |
| Open | 0 |

**Máximo Parcial C:** 25 pontos

---

### 2.4 D. Sinais Explícitos (Peso: 15%)

#### D1. Presença de Tag "MQL" — **4 pontos**
| Condição | Pontos |
|----------|--------|
| Tag "MQL" presente | 4 |
| Tag não presente | 0 |

#### D2. Presença de Tag "SQL" — **4 pontos**
| Condição | Pontos |
|----------|--------|
| Tag "SQL" presente | 4 |
| Tag não presente | 0 |

#### D3. Presença de Tag [fn] (Funil) — **3 pontos**
| Condição | Pontos |
|----------|--------|
| Tag [fn] presente | 3 |
| Tag não presente | 0 |

#### D4. SDR Atribuído — **2 pontos**
| Condição | Pontos |
|----------|--------|
| SDR/Owner atribuído | 2 |
| Sem SDR/Owner | 0 |

#### D5. Estágio de Vendas (Não Pré-Vendas) — **2 pontos**
| Condição | Pontos |
|----------|--------|
| Pipeline de Vendas SQL | 2 |
| Pipeline de Pré-Vendas | 0 |

**Máximo Parcial D:** 15 pontos

---

## 3. Fórmula de Cálculo

```
SCORE TOTAL = 
  (A_score × 0.25) + 
  (B_score × 0.35) + 
  (C_score × 0.25) + 
  (D_score × 0.15)

NORMALIZAÇÃO: Score final de 0 a 100
```

### 3.1 Justificativa dos Pesos

| Categoria | Peso | Justificativa |
|-----------|------|---------------|
| Engajamento Comportamental | 35% | **Maior preditor** — quanto mais um lead interage, maior a intenção. Dados de comunicação são fortes indicadores. |
| Progressão de Estágio | 25% | **Segundo maior** — leads que avançam no pipeline estão ativamente em consideração. Velocidade de avanço é crucial. |
| Fit Demográfico | 25% | **Qualificação inicial** — elimina leads com perfil inadequado. Dados disponíveis na captura. |
| Sinais Explícitos | 15% | **Validação adicional** — tags e classificações do time são correções ao modelo. |

---

## 4. Validação Contra Buyers Conhecidos

### 4.1 Metodologia de Validação
1. Calcular score para todos os 4.895 deals com `data_pagamento_entrada` preenchido
2. Comparar distribuição de scores entre:
   - **Buyers:** Contacts com venda confirmada
   - **Non-Buyers:** Contacts sem venda (ainda em pipeline ou perdidos)

### 4.2 Resultados Esperados
| Métrica | Buyers | Non-Buyers | Diferença |
|---------|-------|------------|----------|
| Média de Score | > 60 | < 40 | +20+ pontos |
| Mediana de Score | > 55 | < 35 | +20 pontos |
| % no Top 10% (Hot) | > 30% | ~5% | 6x mais provável |
| % no Bottom 50% (Cold) | < 10% | > 55% | 5x menos provável |

### 4.3 Anomalias Identificadas
Buyers com scores baixos indicam:
- Compra por timing / oportunidade única (não por engajamento)
- Transferência de conta existente
- Decisão executiva sem interação típica
- Erro no dados (data_pagamento_entrada falso positivo)

---

## 5. Definição de Thresholds

**Nota:** O score máximo observado nos dados é ~22 (não 100). Os thresholds foram recalibrados para a escala real.

| Categoria | Score | Ação Recomendada | % Real |
|-----------|-------|------------------|--------|
| 🔥 **HOT** | 18-22 | Contato imediato pelo closer. Reunião no mesmo dia. | ~3% |
| 🌡️ **WARM** | 14-17 | Contato prioritário. Agendar reunião em 24-48h. | ~4% |
| 🌱 **NURTURING** | 8-13 | Continue nutrição. SDR continua follow-up. | ~20% |
| ❄️ **COLD** | 0-7 | Baixa prioridade. Automação de nutrição. | ~73% |

**Validação do Modelo:**
- Buyers têm **12x mais probabilidade** de estar na categoria Hot vs non-buyers (30.9% vs 2.6%)
- Score médio de Buyers: **12.28** vs Non-buyers: **6.44** (1.9x maior)

---

## 6. Output do Script

### 6.1 Ficheiro: all-leads-scored.json
```json
{
  "metadata": {
    "version": "1.0",
    "calculated_at": "2026-04-01T00:00:00-03:00",
    "total_contacts": 8278,
    "score_distribution": {
      "hot": 828,
      "warm": 1242,
      "nurturing": 2070,
      "cold": 4138
    }
  },
  "contacts": [
    {
      "contato_id": "uuid",
      "nome": "Nome do Lead",
      "email": "email@domain.com",
      "score_final": 75,
      "categoria": "warm",
      "breakdown": {
        "fit_demografico": 18,
        "engajamento_comportamental": 28,
        "progressao_estagio": 20,
        "sinais_explicitos": 9
      },
      "feature_details": { ... },
      "is_buyer": true,
      "buyer_confirmed_at": "2026-03-15"
    }
  ]
}
```

---

## 7. Limitações e Próximos Passos

### 7.1 Limitações Atuais
- Scores baseados em dados históricos — não preveem comportamento futuro
- Missing data tratado com defaults liberais (pode underscore leads)
- Não inclui análise de sentiment de mensagens
- Não inclui dados de intenção (páginas visitadas, downloads)

### 7.2 Próximos Passos
1. **Validação A/B:** Testar scores contra resultados reais de vendas
2. **Machine Learning:** Treinar modelo preditivo com scores como feature
3. **Calibração:** Ajustar thresholds baseado em conversão real
4. **Features Adicionais:** Engajar com IA para análise de sentiment

---

## 8. Anexo: Tabela de Domínios Corporativos

Domínios considerados **não-corporativos** (pontos mínimos):
- gmail.com, yahoo.com, yahoo.com.br, hotmail.com, outlook.com
- outlook.com.br, live.com, msn.com, icloud.com, aol.com
- terra.com.br, uol.com.br, bol.com.br, ig.com.br

Qualquer outro domínio é considerado **corporativo**.
