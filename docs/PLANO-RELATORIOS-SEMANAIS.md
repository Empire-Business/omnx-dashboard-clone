# Plano: Módulo Relatórios — Dados Semanais Persistidos (Cohort + Produtividade)

> **Status:** Plano aprovado — aguardando implementação  
> **Criado em:** 2026-05-18 BRT  
> **Responsável:** Sistema OMNX Code  
> **Dependências:** Schema atual de `oportunidades`, `contatos`, `vendas_fechamento`, `comunicacoes`, `meta_ads_insights`

---

## 1. Objetivo

Criar uma **tabela central no Supabase** que armazene **toda semana** um snapshot consolidado das métricas de **todas as telas do dashboard**. Isso permite:

- **Histórico imutável:** ver como cada semana se comportou, mesmo que os dados de origem mudem.
- **Performance:** o frontend lê snapshots pré-computados em vez de calcular tudo em tempo real sobre milhares de registros.
- **Comparativos:** semana vs semana, mês vs mês, tendências de longo prazo.
- **Cohort verdadeiro:** como leads gerados em semanas passadas continuam convertendo, o cohort de semanas antigas **muda com o tempo**. A tabela deve suportar reprocessamento parcial.

---

## 2. Conceitos Fundamentais

### 2.1. Cohort vs Produtividade — na tabela

| Conceito | Na tabela | Regra de atualização |
|----------|-----------|---------------------|
| **Cohort** | Métricas filtradas por `data_lead_recebido` da semana | **Reprocessável.** Um lead de semana X que vender na semana Y altera o cohort da semana X. Deve haver mecanismo de recalcular semanas afetadas. |
| **Produtividade** | Métricas filtradas pela data do próprio evento | **Imutável após fechamento da semana.** Um evento (conexão, agendamento, venda) aconteceu em uma data específica e nunca muda de semana. |

> **Regra de ouro:** Cohort é "retroativo mutável". Produtividade é "imutável após fechamento".

### 2.2. Semana de referência

- A semana começa na **segunda-feira** e termina no **domingo** (padrão comercial brasileiro).
- O campo `week_start` (DATE) identifica cada snapshot — sempre uma segunda-feira.
- O campo `week_end` (DATE) é `week_start + 6 dias` (domingo).
- Exemplo: `week_start = '2026-01-05'` representa a semana de 05/01 a 11/01/2026.

---

## 3. Schema — Tabelas Tipadas por Módulo + Central

> **Evolução do design:** o plano original previa uma única tabela EAV (`weekly_reports`).
> O schema revisado usa **tabelas tipadas por módulo** (type-safe, queries rápidas)
> com uma **tabela central `weekly_snapshots`** como catálogo mestre.
> Para leitura unificada, a view `v_weekly_dashboard` faz UNION ALL de todos os módulos.

### 3.1. Tabela Central: `weekly_snapshots`

Catálogo mestre. Cada semana comercial gera **2 snapshots**: `cohort` e `produtividade`.
Todas as tabelas por módulo referenciam este `id`.

```sql
CREATE TABLE public.weekly_snapshots (
  id                      BIGSERIAL PRIMARY KEY,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  week_start              DATE NOT NULL,                    -- sempre segunda
  week_end                DATE GENERATED ALWAYS AS (week_start + 6) STORED,
  year_week               TEXT NOT NULL,
  report_type             TEXT NOT NULL CHECK (report_type IN ('cohort', 'produtividade')),
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','computing','completed','failed','finalized')),
  computed_at             TIMESTAMPTZ,
  finalized_at            TIMESTAMPTZ,
  computation_duration_ms INTEGER,
  records_processed       INTEGER,
  error_message           TEXT,
  data_version            INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_weekly_snapshots_week_type UNIQUE (week_start, report_type)
);
```

**Como funciona:**
- Semana de 05/01/2026 → 2 linhas: `(cohort, status='completed')` e `(produtividade, status='completed')`
- `data_version` incrementa a cada reprocessamento de cohort
- `status` rastreia se o snapshot está pronto, em andamento ou falhou

### 3.2. Tabelas por Módulo (9 tabelas tipadas)

Cada módulo tem sua própria tabela com colunas tipadas + `extras JSONB` para extensibilidade.
Todas têm `snapshot_id → weekly_snapshots(id)` com `ON DELETE CASCADE`.

