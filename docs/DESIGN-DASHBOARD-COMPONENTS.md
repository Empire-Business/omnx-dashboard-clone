# Design Dashboard Components — Guia de Replicacao

> **Criado em:** 2026-03-24
> **Objetivo:** Documentar os componentes visuais extraidos do redesign da pagina de Trafego para replicacao em outras paginas do dashboard.

---

## Paleta de Cores Semanticas para Dados

Alem do DS1 Silver Empire (cores base), o dashboard usa cores semanticas para dados:

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--data-success` | `#10B981` | Positivo, acima da meta |
| `--data-success-soft` | `rgba(16,185,129,0.10)` | Background suave positivo |
| `--data-warning` | `#F59E0B` | Atencao, perto do limite |
| `--data-warning-soft` | `rgba(245,158,11,0.10)` | Background suave atencao |
| `--data-danger` | `#EF4444` | Negativo, abaixo da meta |
| `--data-danger-soft` | `rgba(239,68,68,0.10)` | Background suave negativo |
| `--data-info` | `#3B82F6` | Neutro informativo |
| `--data-info-soft` | `rgba(59,130,246,0.10)` | Background suave info |

### Paleta de Graficos (24 cores)

Tokens `--chart-1` a `--chart-24` para graficos com multiplas series. Cores escolhidas para maximo contraste entre si. Cores atribuidas por hash deterministico do nome — mesmo label = mesma cor em qualquer grafico.

---

## Componentes Disponiveis

Todos em `eb-dash2/src/components/dashboard/`.

### SectionHeader

Cabecalho de secao com linha gold a esquerda.

```tsx
<SectionHeader
  title="Indicadores"
  description="Metricas do periodo selecionado"
  badge={<span>42</span>}  // opcional
/>
```

**Props:** `title` (obrigatorio), `description?`, `badge?`, `className?`

---

### KpiCard

Card compacto de KPI com icone inline, accent bar, e variante semantica.

```tsx
<KpiCard
  label="CPMQL"
  value="R$ 45,00"
  icon={DollarSign}
  loading={false}
  variant="success"       // default | success | warning | danger | highlight
  delta={{ value: "-12%", positive: true }}  // badge de variacao
  subValue="Meta: R$ 50"  // texto secundario
/>
```

**Variantes:**
- `default` — branco, accent bar ghost
- `highlight` — accent bar empire, icone empire
- `success` — fundo verde suave, accent bar verde
- `warning` — fundo ambar suave, accent bar ambar
- `danger` — fundo vermelho suave, accent bar vermelho

**Layout:** Accent bar (topo 2px) → Label + icone inline (topo) → Valor + delta → SubValue
**Tamanho:** `px-3.5 py-3`, valor `text-xl`, label `text-[11px]`. Grid recomendado: `xl:grid-cols-6` (max 6 por linha)

---

### DonutChart

Grafico donut SVG puro com legenda lateral.

```tsx
// Chart basico (clique abre leads)
<DonutChart
  title="MQLs por funil"
  data={[{ reason: "Webinar", count: 42 }, ...]}
  onSliceClick={(reason) => openModal(reason)}
/>

// Chart de criativos (clique abre anuncio no Meta Ads Manager)
<DonutChart
  title="MQLs por criativo"
  data={[{
    reason: "Nome do criativo",   // nome completo — exibido no tooltip (hover)
    count: 17,
    code: "CR-188",               // codigo curto — exibido na legenda em destaque
    previewUrl: "https://www.instagram.com/p/ABC123/",  // clique abre aqui (Meta API)
  }, ...]}
  onSliceClick={(reason) => openModal(reason)}  // usado apenas para itens SEM previewUrl
/>
```

**Interface do item de data:**
```typescript
{ reason: string; count: number; previewUrl?: string; code?: string }
```

**Features:**
- Donut 160x160px (nao pie) com centro mostrando total ou valor hovereado
- Legenda lateral com dots coloridos, labels e percentuais
- **"Ver mais"**: legenda mostra max 5 itens, com botao "Ver mais N" para expandir (e "Ver menos" para recolher)
- Hover: slice fica opaco, demais ficam transparentes
- **Click adaptativo:**
  - Item com `previewUrl` → abre a URL em nova aba (`window.open`)
  - Item sem `previewUrl` → chama `onSliceClick(reason)` para abrir modal de leads
