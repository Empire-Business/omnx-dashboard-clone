# Análise de Engajamento Comportamental

**Data da Análise:** 01/04/2026, 23:45:55
**Base de Dados:** 8.278 contatos | 6.293 oportunidades | 88.752 comunicações

---

## Sumário Executivo

### Principais Descobertas

1. **Engajamento Dominado por WhatsApp**: O canal WhatsApp representa 39% de todas as comunicações (34.644), seguido por e-mail (30%) e SMS (12%).

2. **Taxa de Conexão Baixa**: Apenas 25% dos leads (1.571 de 6.293) alcançam o status "Conectado", indicando gargalo significativo nas primeiras 24-48 horas.

3. **Taxa de Fechamento em 1,5%**: Dos 6.293 leads, apenas 95 fecharam negócio (1,5%). Taxa de conversão de meeting para fechamento: 20.8%.

4. **Taxa de No-Show de 8,4%**: 526 oportunidades registraram no-show em alguma etapa, com impacto negativo na conversão.

5. **Automação Representa 57% das Comunicações**: workflow (45%) + api (12%) vs. app (human) com 33%.

6. **Mensagens com Baixa Taxa de Leitura**: Apenas 15% das mensagens são marcadas como "read", sugerindo necessidade de otimização de horários ou conteúdo.

7. **Duração Média de Chamadas: 39,5 segundos**: Chamadas curtas indicam desafios de engajamento ou qualificação.

---

## 1. Análise de Volume de Comunicações

### 1.1 Visão Geral

| Métrica | Valor |
|---------|-------|
| Total de Mensagens | 72.638 |
| Total de Ligações | 16.114 |
| Total de Inbound | 12.358 |
| Total de Outbound | 50.110 |
| **Ratio Inbound/Outbound** | **24.7%** |

### 1.2 Distribuição de Mensagens por Contato

| Estatistica | Valor |
|-------------|-------|
| Contatos com mensagens | 3518 (42.5%) |
| Média de mensagens | 20.6 |
| Mediana | 12 |
| Máximo | 476 |

### 1.3 Média de Mensagens por Categoria

| Categoria | Média de Mensagens | Amostras |
|-----------|-------------------|----------|
| MQL (Marketing Qualified Lead) | 26.1 | 1286 |
| Non-MQL | 5.6 | 6992 |
| **Fechado (data_fechado)** | **27.3** | **94** |

> **Insight:** Leads que fecham têm em média 27.3 mensagens vs 5.6 de não-MQLs. O volume de comunicação é um forte indicador de qualificação.

---

## 2. Análise de Canais

### 2.1 Distribuição por Canal

| Canal | Total | Inbound | Outbound | Taxa de Leitura | Taxa de Falha |
|-------|-------|---------|----------|-----------------|---------------|
| whatsapp   | 34644 |   8741 |    25903 |      31.1% |        9.9% |
| email      | 26284 |      0 |        0 |       0.0% |        2.7% |
| call       | 16114 |     81 |    16033 |       0.0% |        6.7% |
| sms        | 10676 |   3535 |     7141 |       0.0% |        3.4% |
| mensagem   |  1033 |      0 |     1033 |       0.0% |        0.0% |
| webchat    |     1 |      1 |        0 |       0.0% |        0.0% |

### 2.2 Análise por Canal

- **WhatsApp (39%)**: Canal dominante com 34.644 mensagens, 31% de taxa de leitura e 9,9% de taxa de falha.
- **E-mail (30%)**: Segundo maior volume (26.284), 2,7% de taxa de falha.
- **SMS (12%)**: 10.676 mensagens, 3,4% de taxa de falha.
- **Ligacões (18%)**: 16.114 chamadas com 39,5s de duração média.

---

## 3. Análise de Timing de Engajamento

### 3.1 Métricas de Velocidade

| Métrica | Amostras | Média (dias) | Mediana | Mín | Máx |
|---------|----------|--------------|---------|-----|-----|
| Lead Recebido → First Inbound | 1650 | 15.3 | 1 | 0 | 158 |
| Lead → Conectado | 1571 | 11.2 | 1 | 0 | 124 |
| Conectado → Reunião Agendada | 729 | 5.0 | N/A | 0 | 111 |
| Reunião Realizada → Fechamento | 50 | 19.4 | 6 | 0 | 395 |

