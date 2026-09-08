# Clara — Mapeamento de Módulos Faltantes

> Documento gerado em 2026-06-18 para mapear quais módulos do Empire Dashboard ainda não têm tool nativa na Clara e priorizar implementações.

---

## Legenda de prioridade

- **🔴 Alta**: impacto direto na decisão de negócio, dados já existem, pergunta frequente
- **🟡 Média**: complementa análises existentes, útil mas não crítico
- **🟢 Baixa**: específico, raramente perguntado ou dados ainda instáveis

---

## 1. Módulos já cobertos (tools existentes)

| Módulo | Tools | O que já responde |
|--------|-------|-------------------|
| Funil / Aquisição | `query_funnel_cohort` | Leads, MQLs, conectados, agendados, reuniões, vendas por cohort |
| Faturamento | `query_revenue_produtividade` | Faturamento e vendas por produtividade (data_pagamento_entrada) |
| Vendas detalhadas | `query_vendas_detalhado` | Vendas por closer, produto e forma de pagamento (visão produtividade) |
| Pré-Vendas | `query_pre_vendas` | Reuniões, no-shows, taxa de comparecimento por SDR/closer |
| Meta Ads (geral) | `query_meta_ads` | Investimento, CTR, CPM, leads por campanha/adset/anúncio/dia |
| Meta Ads (região) | `query_meta_ads_region` | Investimento, vendas, CPV, ROAS, ROAS CAIXA por região |
| Criativos / Anúncios | `query_criativos` | Ranking de criativos por spend, CTR, CPMQL, ROAS, vendas |
| SDRs | `query_sdr_performance` | Performance de SDRs (leads, MQLs, agendamentos) |
| Orgânico | `query_organico` | Leads/MQLs orgânicos por canal |
| Metas | `query_goals` | Metas cadastradas e progresso |
| Leads parados | `query_leads_parados` | Leids sem contato há N dias |
| Campanhas | `query_campaign_mapping` | Mapeamento de campanhas |
| Canais de tráfego | `list_utm_sources` | Lista canais/campanhas configuradas (`utm_sources` / `utm_campaigns`) |
| Desempenho de canal | `query_trafego_pago` | Investimento, leads, MQLs, vendas e ROAS por canal/campanha |
| Perfil de comprador | `get_buyer_profile` | Análise qualitativa de compradores |
| SQL livre | `run_sql_query` | SELECTs customizados (requere conhecimento do schema) |

---

## 2. Módulos sem tool nativa

### ✅ 1. Vendas — Análise por closer, produto e forma de pagamento

**Implementado:** `query_vendas_detalhado` + RPC `analisar_vendas`

**O que responde:**
- Ranking de closers (vendas, faturamento, caixa, ticket médio)
- Análise por produto vendido
- Análise por forma de pagamento

**Fonte:** `vendas_fechamento` + `oportunidades` (visão produtividade por `data_pagamento_entrada`).

---

### ✅ 2. Pré-Vendas — Reuniões, no-shows e funil detalhado

**Implementado:** `query_pre_vendas` + RPC `analisar_pre_vendas`

**O que responde:**
- Leads, MQLs, conectados, agendamentos
- Reuniões agendadas vs realizadas
- No-shows e taxa de comparecimento por SDR/closer
- Tempo médio entre lead recebido e agendamento

**Fonte:** `oportunidades` + `contatos` (visão cohort por `data_lead_recebido`).

---

### ✅ 3. Traqueamento / Anúncios — Ranking de criativos

**Implementado:** `query_criativos` + RPC `analisar_criativos`

**O que responde:**
- Ranking de criativos por spend, CTR, CPM, leads, vendas, ROAS, ROAS CAIXA
- Análise por criativo, anúncio, campanha ou conjunto
- Cruzamento Meta Ads × CRM via padrão `CR-xxx`

**Fonte:** `meta_ads_insights`, `notion_creatives`, `oportunidades`, `vendas_fechamento`.

---

### ✅ 4. Traqueamento / Canais — Listar canais e desempenho de canal

**Implementado:**
- `list_utm_sources` — metadados de `utm_sources` + `utm_campaigns`
- `query_trafego_pago` — RPC `query_trafego_pago`

**O que responde:**
- Lista de canais de tráfego pago e campanhas ativas
- Investimento Meta, leads, MQLs, vendas, faturamento, ROAS por canal ou campanha
- Modos `cohort` (entrada do lead) e `produtividade` (data de pagamento)