| Tabela | Descrição | Colunas principais |
|--------|-----------|-------------------|
| `weekly_trafego` | Tráfego pago + orgânico | leads, mqls, conectados, agendados, reunioes, fechados, faturamento, caixa, meta_spend, meta_impressions, meta_clicks, cpmql, roas, ctr, taxas... |
| `weekly_aquisicao` | Tráfego + orgânico combinado | Mesmo que tráfego, inclui orgânico |
| `weekly_organico` | Somente orgânico | Sem meta_spend (sempre 0) |
| `weekly_prevendas` | Pré-vendas + produtividade SDR | leads, mqls, conectados, agendados, reunioes, ligacoes, mensagens, pessoas_contatadas, avg_response_seconds... |
| `weekly_vendas` | Vendas + produtividade closer | leads, mqls, agendados, reunioes, fechados, no_shows, negociacao, perdidos_apos_reuniao, perdidos_sem_reuniao, ligacoes, mensagens... |
| `weekly_recuperacao` | Pipeline Recuperação | Espelho de pré-vendas, sem MQL |
| `weekly_sdr` | Performance individual SDR | leads, conectados, agendados, agendados_no_prazo, ligacoes, mensagens, avg_response_seconds... |
| `weekly_closer` | Performance individual closer | leads, mqls, agendados, reunioes, fechados, no_shows, ligacoes, mensagens, ciclo_fechamento_dias... |
| `weekly_metas` | Target vs Realizado | meta_mql_target, meta_cpmql_target, meta_spend_target, meta_vendas_target, realizado_*, pct_atingido_*, ideal_dia_* |

**Padrão de colunas em toda tabela de módulo:**
```sql
snapshot_id BIGINT REFERENCES weekly_snapshots(id) ON DELETE CASCADE,
dimension TEXT NOT NULL DEFAULT 'todos',
dimension_value TEXT NOT NULL DEFAULT 'todos',
sub_dimension TEXT DEFAULT NULL,
sub_dimension_value TEXT DEFAULT NULL,
-- métricas tipadas (INTEGER, NUMERIC)...,
extras JSONB NOT NULL DEFAULT '{}'::JSONB,
CONSTRAINT uq_xxx_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value)
```

### 3.3. Tabela de Audit: `weekly_cohort_audit`

Rastreia **toda mudança** em snapshots cohort. Permite explicar para stakeholders
*por que* o ROAS da semana 12 mudou de 3.5 para 4.2.

```sql
CREATE TABLE public.weekly_cohort_audit (
  id                BIGSERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_id       BIGINT REFERENCES weekly_snapshots(id),
  module            TEXT NOT NULL,
  metric            TEXT NOT NULL,
  dimension         TEXT DEFAULT 'todos',
  dimension_value   TEXT DEFAULT 'todos',
  old_value         NUMERIC,
  new_value         NUMERIC,
  delta             NUMERIC GENERATED ALWAYS AS (new_value - COALESCE(old_value, 0)) STORED,
  reason            TEXT NOT NULL,          -- "Venda de eduardosampaio - opp_id abc"
  trigger_event     TEXT,                   -- 'venda_fechada', 'pagamento_entrada'
  trigger_record_id TEXT,                   -- ID da oportunidade que causou
  changed_by        UUID DEFAULT auth.uid()
);
```

### 3.4. Fila de Reprocessamento: `weekly_reprocess_queue`

Quando `vendas_fechamento.data_pagamento_entrada` é preenchido para uma oportunidade antiga,
a semana do `data_lead_recebido` entra nesta fila.

```sql
CREATE TABLE public.weekly_reprocess_queue (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  week_start    DATE NOT NULL,
  report_type   TEXT NOT NULL CHECK (report_type IN ('cohort', 'produtividade')),
  reason        TEXT NOT NULL,
  priority      INTEGER NOT NULL DEFAULT 0,   -- maior = processa primeiro
  attempts      INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  CONSTRAINT uq_weekly_reprocess_queue UNIQUE (week_start, report_type, reason)
);
```

### 3.5. Views Unificadas (para o desavisado entender facilmente)

#### `v_weekly_snapshots_status` — visão geral do catálogo
Mostra, para cada snapshot, quantos registros existem em cada módulo:
```sql
SELECT week_start, report_type, status, trafego_records, vendas_records, ...
FROM v_weekly_snapshots_status;
```