> **Crítico:** O tempo médio do Lead Recebido até First Inbound é de 15.3 dias. Quanto mais rápido o primeiro contato, maior a chance de conversão.

---

## 4. Análise de Status de Mensagens

### 4.1 Distribuição de Status

| Status | Quantidade | Percentual |
|--------|------------|------------|
| delivered       |    31069 | 42.8% |
| null            |    25558 | 35.2% |
| read            |    10776 | 14.8% |
| failed          |     4492 | 6.2% |
| sent            |      634 | 0.9% |
| pending         |      109 | 0.2% |

### 4.2 Métricas-Chave

| Métrica | Valor | Benchmark |
|---------|-------|-----------|
| **Taxa de Leitura** | 14.8% | <20% = Poor, 20-40% = Good, >40% = Excellent |
| **Taxa de Entrega** | 57.6% | >90% = Excellent |
| **Taxa de Falha** | 6.2% | <3% = Excellent, >5% = Problem |
| **Taxa de Pendência** | 0.2% | - |

> **Alerta:** Taxa de falha de 6.2% indica problemas de entregabilidade que precisam ser investigados.

---

## 5. Análise Human vs. Automação

### 5.1 Distribuição de Volume

| Fonte | Comunicações | Percentual |
|-------|--------------|-------------|
| **Humano (app)** | 29.346 | 33.1% |
| **Automação (workflow + api)** | 50.583 | 57.0% |

### 5.2 Impacto na Conversão

| Fonte | Total Leads | Fechados | Taxa de Conversão |
|-------|-------------|----------|-------------------|
| Human-sourced | 2483 | 37 | 1.5% |
| Auto-sourced | 3504 | 42 | 1.2% |

> **Insight:** Leads originados de comunicações humanas têm taxa de conversão +24.3% maior que os de automação.

---

## 6. Análise de Ligações

### 6.1 Estatísticas Gerais

| Métrica | Valor |
|---------|-------|
| Total de Ligações | 16.114 |
| Ligações com Duração | 11.840 |
| **Duração Média** | **39.5 segundos** |
| Duração Mediana | 8s |
| Duração Mínima/Máxima | 1s / 1463s |

### 6.2 Distribuição de Duração

| Faixa (segundos) | Quantidade | Percentual |
|-----------------|------------|------------|
| 0-10s |   7483 | 63.2% |
| 11-30s |   2193 | 18.5% |
| 31-60s |    871 | 7.4% |
| 61-120s |    293 | 2.5% |
| 121-300s |    127 | 1.1% |
| 300-+s |    468 | 4.0% |

### 6.3 Resultado das Ligações

| Status | Quantidade | Percentual |
|--------|------------|------------|
| completed       |    12103 | 75.1% |
| no-answer       |     2569 | 15.9% |
| failed          |     1080 | 6.7% |
| busy            |      186 | 1.2% |
| canceled        |       72 | 0.4% |
| unknown         |       38 | 0.2% |
| in-progress     |       20 | 0.1% |
| voicemail       |       18 | 0.1% |
| initiated       |       18 | 0.1% |
| ringing         |       10 | 0.1% |

> **Insight:** 7483 ligações (63.2%) duram menos de 10 segundos. Isso indica que muitas chamadas estão sendo abandonadas rapidamente ou indo para correio de voz sem qualificação adequada.

---

## 7. Análise do Ciclo de Vida do Lead

### 7.1 Status das Oportunidades

| Status | Quantidade | Percentual |
|--------|------------|------------|
| Abertas | 4812 | 76.5% |
| Fechadas (data_fechado) | 95 | 1.5% |
| Perdidas | 1390 | 22.1% |

### 7.2 Timeline de Deals Fechados

| Etapa | Média (dias) | Amostras Válidas |
|-------|-------------|------------------|
| Lead Recebido → Conectado | 6.7 | 51 |
| Conectado → Reunião Agendada | 3.7 | 49 |
| Reunião Agendada → Realizada | 9.9 | 47 |
| Reunião Realizada → Fechamento | 19.4 | 50 |

### 7.3 Comparativo: Fechados vs. Perdidos

| Métrica | Fechados | Perdidos |
|---------|----------|----------|
| Lead → Conectado | 6.7 dias | 9.5 dias |

> **Insight:** Leads perdidos levam em média 9.5 dias para conectar vs 6.7 dias dos fechados. Velocidade de resposta é crítica.

---

## 8. Análise de No-Shows

### 8.1 Volume de No-Shows

