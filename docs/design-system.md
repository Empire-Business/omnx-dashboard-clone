# DS1 — Silver Empire · Design System
**Version:** 3.0 — Dashboard Edition
**Classification:** Editorial Cold — Institutional Power — Data Dashboard
**Stack:** Vite + React 18 + Tailwind v3 + CSS Custom Properties
**Referencia viva:** Aba Trafego (`eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`)

---

## Indice

1. [Filosofia](#1-filosofia)
2. [Paleta de Cores](#2-paleta-de-cores)
3. [Cores Semanticas de Dados](#3-cores-semanticas-de-dados)
4. [Paleta de Graficos](#4-paleta-de-graficos)
5. [Tipografia](#5-tipografia)
6. [Espacamento](#6-espacamento)
7. [Bordas e Raios](#7-bordas-e-raios)
8. [Sombras e Elevacao](#8-sombras-e-elevacao)
9. [Movimento e Animacao](#9-movimento-e-animacao)
10. [Componentes do Dashboard](#10-componentes-do-dashboard)
11. [Layout e Grid](#11-layout-e-grid)
12. [Texturas e Efeitos Visuais](#12-texturas-e-efeitos-visuais)
13. [Regras de Contraste](#13-regras-de-contraste)
14. [Anti-Patterns](#14-anti-patterns)
15. [Tokens CSS Completos](#15-tokens-css-completos)

---

## 1. Filosofia

### Nome do Sistema
**DS1 — Silver Empire**
*The Architecture of Authority*

### DNA Visual
Sistema editorial frio e institucional. O poder vem da contenção — espaço negativo generoso, hierarquia tipografica disciplinada, e ouro usado com tanta parcimonia que comanda atencao justamente por ser raro.

### Referencias Esteticas
| Referencia | O que Emprestamos |
|------------|-------------------|
| Bloomberg Terminal | Densidade de dados, labels mono, contraste severo |
| FT Weekend | Voz editorial, background marfim |
| McKinsey Reports | Autoridade pelo espaco em branco |
| Vercel | Paineis navy, texto platinum, minimalismo cirurgico |
| Linear | Precisao de motion, bordas ghost, backgrounds mist |

### Tres Principios

**1. Poder pelo Vazio**
Espaco negativo nao e ausencia — e presenca. Layouts premium sao 70%+ vazios. Resista ao impulso de preencher.

**2. Tipografia como Estrutura**
A hierarquia tipografica dita a narrativa antes do usuario ler uma palavra. A fonte e a arquitetura.

**3. Ouro com Parcimonia**
O ouro aparece onde o olho deve pousar. Nunca decorativo. Sempre intencional. Usos permitidos: labels eyebrow, linhas separadoras de secao, dots de badge, accent line no SectionHeader. Em nenhum outro lugar.

---

## 2. Paleta de Cores

### Paleta Bruta (Raw Palette)

| Token | Hex | Papel |
|-------|-----|-------|
| `--void` | `#070C14` | Escuro absoluto — base de sombras, nunca como background de componente |
| `--empire` | `#0D1829` | Navy escuro — sidebar, botao primario, texto de destaque |
| `--steel` | `#243B55` | Azul medio — texto secundario, subtexto, labels, icones default |
| `--platinum` | `#BFC5CC` | Cinza quente — **SOMENTE em backgrounds escuros** (sidebar). Proibido em light. |
| `--gold` | `#C9A240` | Ouro amber — unico accent do sistema |
| `--bone` | `#F2EFE8` | Off-white quente — background principal da pagina |
| `--ink` | `#1A1F2E` | Quase-preto — texto primario em light backgrounds |
| `--ghost` | `#E4E2DC` | Cinza claro quente — bordas, divisores |
| `--mist` | `#F7F6F2` | Quase-branco — background de secoes, hover states, inputs |
| `--white` | `#FFFFFF` | Branco puro — background de cards |
| `--danger` | `#8B2E2E` | Carmim — erros e acoes destrutivas |

### Aliases Semanticos

| Alias | Resolve Para | Uso |
|-------|-------------|-----|
| `--bg-primary` | `--bone` | Background default da pagina |
| `--bg-inverse` | `--empire` | Background de secoes/paineis escuros (sidebar) |
| `--text-primary` | `--ink` | Texto legivel primario |
| `--text-inverse` | `--platinum` | Texto em backgrounds escuros |
| `--accent` | `--gold` | Accent dourado — todo uso de accent |
| `--border` | `--ghost` | Cor default de bordas e divisores |

### Pareamentos por Contexto

| Camada | Background | Texto | Borda |
|--------|------------|-------|-------|
| Pagina | `--bone` | `--ink` | `--ghost` |
| Card | `--white` | `--ink` | `--ghost` |
| Input / Field | `--mist` | `--ink` | `--ghost` |
| Secao alternativa | `--mist` | `--ink` | `--ghost` |
| Subtexto | — | `--steel` | — |
| Labels / Eyebrow | — | `--gold` | — |
| Sidebar (dark) | `--empire` | `--platinum` | `rgba(255,255,255,0.08)` |

---

## 3. Cores Semanticas de Dados

Usadas em KPI cards, graficos, badges e indicadores de status.

| Token | Hex | Uso |
|-------|-----|-----|
| `--data-success` | `#10B981` | Verde — acima da meta, positivo |
| `--data-success-soft` | `rgba(16,185,129,0.10)` | Fundo suave verde (badges) |
| `--data-warning` | `#F59E0B` | Amber — atencao, perto do limite |
| `--data-warning-soft` | `rgba(245,158,11,0.10)` | Fundo suave amber |
| `--data-danger` | `#EF4444` | Vermelho — abaixo da meta, negativo |
| `--data-danger-soft` | `rgba(239,68,68,0.10)` | Fundo suave vermelho |
| `--data-info` | `#3B82F6` | Azul — informacional neutro |
| `--data-info-soft` | `rgba(59,130,246,0.10)` | Fundo suave azul |

### Regra de Aplicacao nos KPI Cards

O card **sempre tem fundo branco** (`bg-white`) e borda padrão (`border-[var(--ghost)]`). Quem muda de cor e:
- **Texto do valor** (verde/amber/vermelho)
- **Icone** (acompanha a cor do valor)
- **Accent line** (barra de 2px no topo do card)

Nunca o background do card. Isso mantem visual limpo e uniforme.

### Texto de Status em Backgrounds Claros

Para texto legivel de status em backgrounds claros, usar versoes mais escuras:
- Success: `#2D7D4A` (verde 700)
- Warning: `#8B6A1A` ou `#92400E` (amber 800)
- Danger: `#B91C1C` (vermelho 700)

---

## 4. Paleta de Graficos

24 cores distintas para series de dados em DonutCharts e graficos multi-serie. Paleta expandida de 12 para 24 para minimizar colisoes de hash entre labels com prefixos similares.

| Token | Hex | Cor |
|-------|-----|-----|
| `--chart-1` | `#3B82F6` | Azul |
| `--chart-2` | `#10B981` | Verde |
| `--chart-3` | `#F59E0B` | Amber |
| `--chart-4` | `#8B5CF6` | Roxo |
| `--chart-5` | `#EF4444` | Vermelho |
| `--chart-6` | `#06B6D4` | Ciano |
| `--chart-7` | `#EC4899` | Rosa |
| `--chart-8` | `#84CC16` | Lima |
| `--chart-9` | `#F97316` | Laranja |
| `--chart-10` | `#6366F1` | Indigo |
| `--chart-11` | `#14B8A6` | Teal |
| `--chart-12` | `#E11D48` | Rose |
| `--chart-13` | `#7C3AED` | Violet |
| `--chart-14` | `#0D9488` | Teal escuro |
| `--chart-15` | `#DB2777` | Pink |
| `--chart-16` | `#C2410C` | Orange-red |
| `--chart-17` | `#D97706` | Amber escuro |
| `--chart-18` | `#9333EA` | Purple |
| `--chart-19` | `#DC2626` | Red |
| `--chart-20` | `#0891B2` | Cyan escuro |
| `--chart-21` | `#4F46E5` | Indigo escuro |
| `--chart-22` | `#0F766E` | Teal profundo |
| `--chart-23` | `#BE185D` | Pink escuro |
| `--chart-24` | `#047857` | Emerald |

Slices de donut usam stroke branco de 2px entre si.

**Sistema de cores deterministicas por label:** Cores sao atribuidas por hash do nome do label (SDR, campanha, etc), nao por indice. Isso garante que o mesmo "@odavilouback" recebe a mesma cor em qualquer grafico do dashboard. Implementado em `src/lib/utils/colors.ts` → `getLabelColor(label)`. Probabilidade de colisao com 24 cores: ~4% para 19 labels.

---

## 5. Tipografia

### Fonte Unica

Todas as funcoes tipograficas usam **Inter** como fonte unica:
```css
--font-display: 'Inter', system-ui, sans-serif;
--font-body:    'Inter', system-ui, sans-serif;
--font-mono:    'Inter', system-ui, sans-serif;
```

Pesos disponiveis: 300, 400, 500, 600, 700.

### Escala de Tipos

| Token | Tamanho | Uso no Dashboard |
|-------|---------|------------------|
| `--text-11` | 11px | Labels de KpiCard (uppercase), badges, legend percentages |
| `--text-13` | 13px | Nav links, captions, descricoes de secao |
| `--text-16` | 16px | Corpo base, inputs |
| `--text-20` | 20px | Valores de KpiCard (`text-xl`), contagens do funil |
| `--text-28` | 28px | Titulos de cards grandes |
| `--text-40` | 40px | Subtitulos de secao, hero % do MetaTrackingCard (`text-4xl`) |
| `--text-56` | 56px | Titulos de secao (H2) |
| `--text-80` | 80px | Numeros metricas em cards especiais |
| `--text-120` | 120px | Numeros hero de paineis de metricas |

### Usos de Peso por Componente

| Peso | Onde |
|------|------|
| 300 | Texto manifesto, headings sutis |
| 400 | Corpo padrao, celulas de tabela |
| 500 | Nav links, labels de form, section labels, badges |
| 600 | Botoes, nav CTA, titulos de card (`font-semibold`) |
| 700 | Valores de KPI (`font-bold`), contagens, titulos hero |

### Letter-Spacing

| Contexto | Valor |
|----------|-------|
| Display hero (120px+) | `-0.04em` |
| Titulos de secao | `-0.02em` |
| Valores de KPI | `tracking-tight` (-0.025em) |
| Eyebrow labels (KpiCard) | `tracking-wider` (+0.05em) |
| Meta labels | `tracking-widest` (+0.1em) |
| Mono labels de secao | `+0.18em` a `+0.20em` |
| Corpo | `0` (default) |

### Line-Height

| Contexto | Valor |
|----------|-------|
| Display headings | `1.0` (`leading-none`) |
| Valores de KPI | `1.0` (`leading-none`) |
| Card titles | `1.2` |
| Section subtitles | `1.6` |
| Corpo | `1.6` a `1.7` (`leading-relaxed`) |

---

## 6. Espacamento

Escala **base-4** via CSS custom properties:

| Token | Valor | Uso Tipico |
|-------|-------|------------|
| `--s4` | 4px | Micro gap, margin de dot |
| `--s8` | 8px | Gap de icone, stack apertado |
| `--s12` | 12px | Gaps pequenos |
| `--s16` | 16px | Gap padrao, spacing de form group |
| `--s24` | 24px | Sub-secoes de card |
| `--s32` | 32px | Padding de card, spacing de grupo |
| `--s48` | 48px | Padding lateral de container |
| `--s64` | 64px | Margin-bottom de section header |
| `--s96` | 96px | Padding vertical de secao |
| `--s128` | 128px | Layouts oversized |

### Espacamento Real nos Componentes

| Componente | Padding | Gap |
|------------|---------|-----|
| KpiCard | `px-3.5 py-3` (14px x 12px) | Label/icon: `gap-1.5` |
| DonutChart | `p-5` (20px) | Interno: `mb-4` entre titulo e conteudo |
| FunnelViz step | `px-2 py-3` (8px x 12px) | Grid: `gap-1.5` |
| FilterBar header | `px-5 py-3` (20px x 12px) | — |
| FilterBar content | `px-5 py-4` (20px x 16px) | `space-y-3` |
| MetaTrackingCard | `p-4` (16px) | `space-y-3` |
| Secoes do TrafegoTab | — | `space-y-5` (20px entre secoes) |
| Grid de KPIs | — | `gap-2.5` (10px) |
| Grid de Donuts | — | `gap-3` (12px) |

---

## 7. Bordas e Raios

### Tokens de Raio

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 3px | Botoes, badges, inputs pequenos |
| `--radius-md` | 6px | Cards pequenos, swatches, toast |
| `--radius-lg` | 12px | Cards principais, paineis, wrappers de tabela |

### Uso Real no Dashboard

| Componente | Raio |
|------------|------|
| KpiCard | `rounded-lg` (12px) |
| DonutChart | `rounded-xl` (16px) |
| FunnelViz step | `rounded-lg` (12px) |
| MetaTrackingCard | `rounded-lg` (12px) |
| FilterBar | `rounded-xl` (16px) |
| Botoes/toggles | `rounded-lg` (12px) ou `rounded-md` (6px) |
| Badges | `rounded` (4px) |
| Color squares (legend) | `rounded-sm` (2px) |

### Bordas

Borda padrao de todos os cards: `border border-[var(--ghost)]` (1px, cor `#E4E2DC`).

Variantes de borda:
- Default: `border-[var(--ghost)]`
- Highlight: `border-[var(--empire)]/15` (navy com 15% opacity)
- Hover: `border-[var(--steel)]/40` (mais escura)

---

## 8. Sombras e Elevacao

Cor da sombra sempre derivada de `--void` (`rgba(7,12,20,…)`), nunca preto puro.

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | `0 1px 3px rgba(7,12,20,0.08), 0 1px 2px rgba(7,12,20,0.04)` | Hover de KpiCard, hover de FunnelViz step |
| `--shadow-md` | `0 4px 16px rgba(7,12,20,0.10), 0 2px 6px rgba(7,12,20,0.06)` | Hover de botao, toast |
| `--shadow-lg` | `0 16px 48px rgba(7,12,20,0.14), 0 6px 16px rgba(7,12,20,0.08)` | Hover de stat-card, modais |
| `--shadow-xl` | `0 32px 80px rgba(7,12,20,0.20), 0 12px 32px rgba(7,12,20,0.12)` | Paineis hero |
| Gold glow | `0 8px 24px rgba(201,162,64,0.3)` | Excecao unica para accent dourado |

### Padrao de Elevacao no Dashboard

- **Repouso:** Sem sombra (apenas borda `ghost`)
- **Hover:** `hover:shadow-sm hover:-translate-y-px` (1px de lift com sombra sutil)
- **Modais/Drawers:** `shadow-lg`
- **Duracao da transicao:** `transition-all duration-150`

---

## 9. Movimento e Animacao

### Curvas de Easing

| Token | Valor | Quando Usar |
|-------|-------|-------------|
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1.0)` | Elementos entrando, page reveals |
| `--ease-in-out` | `cubic-bezier(0.4, 0.0, 0.2, 1.0)` | Cross-fades, mudancas de estado |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1.0)` | Press de botao, hover lift de card |

### Duracoes

| Token | Valor | Quando Usar |
|-------|-------|-------------|
| `--duration-fast` | 150ms | Hover de cor/bg, transicoes rapidas |
| `--duration-base` | 280ms | Transicoes padrao de UI |
| `--duration-slow` | 500ms | Transicoes de elementos grandes, barra do funil |
| `--duration-slower` | 800ms | Scroll reveals, entrada de pagina |

### Animacoes Pre-Definidas

| Classe | Animacao | Uso |
|--------|----------|-----|
| `.animate-fade-in-up` | Y 12px→0 + opacity | Entrada da pagina (0.4s) |
| `.animate-fade-in` | Opacity 0→1 | Fades padrao (0.3s) |
| `.animate-scale-in` | Scale 0.95→1 + opacity | Entrada com escala (0.2s) |
| `.funnel-stage` | X -8px→0 + opacity | Cards do funil, staggered (0.5s, delay 80ms * index) |
| `.funnel-arrow` | X -8px→0 + opacity | Setas do funil (0.4s, delay 80ms * index + 200ms) |
| `.reveal` + `.visible` | Y 32px→0 + opacity | Scroll reveal (0.8s) |
| `.reveal-delay-N` | — | Stagger de 80ms por passo (1-5) |

### Interacoes Micro no Dashboard

| Componente | Efeito |
|------------|--------|
| KpiCard hover | `shadow-sm` + `-translate-y-px` (150ms) |
| DonutChart slice hover | Opacity: slice=1, outros=0.3 (120ms ease) |
| FunnelViz barra | Width animada: `transition-[width] duration-500 ease-out` |
| MetaTrackingCard progress bar | Width animada com `transition-all` |
| Toggles (Cohort/Prod) | `transition-all` na mudanca de estado |

---

## 10. Componentes do Dashboard

### SectionHeader

Cabecalho de secao com accent dourado lateral.

```
Layout: flex items-start justify-between gap-4
├── Accent line: w-0.5 h-5 rounded-full bg-[var(--gold)]
├── Title: text-sm font-semibold tracking-tight text-[var(--ink)]
├── Description: text-xs text-[var(--steel)] leading-relaxed (mt-0.5)
└── Badge slot (opcional): children alinhado a direita
```

### KpiCard

Card compacto de indicador numerico com 5 variantes.

**Estrutura:**
```
div.rounded-lg.border.px-3.5.py-3
├── Accent line: absolute top-0, h-[2px], cor varia por variant
├── Label row: flex items-center gap-1.5 mb-2
│   ├── Icon: h-3.5 w-3.5
│   └── Label: text-[11px] font-semibold uppercase tracking-wider text-steel
├── Value: font-display text-xl font-bold leading-none tracking-tight tabular-nums
├── Delta badge (opcional): text-[10px] font-bold px-1 py-px rounded
├── SubValue (opcional): text-[10px] text-steel mt-1.5
└── SubText (opcional): text-[9px] text-steel/60 mt-px
```

**Variantes:**

| Variant | Card BG | Borda | Icon | Valor | Accent Line |
|---------|---------|-------|------|-------|-------------|
| `default` | `bg-white` | `border-ghost` | `text-steel` | `text-ink` | `bg-ghost` |
| `highlight` | `bg-white` | `border-empire/15` | `text-empire` | `text-empire` | `bg-empire` |
| `success` | `bg-white` | `border-ghost` | `text-data-success` | `text-data-success` | `bg-data-success` |
| `warning` | `bg-white` | `border-ghost` | `text-#92400E` | `text-#92400E` | `bg-data-warning` |
| `danger` | `bg-white` | `border-ghost` | `text-data-danger` | `text-data-danger` | `bg-data-danger` |

**Regra critica:** O background do card e **sempre branco**. Quem comunica status e o texto + icone + accent line.

### DonutChart

Grafico de rosca SVG com legenda lateral.

**SVG:** viewBox 160x160, raio externo 72px, raio interno 44px.
**Container:** `p-5 rounded-xl border border-ghost bg-white`
**Renderizado em:** `h-40 w-40` (160px)
**Interacao:** Hover muda opacidade (slice=1, outros=0.3). Click dispara callback.
**Estado vazio:** Circulo tracejado + "Sem dados"
**Legenda:** Max 5 itens visiveis, toggle "Ver mais/menos". Color square `h-2.5 w-2.5 rounded-sm`.
**Centro:** Mostra total ou valor/percentual do slice em hover.

### FunnelViz

Funil horizontal com barras proporcionais.

**Grid:** `grid-template-columns: repeat(N, 1fr)`, `gap-1.5`, cards de `h-[88px]`
**Step card:**
```
div.rounded-lg.border.border-ghost.bg-white.px-2.py-3
├── Label: text-[9px] font-semibold text-steel uppercase tracking-wider (centered)
├── Count: text-xl font-bold text-ink tabular-nums (centered)
├── Bar: h-1 w-full rounded-full bg-ghost/50
│   └── Fill: largura proporcional, cor do gradiente por etapa
└── Percentages: text-[9px] total% (cinza) + step% (colorido, semibold)
```

**Cores do gradiente por etapa (6 tons):** empire → steel → gold (interpolados)
**Loading:** 6 skeletons pulsantes (`h-[88px] rounded-lg bg-mist animate-pulse`)

### MetaTrackingCard

Card de acompanhamento de metas (MQLs + Custo/MQL).

**Container:** `border border-ghost bg-white rounded-lg p-4 space-y-3`
**Header:** Accent line dourada (`w-0.5 h-4 rounded-full bg-gold`) + label eyebrow (`text-[10px] font-semibold uppercase tracking-widest text-steel`)
**Layout:** Duas colunas em `lg:flex-row`, separador `border-t lg:border-l`
**MQL Progress:** Hero % (`text-4xl font-bold`, cor dinamica) + progress bar (`h-2 rounded-full bg-mist`)
**Mini gráfico de barras:** SVG 600x80, barras coloridas (verde se >= ideal, amber se abaixo), linha ideal tracejada em dourado

### FilterBar

Painel colapsavel de filtros.

**Fechado:** Flex row com icone `SlidersHorizontal`, label, pills de filtros ativos
**Aberto:** Border-top + `px-5 py-4 space-y-3`
**Toggle Cohort/Produtividade:** Controle segmentado. Ativo: `bg-empire text-white shadow-sm`. Inativo: `text-steel hover:text-ink`
**Date presets:** Pills com mesmo estilo do toggle
**Inputs de data:** `h-8 rounded-lg border border-ghost px-3 text-xs`
**Dropdowns dimensionais:** `h-8 rounded-lg border border-ghost px-3 text-xs`
**Texto explicativo:** `text-[11px] leading-relaxed text-steel bg-mist rounded-lg px-3 py-2`

---

## 11. Layout e Grid

### Estrutura da Aba Trafego

```
div.space-y-5
├── Secao 1: Indicadores
│   ├── SectionHeader ("Indicadores", descricao cohort/prod)
│   └── Grid KPIs: grid-cols-2 gap-2.5 | sm:3 | lg:4 | xl:6
│       └── 11 KpiCards
├── Secao 2: Funil
│   ├── SectionHeader ("Funil de Conversao")
│   └── FunnelViz (6 etapas, colunas dinamicas)
├── Secao 3: Metas
│   └── MetaTrackingCard (MQL + Custo lado a lado)
├── Secao 4: Segmentacao
│   ├── SectionHeader ("Segmentacao")
│   └── Grid Donuts: grid-cols-1 gap-3 | lg:2
│       ├── DonutChart (MQLs por funil)
│       ├── DonutChart (MQLs por canal)
│       ├── DonutChart (Vendas por funil)
│       └── DonutChart (Vendas por canal)
└── LeadListModal (condicional)
```

### Estrutura da Pagina Dashboard

```
div.space-y-6.animate-fade-in-up
├── Header da pagina
│   ├── .section-label (eyebrow dourado com linha)
│   ├── H1: text-4xl text-gold-gradient
│   └── Descricao: text-sm muted-foreground
├── FilterBar (colapsavel)
├── Tab navigation (icone + label, ativo: border-gold text-ink)
└── Conteudo da tab ativa (TrafegoTab | MatrizTab)
```

### Breakpoints Responsivos

| Breakpoint | Largura | Grid KPIs | Grid Donuts |
|------------|---------|-----------|-------------|
| Default (mobile) | < 640px | 2 colunas | 1 coluna |
| `sm:` | >= 640px | 3 colunas | 1 coluna |
| `lg:` | >= 1024px | 4 colunas | 2 colunas |
| `xl:` | >= 1280px | 6 colunas | 2 colunas |

---

## 12. Texturas e Efeitos Visuais

### Film Grain
Overlay SVG fixo no `body::before` com `opacity: 0.025`. Textura fractal noise. Nao interativo (`pointer-events: none`).

### Gradiente Dourado (texto)
```css
.text-gold-gradient {
  background: linear-gradient(135deg, #C9A240 0%, #e4c97a 50%, #C9A240 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```
Uso: Titulo H1 da pagina Dashboard.

### Section Label (Eyebrow Editorial)
```css
.section-label {
  font-size: 11px;
  color: var(--gold);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.section-label::before {
  width: 24px; height: 1px;
  background: var(--gold);
}
```

### Dark Glass (sidebar/dark contexts)
```css
.dark-glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Stat Card (hover accent)
```css
.stat-card {
  border-left: 3px solid transparent;
}
.stat-card:hover {
  border-left-color: var(--gold);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}
```

---

## 13. Regras de Contraste

### PROIBIDO em Light Backgrounds

`--platinum` (`#BFC5CC`) tem contraste **1.6:1** contra branco — **ilegivel**. Usar exclusivamente na sidebar/dark contexts.

### Texto Legivel em Light Backgrounds

| Funcao | Token | Contraste vs Branco |
|--------|-------|---------------------|
| Texto primario | `--ink` (#1A1F2E) | 16.4:1 |
| Texto secundario | `--steel` (#243B55) | 9.8:1 |
| Labels eyebrow | `--gold` (#C9A240) | 2.9:1 (ok para 11px uppercase bold) |

### Regra de Status no KpiCard

Cards de status (success/warning/danger) usam fundo branco + texto colorido. O texto do valor carrega a semantica, nao o background. Isso garante:
- Visual limpo e uniforme no grid
- Leitura facil em qualquer variant
- Accent line no topo como pista visual secundaria

---

## 14. Anti-Patterns

| Nao Faca | Faca Isso |
|----------|-----------|
| Background colorido em KpiCard de status | Fundo branco, texto/icone colorido |
| `--platinum` como texto em light bg | Use `--steel` ou `--ink` |
| Sombra com preto puro (`rgba(0,0,0,…)`) | Use void-tinted (`rgba(7,12,20,…)`) |
| Ouro como background de componente | Ouro so em linhas, labels, dots |
| Emojis como icones de UI | SVGs do Lucide Icons |
| `scale` no hover que desloca layout | `translateY(-1px)` com `shadow-sm` |
| Misturar fontes (Serif + Sans) | Inter puro em todo o sistema |
| `transition-all` sem duracao | Sempre `duration-150` ou token de duracao |
| Bordas invisiveis em light mode (`border-white/10`) | `border-[var(--ghost)]` |

---

## 15. Tokens CSS Completos

```css
:root {
  /* Raw palette */
  --void:     #070C14;
  --empire:   #0D1829;
  --steel:    #243B55;
  --platinum: #BFC5CC;
  --gold:     #C9A240;
  --bone:     #F2EFE8;
  --ink:      #1A1F2E;
  --ghost:    #E4E2DC;
  --white:    #FFFFFF;
  --mist:     #F7F6F2;
  --danger:   #8B2E2E;

  /* Semantic */
  --bg-primary:    var(--bone);
  --bg-inverse:    var(--empire);
  --text-primary:  var(--ink);
  --text-inverse:  var(--platinum);
  --accent:        var(--gold);
  --border:        var(--ghost);

  /* Typography */
  --font-display: 'Inter', system-ui, sans-serif;
  --font-body:    'Inter', system-ui, sans-serif;
  --font-mono:    'Inter', system-ui, sans-serif;

  /* Type scale */
  --text-11:  0.6875rem;
  --text-13:  0.8125rem;
  --text-16:  1rem;
  --text-20:  1.25rem;
  --text-28:  1.75rem;
  --text-40:  2.5rem;
  --text-56:  3.5rem;
  --text-80:  5rem;
  --text-120: 7.5rem;

  /* Spacing (base-4) */
  --s4:   0.25rem;
  --s8:   0.5rem;
  --s12:  0.75rem;
  --s16:  1rem;
  --s24:  1.5rem;
  --s32:  2rem;
  --s48:  3rem;
  --s64:  4rem;
  --s96:  6rem;
  --s128: 8rem;

  /* Motion */
  --ease-out:      cubic-bezier(0.0, 0.0, 0.2, 1.0);
  --ease-in-out:   cubic-bezier(0.4, 0.0, 0.2, 1.0);
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1.0);
  --duration-fast:   150ms;
  --duration-base:   280ms;
  --duration-slow:   500ms;
  --duration-slower: 800ms;

  /* Shadows (void-tinted) */
  --shadow-sm:  0 1px 3px rgba(7,12,20,0.08), 0 1px 2px rgba(7,12,20,0.04);
  --shadow-md:  0 4px 16px rgba(7,12,20,0.10), 0 2px 6px rgba(7,12,20,0.06);
  --shadow-lg:  0 16px 48px rgba(7,12,20,0.14), 0 6px 16px rgba(7,12,20,0.08);
  --shadow-xl:  0 32px 80px rgba(7,12,20,0.20), 0 12px 32px rgba(7,12,20,0.12);

  /* Data-semantic */
  --data-success:      #10B981;
  --data-success-soft:  rgba(16, 185, 129, 0.10);
  --data-warning:      #F59E0B;
  --data-warning-soft:  rgba(245, 158, 11, 0.10);
  --data-danger:       #EF4444;
  --data-danger-soft:   rgba(239, 68, 68, 0.10);
  --data-info:         #3B82F6;
  --data-info-soft:     rgba(59, 130, 246, 0.10);

  /* Chart palette (24 colors) */
  --chart-1:  #3B82F6;   --chart-13: #7C3AED;
  --chart-2:  #10B981;   --chart-14: #0D9488;
  --chart-3:  #F59E0B;   --chart-15: #DB2777;
  --chart-4:  #8B5CF6;   --chart-16: #C2410C;
  --chart-5:  #EF4444;   --chart-17: #D97706;
  --chart-6:  #06B6D4;   --chart-18: #9333EA;
  --chart-7:  #EC4899;   --chart-19: #DC2626;
  --chart-8:  #84CC16;   --chart-20: #0891B2;
  --chart-9:  #F97316;   --chart-21: #4F46E5;
  --chart-10: #6366F1;   --chart-22: #0F766E;
  --chart-11: #14B8A6;   --chart-23: #BE185D;
  --chart-12: #E11D48;   --chart-24: #047857;

  /* Radius */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 12px;
}
```