#### `v_weekly_dashboard` — TABELA ÚNICA unificada
UNION ALL de todas as tabelas por módulo. Permite consultar TUDO de uma vez:
```sql
SELECT * FROM v_weekly_dashboard
WHERE week_start = '2026-05-11'
  AND module = 'trafego'
  AND dimension = 'todos';
```
Métricas comuns (leads, mqls, faturamento, taxas) estão em colunas tipadas.
Métricas específicas de cada módulo (ex: ligacoes_count do SDR) estão dentro do JSONB `extras`.

### 3.6. Schema Original vs Revisado

| Aspecto | Plano Original (EAV) | Schema Revisado (Tipado) |
|---------|---------------------|-------------------------|
| Tabela principal | `weekly_reports` (1 tabela, 1 linha por métrica) | `weekly_snapshots` (catálogo) + 9 tabelas tipadas |
| Type safety | Nenhuma (colunas genéricas) | Total (colunas INTEGER, NUMERIC por módulo) |
| Performance de query | Lenta (muitas linhas, DISTINCT ON) | Rápida (colunas tipadas, índices diretos) |
| Extensibilidade | `extras` genérico | `extras JSONB` por módulo + schema tipado |
| Leitura simples | `v_weekly_reports_latest` | `v_weekly_dashboard` (UNION ALL) + `v_weekly_snapshots_status` |
| Audit trail | Nenhuma | `weekly_cohort_audit` com delta e motivo |
| Reprocessamento | `weekly_reports_reprocess_queue` | `weekly_reprocess_queue` com prioridade |

---

## 4. Inventário Completo de Métricas por Módulo

### 4.1. Módulo TRÁFEGO (`trafego`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads gerados | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| MQLs | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público |
| Conectados | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Agendados | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Reuniões feitas | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Vendas fechadas | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Faturamento bruto | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Caixa recebido | Cohort | Todos, Canal, Funil, Campanha [cp], Campanha Meta, Criativo, Público, MQL |
| Investimento (spend) | Cohort | Todos, Canal, Campanha Meta, Adset, Anúncio, Criativo, Público |
| Impressões | Cohort | Todos, Canal, Campanha Meta, Adset, Anúncio, Criativo, Público |
| Cliques | Cohort | Todos, Canal, Campanha Meta, Adset, Anúncio, Criativo, Público |
| Leads (Meta actions) | Cohort | Todos, Canal, Campanha Meta, Adset, Anúncio, Criativo, Público |
| CPMQL | Derivada | Todos, Canal, Funil, Campanha [cp], Campanha Meta |
| CPV | Derivada | Todos, Canal, Funil, Campanha [cp], Campanha Meta |
| ROAS | Derivada | Todos, Canal, Funil, Campanha [cp], Campanha Meta |
| ROAS Caixa | Derivada | Todos, Canal, Funil, Campanha [cp], Campanha Meta |
| CTR | Derivada | Todos, Canal, Campanha Meta |
| Ciclo de compra | Derivada | Todos, Canal, Funil, Campanha [cp] |
| Taxa de conexão | Derivada | Todos, Canal, Funil, Campanha [cp], MQL |
| Taxa de agendamento | Derivada | Todos, Canal, Funil, Campanha [cp], MQL |
| Taxa de reunião | Derivada | Todos, Canal, Funil, Campanha [cp] |
| Taxa de conversão | Derivada | Todos, Canal, Funil, Campanha [cp] |