| Categoria | Quantidade |
|-----------|------------|
| No-Show Pré-Vendas | 279 |
| No-Show Vendas | 247 |
| **Total Único** | **278** |

### 8.2 Impacto na Conversão

| Grupo | Total | Fechados | Taxa |
|-------|-------|----------|------|
| Com No-Show | 526 | 10 | 1.9% |
| Sem No-Show | 5949 | 89 | 1.5% |

> **Alerta:** Taxa de conversão com no-show: 1.9% vs 1.5% sem no-show.

---

## 9. Análise de Funil

### 9.1 Funil Completo

```
Leads Recebidos:     6.293  [████████████████████████████████────────────────────] 100%
        │
        ▼ (-75%)
Conectados:             1.571  [███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  25%
        │
        ▼ (-53%)
Reunião Agendada:       738  [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  12%
        │
        ▼ (-38%)
Reunião Realizada:      456  [███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   7%
        │
        ▼ (-79%)
Fechados:                95  [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   2%
        │
        ▼
Perdidos:             1.390  [█████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  22%
```

### 9.2 Taxas de Conversão por Etapa

| Etapa | Retenção | Drop-off | Gravidade |
|-------|----------|----------|-----------|
| Lead → Conectado | 25.0% | -75% | 🔴 CRÍTICO |
| Conectado → Agendamento | 47.0% | -53% | 🟠 ALTO |
| Agendamento → Realização | 61.8% | -38% | 🟡 MÉDIO |
| Realização → Fechamento | 20.8% | -79% | 🔴 CRÍTICO |

---

## 10. Recomendações

### Curto Prazo (0-30 dias)

1. **Otimização de First Response**
   - Implementar SLA de resposta em até 5 minutos para novos leads
   - Automatizar primeiro contato via WhatsApp com template qualificado
   - Meta: reduzir tempo Lead→Inbound de 15 dias para <2 dias

2. **Sistema de Lembrete de Reunião**
   - Enviar lembrete automático 24h e 1h antes da reunião
   - Confirmação ativa por WhatsApp
   - Meta: reduzir no-shows de 8.4% para <3%

3. **Revisão de Mensagens Falhas**
   - Analisar 4492 mensagens com status "failed"
   - Limpar base de contatos com dados inválidos
   - Meta: reduzir taxa de falha para <3%

### Médio Prazo (30-90 dias)

4. **Qualificação de Chamadas**
   - Treinar equipe para chamadas de no mínimo 3 minutos
   - Implementar script de qualificação com perguntas-chave
   - Meta: aumentar duração média de 39s para >120s

5. **Canal WhatsApp como Prioritário**
   - Desenvolver flujos de WhatsApp para etapas de qualificação
   - Implementar chatbot para triagem inicial 24/7
   - Meta: aumentar read rate do WhatsApp para >40%

6. **Análise de Lost Reasons**
   - Sistematizar coleta de motivo de perda em 1390 leads perdidos
   - Criar playbook de objeções com respostas padrão
   - Meta: identificar top 5 razões de perda e reduzir seu impacto

### Longo Prazo (90+ dias)

7. **Lead Scoring Comportamental**
   - Implementar score baseado em:
     - Número de pontos de contato
     - Velocidade de resposta
     - Engajamento por canal
     - Histórico de no-shows
   - Priorizar leads com score >70 para atenção humana

8. **Automação Inteligente**
   - Reduzir automação genérica e aumentar comunicações humanas qualificadas
   - Implementar gatilhos baseados em comportamento (abertura de email, resposta a SMS)
   - Meta: ratio human/automation de 33/57 para 50/40

---

## Anexo: Distribuição de Pipeline

| Pipeline | Oportunidades |
|----------|--------------|
| Pré-Vendas nMQL | 3007 |
| Pré-Vendas MQL | 914 |
| [fn] webinário | 751 |
| Vendas SQL | 589 |
| Recuperação | 528 |
| Social Selling | 278 |
| Incompleto | 159 |
| Cami | 38 |
| Auto Agendamento | 15 |
| [fn] sdr ia | 13 |
| null | 1 |

---

## Anexo: Tags MQL

| Tag | Contatos |
|-----|----------|
| MQL (tag exata) | 1.286 |
| nmql (non-MQL) | 3.091 |

---

*Relatório gerado automaticamente via análise de dados GHL-Supabase*
*Timestamp: 2026-04-02T02:45:55.581Z*