**Fonte:** `utm_sources`, `utm_campaigns`, `meta_ads_insights`, `oportunidades`, `vendas_fechamento`.

---

### 🟡 4. Relatórios Semanais — Resumo executivo

**O que falta:**
- Resumo da última semana comercial
- Evolução de KPIs semanais (cohort + produtividade)
- Comparação semana atual vs anterior
- Alertas de queda/aumento

**Por que é média prioridade:**
- O schema `weekly_snapshots` já existe mas ainda não tem dados populados
- Quando tiver dados, será o principal relatório de diretoria

**Perguntas:**
- "Como foi a semana de vendas?"
- "O que subiu e o que caiu em relação à semana passada?"

---

### 🟡 5. SDR IA — Desempenho dos bots

**O que falta:**
- Mensagens trocadas por bot
- Taxa de resposta dos leads
- Leads que responderam vs não responderam
- Tempo médio de primeira resposta do bot
- Conversas encaminhadas para humano

**Por que é média prioridade:**
- Módulo novo e em evolução
- Útil para otimizar scripts de bot

**Perguntas:**
- "Quantas mensagens o bot enviou ontem?"
- "Qual bot tem melhor taxa de resposta?"

---

### 🟡 6. Metas — Realizado vs meta com projeção

**O que falta:**
- Comparativo realizado vs meta por dia/semana
- Projeção de fechamento do mês
- Gap para atingir meta
- Performance por canal e por SDR contra meta

**Por que é média prioridade:**
- `query_goals` já lista metas, mas não compara com realizado
- Útil para acompanhamento diário

**Perguntas:**
- "Estamos acima ou abaixo da meta de MQLs?"
- "Quantos MQLs faltam para bater a meta do mês?"

---

### 🟡 7. Recuperação — Pipeline de leads perdidos

**O que falta:**
- Leads em recuperação por SDR
- Taxa de reconquista
- Motivos de perda
- Valor recuperado

**Por que é média prioridade:**
- Módulo específico, mas com alto valor financeiro
- Dados em `oportunidades` com pipeline de recuperação

**Perguntas:**
- "Quantos leads foram recuperados no mês?"
- "Qual o motivo de perda mais comum?"

---

### 🟢 8. Aquisição / Leads — Detalhamento de leads

**O que falta:**
- Lista de leads por canal/campanha com score
- Análise de qualidade de lead
- Distribuição geográfica de leads (não só compradores)

**Por que é baixa prioridade:**
- `query_funnel_cohort` já cobre a maior parte
- Análises mais granulares são úteis mas menos perguntadas

---

### 🟢 9. Configurações / Settings

**O que falta:**
- Listar usuários, permissões, workspaces
- Resumo de configurações ativas

**Por que é baixa prioridade:**
- Não é análise de negócio
- Pouca frequência de perguntas

---

## 3. Status da implementação

Os três módulos de alta prioridade foram implementados e aprovados pelo QA:

| Módulo | Tool | Status |
|--------|------|--------|
| Vendas por closer/produto/pagamento | `query_vendas_detalhado` | ✅ Aprovado |
| Pré-Vendas: reuniões, no-shows e comparecimento | `query_pre_vendas` | ✅ Aprovado |
| Traqueamento: ranking de criativos | `query_criativos` | ✅ Aprovado |
| Traqueamento: listar canais de tráfego pago | `list_utm_sources` | ✅ Aprovado |
| Traqueamento: desempenho de canal específico | `query_trafego_pago` | ✅ Aprovado |

Próximos candidatos (média prioridade):

1. **🟡 Relatórios Semanais** — depende de popular o schema
2. **🟡 Metas: realizado vs meta + projeção** — complementa todo o resto
3. **🟡 SDR IA e Recuperação** — módulos específicos

---

## 4. Notas técnicas

- A maioria das análises pode ser implementada criando **funções SQL/RPC** no banco e **tools + executores** na Clara, seguindo o padrão de `query_meta_ads_region`.
- Para módulos com muitas dimensões (ex: vendas), vale criar uma tool genérica `query_vendas` com parâmetros `group_by` e `dimension`.
- Para evitar SQL manual frágil, cada tool deve ter uma função SQL dedicada que encapsule as regras de negócio.

---

*Última atualização: 2026-06-18*