**Produtividade paralela:**

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads gerados (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| MQLs (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Conectados (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Agendados (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Reuniões (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Fechados (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Faturamento (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |
| Caixa (mês) | Produtividade | Todos, Canal, Funil, Campanha [cp] |

### 4.2. Módulo AQUISIÇÃO (`aquisicao`)

Igual ao Tráfego, mas **inclui orgânico** e tem dimensão extra `origem` + `subcategoria`.

Sem Meta Ads spend quando o filtro é só orgânico.

### 4.3. Módulo ORGÂNICO (`organico`)

Igual ao Aquisição, mas **sem investimento Meta** (spend = 0 sempre).

Dimensões: Origem, Subcategoria, Canal (orgânico), Funil, Campanha [cp], MQL.

### 4.4. Módulo PRÉ-VENDAS (`prevendas`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads atribuídos | Cohort | Todos, SDR, Canal, Funil, Campanha [cp], MQL |
| MQLs | Cohort | Todos, SDR, Canal, Funil, Campanha [cp] |
| Conectados | Cohort | Todos, SDR, Canal, Funil, Campanha [cp] |
| Agendados | Cohort | Todos, SDR, Canal, Funil, Campanha [cp] |
| Reuniões agendadas | Cohort | Todos, SDR, Canal, Funil, Campanha [cp] |
| Ligações | Produtividade | Todos, SDR |
| Mensagens | Produtividade | Todos, SDR |
| Mensagens SDR IA | Produtividade | SDR IA |
| Tempo médio de resposta | Produtividade | Todos, SDR |
| Leads sem resposta | Produtividade | Todos, SDR |
| Taxa sem resposta | Derivada | Todos, SDR |

### 4.5. Módulo VENDAS (`vendas`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads no pipeline | Cohort | Todos, Closer, Canal, Funil, Campanha [cp], MQL |
| MQLs | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Agendados vendas | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Reuniões realizadas | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| No-shows | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Negociação | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Fechados | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Faturamento | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Caixa | Cohort | Todos, Closer, Canal, Funil, Campanha [cp] |
| Taxa de conversão | Derivada | Todos, Closer |
| Taxa no-show | Derivada | Todos, Closer |
| Ligações | Produtividade | Todos, Closer |
| Mensagens | Produtividade | Todos, Closer |
| Pessoas contatadas | Produtividade | Todos, Closer |

> **Nota — Exclusão mútua no-show vs comparecimento:** `Taxa no-show` e `Taxa comparecimento` são derivadas mutuamente exclusivas. Um lead com reunião realizada (`data_realizacao_vendas` preenchida) **nunca** conta como no-show, mesmo que também possua `data_no_show_vendas` preenchido. Portanto, `Taxa comparecimento + Taxa no-show ≤ 100%`.

**Matriz Cohort Vendas:**
- Mesma estrutura do módulo Tráfego, mas com pipeline de vendas.
- Linhas por mês de cohort, colunas por etapa do funil de vendas.

**Matriz Produtividade Vendas:**
- Linhas por mês de evento.
- Colunas: leads, MQLs, agendados, reuniões, no-shows, negociação, fechados, faturamento, caixa.
- Breakdown por closer em cada linha.

### 4.6. Módulo RECUPERAÇÃO (`recuperacao`)

Espelho do Pré-Vendas, mas **apenas pipeline Recuperação**.

### 4.7. Módulo SDR (`sdr`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads atribuídos | Cohort | SDR individual |
| Conectados | Cohort | SDR individual |
| Taxa de conexão | Derivada | SDR individual |
| Agendados | Cohort | SDR individual |
| Taxa de agendamento | Derivada | SDR individual |
| Agendados no prazo | Cohort | SDR individual |
| Taxa agendamento no prazo | Derivada | SDR individual |
| Ligações | Produtividade | SDR individual |
| Mensagens | Produtividade | SDR individual |
| Fechamentos | Cohort | SDR individual |
| Tempo médio de resposta | Produtividade | SDR individual |
| Tempo da última resposta | Produtividade | SDR individual |
| Leads sem resposta | Produtividade | SDR individual |
| % Sem resposta | Derivada | SDR individual |

### 4.8. Módulo CLOSER (`closer`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Leads | Cohort | Closer individual |
| MQLs | Cohort | Closer individual |
| Agendados vendas | Cohort | Closer individual |
| Reuniões realizadas | Cohort | Closer individual |
| No-shows | Cohort | Closer individual |
| Taxa no-show | Derivada | Closer individual |
| Taxa comparecimento | Derivada | Closer individual |
| Negociação | Cohort | Closer individual |
| Fechados | Cohort | Closer individual |
| Conversão % | Derivada | Closer individual |
| Faturamento | Cohort | Closer individual |
| Caixa | Cohort | Closer individual |
| Ligações | Produtividade | Closer individual |
| Mensagens | Produtividade | Closer individual |
| Avg response | Produtividade | Closer individual |
| Leads sem resposta | Produtividade | Closer individual |
| % Sem resposta | Derivada | Closer individual |

> **Nota — Exclusão mútua no-show vs comparecimento:** `Taxa no-show` e `Taxa comparecimento` são derivadas mutuamente exclusivas. Um lead com reunião realizada (`data_realizacao_vendas` preenchida) **nunca** conta como no-show, mesmo que também possua `data_no_show_vendas` preenchido. Portanto, `Taxa comparecimento + Taxa no-show ≤ 100%`.

### 4.9. Módulo METAS (`metas`)

| Métrica | Tipo | Dimensões de corte |
|---------|------|-------------------|
| Meta MQL | Meta | Campanha, SDR, Global |
| Meta CPMQL | Meta | Campanha, SDR, Global |
| Meta Spend | Meta | Campanha, Global |
| Meta Vendas | Meta | Campanha, Closer, Global |
| Realizado MQL | Cohort | Mesma dimensão da meta |
| Realizado CPMQL | Derivada | Mesma dimensão da meta |
| Realizado Spend | Cohort | Mesma dimensão da meta |
| Realizado Vendas | Cohort | Mesma dimensão da meta |
| % Atingido | Derivada | Mesma dimensão da meta |
| Ideal-dia | Derivada | Mesma dimensão da meta |

---

## 5. Estratégia de Cálculo e Persistência

### 5.1. Frequência de snapshot

- **Produtividade:** computado automaticamente toda **segunda-feira às 03:00 BRT** (após fechamento da semana anterior).
- **Cohort:** computado automaticamente toda **segunda-feira às 04:00 BRT**, **E** reprocessado sob demanda quando novos eventos de vendas/pagamento afetam semanas passadas.

### 5.2. Edge Function: `compute-weekly-reports`

```
POST /compute-weekly-reports
Body: { "week_start": "2026-01-05", "report_type": "cohort|produtividade", "modules": ["trafego", "vendas", ...] }
```

A função:
1. Lê as configurações de dimensões do módulo.
2. Para cada dimensão, executa a query SQL equivalente ao hook do frontend.
3. Agrupa por `week_start` → `week_end`.
4. Insere/atualiza na `weekly_reports` com `ON CONFLICT (... ) DO UPDATE`.
5. Incrementa `data_version` em caso de update.

### 5.3. Reprocessamento de Cohort — Regra Crítica

Quando um **novo pagamento** é detectado (`vendas_fechamento.data_pagamento_entrada` preenchido):

1. Descobrir qual é a `data_lead_recebido` da oportunidade.
2. Calcular a qual `week_start` esse lead pertence.
3. Enfileirar na `weekly_reports_reprocess_queue`:
   - `week_start` = semana do lead
   - `module` = todos os módulos que usam cohort
   - `reason` = 'new_payment'
4. Um cron SQL `weekly-reports-cohort-reprocess` roda a cada 30 minutos e:
   - Consome a fila
   - Reexecuta `compute-weekly-reports` apenas para as semanas/modules afetados
   - Marca `processed_at`

> **Exemplo prático:** Um lead gerado na semana de 05/01/2026 compra em maio/2026. O trigger em `vendas_fechamento` detecta o pagamento, enfileira a semana 05/01 para reprocessamento. O cohort daquela semana é recalculado incluindo a venda.

### 5.4. Produtividade — Imutável

Produtividade **não usa fila de reprocessamento**. Uma vez computada na segunda-feira seguinte, nunca muda.

Se houver necessidade de corrigir (erro de sistema), usar reprocessamento manual via edge function.

---

## 6. Backfill Retroativo

### 6.1. Período

- **Data mais antiga dos dados:** janeiro/2026 (conforme auditoria de dados e migrations).
- **Primeira semana:** `2025-12-30` (segunda-feira da semana que contém 01/01/2026) ou a primeira segunda-feira em que há dados.
- **Última semana:** semana atual (ainda em andamento).

### 6.2. Processo de backfill

```
Task 1: Identificar a week_start mais antiga com dados
  → SELECT MIN(DATE_TRUNC('week', data_lead_recebido AT TIME ZONE 'America/Sao_Paulo')) FROM oportunidades;

Task 2: Para cada semana de start até hoje:
  → Chamar edge function compute-weekly-reports para produtividade
  → Chamar edge function compute-weekly-reports para cohort

Task 3: Validar consistência
  → Comparar totais da tabela weekly_reports vs queries diretas no banco
  → Verificar se semanas sem dados geraram linhas com zeros (devem existir para continuidade)
```

### 6.3. Otimização

- O backfill deve rodar em **batches de 4 semanas por execução** para não estourar timeout da edge function (50s).
- Usar a fila `ghl_api_jobs` (já existente) para orquestrar o backfill se necessário.
- Prioridade: primeiro módulos TRÁFEGO e VENDAS, depois os demais.

---

## 7. Aba de Relatórios no Frontend

### 7.1. Rota e Sidebar

- Nova rota: `/relatorios`
- Nova entrada na Sidebar: "Relatórios" (ícone `BarChart` ou `FileText`)
- Tabs internas: `Cohort`, `Produtividade`, `Comparativo`, `Tendências`

### 7.2. Tab Cohort

- Seletor de **módulo** (dropdown: Tráfego, Vendas, Pré-Vendas, etc.)
- Seletor de **dimensão** (dropdown: Todos, Canal, Funil, SDR, Closer, etc.)
- Tabela com:
  - Coluna: Semana (`week_start` → `week_end`)
  - Colunas: Leads, MQLs, Conectados, Agendados, Reuniões, Fechados, Faturamento, Caixa
  - Linhas: uma por semana, do mais recente para o mais antigo
- **Indicador de reprocessamento:** badge "Atualizado em X" mostrando `computed_at` e `data_version`
- **Drilldown:** clique em qualquer célula abre lista de leads daquela semana + dimensão

### 7.3. Tab Produtividade

- Mesma estrutura da Tab Cohort, mas com dados de produtividade.
- Colunas diferentes: Leads, MQLs, Conectados, Agendados, Reuniões, Fechados, Faturamento, Caixa, Ligações, Mensagens.
- **Sem indicador de reprocessamento** (produtividade é imutável após fechamento).

### 7.4. Tab Comparativo

- Seletor de **2 semanas** ou **2 períodos** (start/end de semanas).
- Tabela lado a lado:
  - Métrica | Semana A | Semana B | Delta | Delta %
- Cores: verde para melhoria, vermelho para piora.

### 7.5. Tab Tendências

- Gráfico de linha temporal por métrica selecionada.
- Eixo X: semanas.
- Eixo Y: valor da métrica.
- Filtros: módulo, dimensão, métrica.

### 7.6. Hook: `useWeeklyReports.ts`

```typescript
interface WeeklyReportFilters {
  module: string
  reportType: 'cohort' | 'produtividade'
  dimension?: string
  dimensionValue?: string
  weeksCount?: number        // quantas semanas trazer (default: 12)
}

function useWeeklyReports(filters: WeeklyReportFilters)
```

### 7.7. RLS

Todas as 12 tabelas do módulo de relatórios têm RLS habilitado com política `SELECT` para usuários autenticados:

```sql
-- Exemplo (replicado para weekly_snapshots, weekly_trafego, weekly_aquisicao,
-- weekly_organico, weekly_prevendas, weekly_vendas, weekly_recuperacao,
-- weekly_sdr, weekly_closer, weekly_metas, weekly_cohort_audit, weekly_reprocess_queue)
CREATE POLICY weekly_snapshots_select_auth ON public.weekly_snapshots
  FOR SELECT USING (auth.role() = 'authenticated');
```

> Nota: relatórios são dados consolidados do workspace. Se no futuro houver necessidade
> de isolar por workspace (multi-tenancy), a FK deve ser adicionada em `weekly_snapshots`
> e as políticas atualizadas para verificar `workspace_members`.

---

## 8. Cron Jobs e Automatização

| Cron | Frequência | Ação |
|------|-----------|------|
| `weekly-reports-produtividade` | Segundas, 03:00 BRT | Computa produtividade da semana anterior |
| `weekly-reports-cohort` | Segundas, 04:00 BRT | Computa cohort da semana anterior |
| `weekly-reports-cohort-reprocess` | A cada 30 min | Consome fila de reprocessamento de cohort |
| `weekly-reports-finalize` | Terças, 06:00 BRT | Marca `is_final = TRUE` para semanas de produtividade com >7 dias de idade |

---

## 9. Testes e Validação

### 9.1. Testes de consistência (scripts SQL)

```sql
-- Teste 1: Total de leads em weekly_reports.cohort deve bater com oportunidades
SELECT
  wr.week_start,
  wr.leads_count AS snapshot,
  (SELECT COUNT(*) FROM oportunidades o
   WHERE o.data_lead_recebido >= wr.week_start AND o.data_lead_recebido < wr.week_start + 7
     AND o.pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L') AS real
FROM weekly_reports wr
WHERE wr.module = 'trafego' AND wr.report_type = 'cohort'
  AND wr.dimension = 'todos'
ORDER BY wr.week_start DESC
LIMIT 10;

-- Teste 2: Soma de faturamento cohort deve bater com vendas_fechamento
-- Teste 3: Semanas sem dados devem ter linha com zeros (não deve faltar semana)
```

### 9.2. Testes de frontend

- Carregamento da aba Relatórios em <2s (lendo snapshots, não calculando).
- Drilldown abre lista correta de leads.
- Toggle Cohort/Produtividade muda os dados sem reload de página.
- Filtro de semanas funciona (últimas 4, 8, 12, 26, 52 semanas).

---

## 10. Documentação a Produzir

| Documento | Descrição |
|-----------|-----------|
| `docs/RELATORIOS-MODULO.md` | Documentação completa do módulo (este plano evolui para cá) |
| `docs/RELATORIOS-SCHEMA.md` | Schema detalhado da tabela + índices + triggers |
| `docs/RELATORIOS-COHORT-REPROCESS.md` | Regra de reprocessamento de cohort + fila |
| `docs/RELATORIOS-BACKFILL.md` | Procedimento de backfill retroativo |
| `docs/RELATORIOS-FRONTEND.md` | Hooks, componentes e tabs da aba Relatórios |

---

## 11. Tasks de Implementação (Resumidas)

```
Task 1: ✅ Criar migration do schema completo (weekly_snapshots + 9 tabelas + audit + fila + views + RLS)
Task 2: Criar edge function compute-weekly-reports (produtividade)
Task 3: Criar edge function compute-weekly-reports (cohort)
Task 4: Criar trigger em vendas_fechamento para enfileirar reprocessamento cohort
Task 5: Criar cron jobs de automação (produtividade + cohort + reprocess + finalize)
Task 6: Executar backfill retroativo (jan/2026 até hoje) em batches de 4 semanas
Task 7: Criar hook useWeeklyReports.ts
Task 8: Criar página RelatoriosPage.tsx com tabs Cohort, Produtividade, Comparativo, Tendencias
Task 9: Criar componentes de tabela semanal (WeeklyReportTable, WeeklyComparativeTable, TrendChart)
Task 10: Adicionar rota /relatorios + Sidebar
Task 11: Scripts de validação SQL automatizados (comparar snapshot vs dados reais)
Task 12: Documentar tudo em docs/RELATORIOS-*.md
```

---

## 12. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Backfill de >20 semanas estourar timeout | Alta | Alto | Processar em batches de 4 semanas; usar cron SQL para orquestrar |
| Reprocessamento de cohort sobrecarregar banco | Média | Alto | Limitar a 1 semana por execução; fila com backoff; não reprocessar semanas >90 dias exceto manual |
| Divergência entre snapshot e dados reais | Média | Alto | Scripts de validação automáticos; alerta se diferença >1% |
| Tabela crescer muito (milhões de linhas) | Baixa | Médio | Schema tipado por módulo reduz volume por tabela. Partitionamento por `week_start` se necessário; arquivamento de semanas >2 anos |
| Complexidade de dimensões gerar combinatória enorme | Média | Médio | Limitar a 1 dimensão por snapshot + 'todos'; sub-dimensão opcional |
| Divergência entre snapshot e dados reais | Média | Alto | **Mitigado pelo schema tipado:** queries diretas nas tabelas por módulo são mais fáceis de auditar. Scripts de validação automáticos; alerta se diferença >1% |
| Reprocessamento manual de produtividade | Baixa | Médio | **Mitigado pelo status 'finalized':** semanas com >7 dias não reprocessam automaticamente. Reprocessamento manual requer mudança explícita de status |

---

> **Próximo passo:** Aprovar este plano e iniciar Task 1 (migration do schema).
