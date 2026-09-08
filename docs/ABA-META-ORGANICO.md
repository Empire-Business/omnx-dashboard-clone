# Metas de MQL Orgânico — Especificação

> **Atualizado em:** 2026-04-10 BRT (v2 — aba dedicada com seletor de período)

Sistema de metas para o módulo Orgânico. Permite cadastrar metas individuais por canal orgânico e exibe o progresso em tempo real no módulo.

---

## Arquitetura

### Métrica no Catálogo

```sql
area_key:              'organico'
metric_key:            'mql_count'
metric_name:           'MQLs Orgânicos'
provider_key:          'organico.mql_count'
tracking_mode:         'cumulative'
analysis_mode:         'cohort'
date_basis:            'data_lead_recebido'
supported_scope_types: ['workspace', 'channel']
metadata.scope_source: 'organico'
```

`scope_type = 'channel'` → canal orgânico (`utm_source` de `utm_sources_plain`)  
`scope_type = 'workspace'` → meta global (tem precedência sobre soma dos canais)

---

## Como Cadastrar Metas

1. Acessar módulo **Metas**
2. Clicar em **Nova Meta**
3. **Área:** Orgânico
4. **Indicador:** MQLs Orgânicos
5. **Escopo:**
   - `Global` — meta total para todos os canais orgânicos
   - `Canal` → selecionar canal (Instagram, YouTube, Indicação, etc.)
6. **Alvo:** quantidade de MQLs desejada
7. **Período:** data de início e fim da vigência

### Meta Global Automática

Se não houver uma meta cadastrada com escopo `Global`, o sistema calcula:

```
meta_global = Σ(metas por canal)
```

Essa soma é calculada no frontend pelo hook `useOrganicoMeta`.

---

## Componentes

### `useOrganicoMetaTab()`

Hook em `eb-dash2/src/hooks/useOrganicoMetaTab.ts`.

Carrega **todos** os períodos de meta cadastrados (sem filtro de data). Sem dependências — roda uma vez por montagem.

```typescript
interface GoalPeriod {
  id: string           // "2026-04-01|2026-04-30"
  label: string        // "Abril 2026 · 01/04 → 30/04"
  startDate: string
  endDate: string
  globalTarget: number | null  // workspace target ou soma dos canais
  targetByChannel: Map<string, number>
}

interface OrganicoMetaTabData {
  periods: GoalPeriod[]  // ordenado do mais recente ao mais antigo
  loading: boolean
}
```

**Lógica de `globalTarget` por período:**
- Se existe versão com `scope_type='workspace'` → usa ela
- Senão → soma as versões por canal

---

### `useOrganicoMeta(startDate, endDate)`

Hook leve em `eb-dash2/src/hooks/useOrganicoMeta.ts`.

Usado pelo Engine de Metas (Goals module). Filtra versões que se sobrepõem ao período de datas passado. Não é mais usado em `OrganicoPage.tsx` — o seletor de período está dentro da `MetaOrganicoTab`.

---

### `MetaOrganicoTab`

Componente em `eb-dash2/src/pages/organico/tabs/MetaOrganicoTab.tsx`.

**Props:**
```typescript
interface MetaOrganicoTabProps {
  organicSourceSet: Set<string>          // do useOrganico — para filtrar leads orgânicos
  channelOptions: { value: string; label: string }[]  // para label amigável dos canais
}
```

**Comportamento:**
- Usa `useOrganicoMetaTab()` para obter todos os períodos cadastrados
- Auto-seleciona o período que contém "hoje" ou o mais recente
- Seletor de período: muda as datas do gráfico **sem afetar** o filtro global da página
- Seletor de canal: mostra apenas canais que têm meta cadastrada para o período selecionado
- Badge de estado: "Período atual" (verde) | "Encerrado" (cinza) | "Futuro" (cinza)
- Carrega oportunidades para o período selecionado de forma independente (query própria paginada)
- Filtra por `organicSourceSet` + canal selecionado (se houver)
- Renderiza `<OrganicoMqlGoalChart>`