- **`code`**: quando presente, exibe o codigo curto (ex: `CR-188`) na legenda em fonte semibold; o nome completo (`reason`) fica no tooltip nativo do browser (hover)
- Hint de rodape: "Clique para abrir o anuncio no Meta" se qualquer item tem `previewUrl`; "Clique para ver os leads" caso contrario
- Empty state: circulo tracejado + "Sem dados"

**Logica de URL para criativos (TrafegoTab e CriativosTab):**

URLs vêm de duas fontes consultadas em paralelo:
1. **`meta_ads_permalinks`** — tabela sincronizada pela edge function `sync-ad-permalinks` via Meta Marketing API
2. **`notion_creatives`** — fallback com `final_asset_url` (Google Drive) enquanto Meta não sincronizou

Prioridade de `previewUrl`:
1. `meta_ads_permalinks.instagram_permalink_url` — post real no Instagram ← preferencial
2. `meta_ads_permalinks.permalink_url` — post real no Facebook
3. `notion_creatives.final_asset_url` — Google Drive (fallback)
4. Sem URL → clique abre modal de leads normalmente

**Edge function de sync:** `sync-ad-permalinks` — roda diariamente às 02:00 BRT.
Endpoint Meta: `GET /v18.0/?ids=...&fields=creative{instagram_permalink_url,object_story_id}`

**Trigger manual (primeira carga):**
```bash
curl -X POST https://<PROJECT>.supabase.co/functions/v1/sync-ad-permalinks \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"request_source":"manual"}'
```

**Migration:** `20260324170000_create_meta_ads_permalinks.sql`

---

### FunnelViz

Funil horizontal de conversao com cards de altura uniforme.

```tsx
<FunnelViz
  steps={[{ label: "Leads", count: 100, stepPct: null, totalPct: 100, onClick: () => {} }, ...]}
  loading={false}
/>
```

**Features:**
- Grid com colunas iguais (`grid-cols-N` dinamico) — **altura fixa 88px**
- Cores em gradiente (empire → gold)
- Barra proporcional fina (1px) no rodape de cada card
- % total + % conversao em linha unica compacta
- Click em cada etapa abre modal

---

### FilterBar

Barra de filtros completa com toggle Cohort/Produtividade.

```tsx
<FilterBar
  filters={filters}
  setFilters={setFilters}
  filterOptions={filterOptions}
  activePreset={activePreset}
  setActivePreset={setActivePreset}
  activePanel={activePanel}
  setActivePanel={setActivePanel}
  syncStatus={syncStatus}
  refreshSyncStatus={refreshSyncStatus}
  filtersOpen={filtersOpen}
  setFiltersOpen={setFiltersOpen}
  missingCampaignMapping={false}
  loading={false}
  presets={PRESETS}
/>
```

**Features:**
- Header compacto quando fechado (mostra resumo dos filtros)
- Toggle Cohort/Produtividade integrado (segmented control)
- Date presets como pills
- Dropdowns agrupados em linha
- MQL filter como segmented control
- SyncBanner integrado como footer

---

### CohortMatrix

Tabela cohort com celulas coloridas por performance.

**Props:** `rows`, `avgConectados/Agendados/Reuniao/Fechados`, `totals`, `metaSpend`, `loading`, `paymentDateMap`, `onOpenModal`

**Features:**
- Header sticky com fundo mist
- Primeira coluna sticky (scroll horizontal)
- Celulas com cores semanticas (success/warning/danger soft)
- Footer com medias % e custo por etapa
- Click em celula → modal com leads

---

### ProdutividadeMatrix

Tabela de produtividade (mesma estrutura visual da Cohort).

**Props:** `rows`, `totals`, `loading`, `error`, `onOpenModal`

---

### OriginTrendChart

Gráfico de múltiplas linhas com a evolução **dia a dia** por origem (visual inspirado no gráfico de alcance do Instagram).

**Localização:** `eb-dash2/src/components/dashboard/OriginTrendChart.tsx`

**Props:** `title`, `subtitle?`, `dates` (YYYY-MM-DD ordenadas), `series` (`TrendSeries[]`), `metric`, `onMetricChange`, `valueFormatter?`, `onPointClick?`, `emptyMsg?`

