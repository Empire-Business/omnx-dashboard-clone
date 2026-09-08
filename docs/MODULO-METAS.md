# Módulo Metas

| Campo | Valor |
|-------|-------|
| **Documento** | MODULO-METAS.md |
| **Data** | 2026-03-23 |
| **Status** | ✅ Implementado |
| **Escopo** | Dashboard web `eb-dash2` + schema Supabase |

---

## Objetivo

O módulo `Metas` virou a **fonte central de verdade** para definição, acompanhamento e histórico de metas da operação.

Ele substitui a lógica espalhada em cards isolados por um domínio único com:
- catálogo de indicadores
- metas versionadas por vigência
- escopo explícito
- acompanhamento com status
- snapshots históricos

Regra de governança da V1:
- **somente o módulo `/metas` pode criar ou editar metas**
- painéis operacionais (`Tráfego`, `Pré-Vendas`, `Recuperação`) exibem metas em **modo leitura**

---

## O que existe na V1

### Módulo web

Rota: `/metas`

Abas:
- `overview` — visão executiva por área
- `tracking` — acompanhamento das metas preferenciais
- `registry` — cadastro e governança
- `history` — versões e snapshots

### Áreas suportadas

- `trafego`
  - `mql_count`
  - `cost_per_mql`
- `prevendas`
  - `agendamentos`
  - `response_time`
- `vendas`
  - `closed_count`
  - `conversion_rate` *(% de conversão de reuniões — escopo global + por closer)*
  - `closed_revenue`

---

## Modelo de dados

### `goal_metric_definitions`

Catálogo global de indicadores. Define:
- área
- chave do indicador
- modo de análise (`cohort` ou `produtividade`)
- unidade
- direção do alvo (`maximize` / `minimize`)
- tipo de tracking (`cumulative`, `snapshot`, `budget_capped`)
- `provider_key` usado pela engine frontend

### `goal_definitions`

Identidade lógica da meta por:
- `workspace`
- indicador
- escopo

Exemplos:
- meta global de MQL
- meta por SDR de agendamentos
- meta por closer de faturamento

### `goal_versions`

Cada alteração relevante vira uma nova versão com:
- `target_value`
- `period_start`
- `period_end`

Regras:
- não permite sobreposição para a mesma combinação lógica
- preserva histórico

### `goal_snapshots`

Registro periódico do acompanhamento:
- valor atual
- valor ideal
- projeção
- status
- payload resumido do cálculo

Na V1 os snapshots são gravados pelo frontend quando a meta vigente é calculada no módulo.

---

## Regras de cálculo

### Cohort vs produtividade

Cada indicador declara explicitamente seu modo:
- `cohort` — usa lógica de aquisição/período do lead
- `produtividade` — usa data do evento produzido no período

O módulo não deixa a meta ser distorcida por filtro visual de outras telas.

### Tráfego

- `mql_count`: usa dataset cohort de tráfego
- `cost_per_mql`: usa spend do Meta Ads + MQLs do período
- quando existe meta pareada de `mql_count` no mesmo escopo e vigência, o módulo calcula teto de gasto e `ideal-dia de custo`

### Pré-Vendas

- `agendamentos`: usa `data_agendamento_reuniao`
- `response_time`: usa RPC `get_sdr_avg_response_time`

### Vendas

- `closed_count`: usa `data_fechado`
- `closed_revenue`: usa `data_fechado` + `vendas_fechamento.valor_faturado`

---

## Compatibilidade com o legado e autoridade de escrita

O hook `useMetas` continua existindo para os cards antigos de Tráfego, Pré-Vendas e Recuperação, mas agora funciona como **adaptador legado somente leitura**:
- lê versões do novo domínio
- converte para o formato antigo (`tipo`, `referencia`, `valor`, `periodo_inicio`, `periodo_fim`)

Tabela legada ainda existente:
- `metas`

Uso atual:
- fonte de migração/backfill e compatibilidade
- suporte aos cards legados de acompanhamento, sem fluxo local de edição

---

## Arquivos principais

- `supabase/migrations/20260324110000_create_goals_module.sql`
- `eb-dash2/src/hooks/useGoalsModule.ts`
- `eb-dash2/src/lib/goals/service.ts`
- `eb-dash2/src/pages/goals/GoalsPage.tsx`
- `eb-dash2/src/hooks/useMetas.ts`

---

## Próximos passos naturais

- mover mais cards legados para consumir diretamente `useGoalsModule`
- adicionar permissões específicas do módulo `metas`
- criar jobs server-side para snapshots históricos e backfill
- expandir catálogo de indicadores por área sem redesenhar schema