**Estados:**
- Sem metas cadastradas: CTA para ir à aba Metas
- Loading: skeleton
- Período encerrado/futuro: gráfico mostra os dados históricos normalmente

---

### `OrganicoMqlGoalChart`

Componente em `eb-dash2/src/components/organico/OrganicoMqlGoalChart.tsx`.

**Props:**
```typescript
interface OrganicoMqlGoalChartProps {
  opps: OppRow[]           // já filtrados pelo canal ativo
  startDate: string
  endDate: string
  targetValue: number | null
  channelLabel?: string    // label amigável do canal selecionado
  loading: boolean
}
```

**Cálculos internos:**
- `mqlOpps = opps.filter(o => isMqlByTag(o.contatos))` — filtra apenas MQLs
- Agrupa por `data_lead_recebido.slice(0,10)`
- Constrói série cumulativa para todos os dias do período
- Ramp ideal: `idealAcumulado[i] = targetValue * (i+1) / totalDias`
- `neededPerDay = ceil((targetValue - totalReal) / daysRemaining)`

**Visualização (SVG 700×300, bezier curves):**
- Linha azul sólida + gradient fill: MQLs acumulados (real)
- Linha dourada tracejada: ramp ideal linear
- Hover tooltip: card escuro com data, acumulado, ideal e diário
- Crosshair ao hover
- Eixo Y com escala `niceMax()` e gridlines
- Marcador "hoje" como linha vertical tracejada
- 4 chips: Total Real | Meta | % Atingido | Ideal/dia

**Estados:**
- `targetValue = null`: CTA "Nenhuma meta cadastrada"
- `loading = true`: skeleton animado
- Sem dados: mensagem informativa

---

## Engine de Avaliação (Goals Module)

Em `eb-dash2/src/lib/goals/service.ts`:

```typescript
async function evaluateOrganicoMqlCount(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult>
```

- Carrega opps de `oportunidades` paginado (1000/página)
- Filtra pelo `organicSourceSet` (utm_source em `utm_sources_plain`)
- Se `scope_type = 'channel'`: filtra por `utm_source = scope_id`
- Conta MQLs por `isMqlByTag()`
- Usa `computeIdealDia()` para calcular ramp acumulado
- Retorna série, status, projeção e idealDailyValue

Cache: `caches.organico` por `period_start|period_end` — evita recarregar opps múltiplas vezes na mesma avaliação.

---

## Integração no OrganicoPage

Em `eb-dash2/src/pages/organico/OrganicoPage.tsx`:

```typescript
// Aba "meta" renderiza MetaOrganicoTab com organicSourceSet do useOrganico
// O seletor de período vive DENTRO da MetaOrganicoTab — independente do filtro global
{activeTab === 'meta' && (
  <MetaOrganicoTab
    organicSourceSet={organicSourceSet}
    channelOptions={channelOptions}
  />
)}
```

A `MetaOrganicoTab` gerencia seu próprio estado de período e carrega as oportunidades independente do filtro global de datas.

---

## Filtro de Canal na Aba Meta

O seletor de canal dentro de `MetaOrganicoTab`:
- Lista apenas canais que têm meta cadastrada para o período selecionado
- "Todos os canais" usa a `globalTarget` do período
- Canal específico usa `targetByChannel.get(selectedChannel)`
- `filteredOpps` são filtrados por `utm_source === selectedChannel` antes de ir ao gráfico

---

## Tabelas Relacionadas

| Tabela | Uso |
|--------|-----|
| `goal_metric_definitions` | Cadastro da métrica `organico.mql_count` |
| `goal_definitions` | Uma entrada por combinação workspace+canal |
| `goal_versions` | Target + período de vigência (sem sobreposição) |
| `utm_sources_plain` | Lista de canais orgânicos disponíveis para escopo |
| `oportunidades` + `contatos.tags` | Fonte de dados para contagem de MQLs |