**Features:**
- Uma linha por origem, curva suave (Catmull-Rom → Bézier), eixo X no formato `1 de jul`, 3 marcas no eixo Y e sem eixo Y desenhado.
- Hover em qualquer dia: linha vertical + tooltip com **todas as séries visíveis daquele dia** (ordenadas por valor) e o total do dia.
- Legenda no rodapé com o total de cada série: clique oculta/mostra, duplo clique isola, "Ver todas" reseta.
- Cabeçalho mostra o total do período da métrica ativa e sinaliza quando há série oculta.
- `onPointClick(serieLabel, date, leads, metricLabel)` para drill-down em `LeadListModal`.
- **Cada série recebe os pontos já alinhados a `dates`** (mesmo índice = mesmo dia); a agregação por data do evento é responsabilidade da página.

---

### MediaBreakdownCard

Detalhamento por mídia (`contatos.utm_medium`): bio, direct, stories etc.

**Localização:** `eb-dash2/src/components/dashboard/MediaBreakdownCard.tsx`

**Props:** `title`, `subtitle?`, `data` (`{reason, count, leads}[]`), `valueFormatter?`, `onRowClick?`, `origins?`, `selectedOrigin?`, `onOriginChange?`, `emptyMsg?`

**Features:**
- Barras horizontais com valor, % do total e cor via `getLabelColor`.
- Seletor opcional de origem (`ALL_ORIGINS` = "Todas as origens").
- Clique na linha abre os leads daquela mídia.

---

### CriativosTab (Ranking de Criativos)

Tabela completa de performance por criativo. Cada linha = um criativo (CR-XXX).

**Localização:** `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`

**Métricas por criativo:** Investimento, Faturamento, Caixa, MQL, CPMQL, Vendas, CPV.

**Features:**
- **Código clicável:** `CR-XXX` vira link com `ExternalLink` quando `previewUrl` disponível via `meta_ads_permalinks`. Sem URL: texto simples.
- **Botão "Só com MQL":** ativo por padrão — filtra criativos com `mql = 0` para análise limpa de CPMQL. Contador mostra quantos foram ocultados.
- Ordenação por qualquer coluna (clique no header → alterna asc/desc). **Regra:** leia `sortKey` do closure, nunca chame `setSortDir` dentro do updater do `setSortKey`.
- Popover "Colunas" para mostrar/esconder e reordenar — preferências em `localStorage` (`eb-dash2:criativos-tab:columns`).
- Full screen via `createPortal`.
- Drill-down: clique em MQL ou Vendas abre `LeadListModal`.
- Respeita toggle Cohort/Produtividade e filtros da FilterBar.
- Apenas criativos com investimento > 0 no período.

---

## Layout Pattern para Paginas de Dashboard

Ordem recomendada das secoes:

1. **FilterBar** — Filtros + toggle + sync (sempre no topo)
2. **KPI Grid** — Indicadores compactos (investimento → resultado → eficiencia)
3. **FunnelViz** — Funil de conversao (logo apos KPIs para scanabilidade)
4. **Meta Tracking** — Acompanhamento de metas (se aplicavel)
5. **Segmentacao** — DonutCharts em grid 2x2
6. **Matriz** — Cohort ou Produtividade (conforme toggle)

**Espacamento:** `space-y-5` entre secoes.

Cada secao comeca com `<SectionHeader>` seguido de `<div className="mt-3">`.

---

## Regras de Estilo

1. **Cards KPI:** `rounded-lg border px-3 py-2.5` — compactos, accent bar 2px no topo
2. **Cards secao:** `rounded-lg border border-[var(--ghost)] bg-white` — borda ghost
3. **Hover em cards:** `hover:shadow-sm hover:-translate-y-px transition-all duration-150`
4. **Labels:** `text-[10px] font-semibold uppercase tracking-wider text-[var(--steel)]`
5. **Valores KPI:** `font-display text-xl font-bold leading-none tracking-tight tabular-nums`
6. **Icones em KPI:** Lucide React, `h-3 w-3` inline com label (sem box)
7. **Tabelas:** `rounded-lg border border-[var(--ghost)] overflow-hidden`, header com `bg-[var(--mist)]`
8. **Textos secundarios:** `text-[var(--steel)]`, nunca `text-[var(--platinum)]` em fundo claro
9. **Donut:** 160x160px SVG, legenda lateral com `text-xs`, max 5 itens visiveis + "Ver mais"
