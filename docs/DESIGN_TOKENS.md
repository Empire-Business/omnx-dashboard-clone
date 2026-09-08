# OMNX Design System

> **Versão:** 1.0
> **Última Atualização:** Fevereiro 2026
> **Modo:** Dark Mode Only (Luxury Black & Gold)

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Cores da Marca](#cores-da-marca)
3. [Tokens de Cores (Dark Mode)](#tokens-de-cores-dark-mode)
4. [Tipografia](#tipografia)
5. [Sombras](#sombras)
6. [Glassmorfismo](#glassmorfismo)
7. [Animações](#animações)
8. [Utilitários de Componentes](#utilitários-de-componentes)
9. [Gradientes e Backgrounds](#gradientes-e-backgrounds)
10. [Tokens Semânticos](#tokens-semânticos)

---

## Visão Geral

O Design System da OMNX é construído sobre uma fundação de **HSL (Hue, Saturation, Lightness)** para permitir manipulação programática de cores. O sistema utiliza exclusivamente o **Dark Mode**, criando uma experiência premium com fundo preto e acentos em dourado.

### Princípios Fundamentais

- **Todas as cores são definidas em HSL** — nunca use RGB hex
- **Sombras dramáticas no dark mode** — profundidade e contraste
- **Glassmorfismo intenso** — Fluent Design com desfoque elevado
- **Dourado como cor primária** — CTAs e elementos principais
- **Azul escuro como secundário** — headers e ações secundárias

---

## Cores da Marca

Cores fundamentais que definem a identidade visual da OMNX.

| Token | HSL | Descrição | Uso |
|-------|-----|-----------|-----|
| `--empire-black` | `220 20% 4%` | Preto premium com toque azul | Fundo principal |
| `--empire-white` | `0 0% 100%` | Branco puro | Texto em destaque |
| `--empire-gray` | `220 10% 69%` | Cinza azulado | Texto secundário |
| `--empire-blue` | `210 53% 23%` | Azul escuro corporativo | Headers, secundário |
| `--empire-beige` | `40 30% 68%` | Bege elegante | Acentos sutis |
| `--empire-green` | `80 15% 41%` | Verde escuro | Sucesso, crescimento |
| `--empire-brown` | `25 40% 39%` | Marrom escuro | Terracota, warmth |
| `--empire-gold` | `43 74% 49%` | Dourado vibrante | **Primária, CTAs** |

### Exemplo de Uso

```css
.brand-primary {
  background-color: hsl(var(--empire-gold));
}

.brand-background {
  background-color: hsl(var(--empire-black));
}
```

---

## Tokens de Cores (Dark Mode)

O sistema utiliza tokens semânticos que mapeiam para as cores da marca.

### Cores Base

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--background` | `220 20% 4%` | ![#0a0c10](https://via.placeholder.com/20/0a0c10/ffffff?text=+) | Fundo principal da página |
| `--foreground` | `0 0% 98%` | ![#fafafa](https://via.placeholder.com/20/fafafa/000000?text=+) | Texto principal |

### Cards e Superfícies

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--card` | `220 15% 8%` | ![#14171c](https://via.placeholder.com/20/14171c/ffffff?text=+) | Cards, painéis |
| `--card-foreground` | `0 0% 98%` | ![#fafafa](https://via.placeholder.com/20/fafafa/000000?text=+) | Texto dentro de cards |
| `--popover` | `220 15% 10%` | ![#1a1d24](https://via.placeholder.com/20/1a1d24/ffffff?text=+) | Popovers, dropdowns |
| `--popover-foreground` | `0 0% 98%` | ![#fafafa](https://via.placeholder.com/20/fafafa/000000?text=+) | Texto em popovers |

### Cores Primárias

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--primary` | `43 74% 52%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | **Botões principais, CTAs** |
| `--primary-foreground` | `220 20% 4%` | ![#0a0c10](https://via.placeholder.com/20/0a0c10/ffffff?text=+) | Texto sobre primária |

### Cores Secundárias

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--secondary` | `210 45% 30%` | ![#1e3a5f](https://via.placeholder.com/20/1e3a5f/ffffff?text=+) | Headers, navegação secundária |
| `--secondary-foreground` | `0 0% 98%` | ![#fafafa](https://via.placeholder.com/20/fafafa/000000?text=+) | Texto sobre secundária |

### Cores de Estados

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--muted` | `220 15% 13%` | ![#1f232b](https://via.placeholder.com/20/1f232b/ffffff?text=+) | Fundos sutis, backgrounds |
| `--muted-foreground` | `220 10% 60%` | ![#8b919e](https://via.placeholder.com/20/8b919e/000000?text=+) | Texto secundário, labels |
| `--accent` | `43 74% 52%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | Acentos, highlights |
| `--accent-foreground` | `220 20% 4%` | ![#0a0c10](https://via.placeholder.com/20/0a0c10/ffffff?text=+) | Texto sobre accent |
| `--destructive` | `0 72% 51%` | ![#dc2626](https://via.placeholder.com/20/dc2626/ffffff?text=+) | Ações destructivas |
| `--destructive-foreground` | `0 0% 100%` | ![#ffffff](https://via.placeholder.com/20/ffffff/000000?text=+) | Texto sobre destrutiva |

### Bordas e Inputs

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--border` | `220 13% 18%` | ![#262c38](https://via.placeholder.com/20/262c38/ffffff?text=+) | Bordas de elementos |
| `--input` | `220 13% 15%` | ![#1f242e](https://via.placeholder.com/20/1f242e/ffffff?text=+) | Campos de input |
| `--ring` | `43 74% 52%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | Focus ring |
| `--radius` | `0.625rem` (10px) | — | Border radius padrão |

---

## Tipografia

### Fontes

| Família | Peso | Uso |
|---------|------|-----|
| **Archivo** | 400, 500, 600, 700 | Corpo de texto, UI |
| **Archivo Black** | 400 | Títulos (h1-h6) |

### Configuração CSS

```css
body {
  font-family: 'Archivo', system-ui, -apple-system, sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Archivo Black', 'Archivo', system-ui, sans-serif;
}
```

### Escalas de Tamanho (Tailwind)

O sistema utiliza as escalas padrão do Tailwind:

- `text-xs` — 0.75rem (12px)
- `text-sm` — 0.875rem (14px)
- `text-base` — 1rem (16px)
- `text-lg` — 1.125rem (18px)
- `text-xl` — 1.25rem (20px)
- `text-2xl` — 1.5rem (24px)
- `text-3xl` — 1.875rem (30px)
- `text-4xl` — 2.25rem (36px)
- `text-5xl` — 3rem (48px)

---

## Sombras

### Sistema de Sombras (Dark Mode)

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.03)` | Sutil, labels |
| `--shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)` | Botões, inputs |
| `--shadow-card` | `0 2px 8px rgb(0 0 0 / 0.3), 0 8px 24px rgb(0 0 0 / 0.2)` | Cards elevados |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)` | Elementos flutuantes |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.06), 0 4px 6px -4px rgb(0 0 0 / 0.06)` | Modais, popovers |
| `--shadow-premium` | `0 4px 24px -4px rgb(212 175 55 / 0.15), 0 16px 48px -12px rgb(0 0 0 / 0.4)` | **Cards premium, CTAs** |
| `--shadow-glow` | `0 0 25px rgb(212 175 55 / 0.25)` | Efeito glow sutil |
| `--shadow-glow-strong` | `0 0 40px rgb(212 175 55 / 0.4)` | Efeito glow forte |

### Uso

```css
.card-premium {
  box-shadow: var(--shadow-premium);
}

.button-glow {
  box-shadow: var(--shadow-glow);
}
```

---

## Glassmorfismo

O sistema implementa um glassmorfismo intenso estilo **Fluent Design** da Microsoft, com desfoque elevado e bordas sutis.

### Tokens de Glassmorfismo

| Token | Valor | Uso |
|-------|-------|-----|
| `--glass-blur` | `20px` | Quantidade de desfoque |
| `--glass-bg` | `15 15 20 / 0.75` | Background base do glass |
| `--glass-bg-elevated` | `20 20 28 / 0.80` | Background para elementos elevados |
| `--glass-border` | `255 255 255 / 0.15` | Borda visível |
| `--glass-border-subtle` | `255 255 255 / 0.10` | Borda sutil |
| `--glass-shadow` | `0 8px 32px rgb(0 0 0 / 0.35), 0 2px 8px rgb(0 0 0 / 0.25)` | Sombra do glass |
| `--glass-shadow-lg` | `0 16px 48px rgb(0 0 0 / 0.45), 0 4px 16px rgb(0 0 0 / 0.3)` | Sombra grande |
| `--glass-highlight` | `linear-gradient(135deg, rgb(255 255 255 / 0.12) 0%, rgb(255 255 255 / 0) 50%)` | Brilho superior |

### Classes de Utilidade

#### `.glass`

Glassmorfismo base para elementos gerais.

```css
.glass {
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
```

**Uso:** Cards, painéis, containers de conteúdo.

---

#### `.glass-elevated`

Glassmorfismo para elementos mais destacados (modais, sidebars).

```css
.glass-elevated {
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
```

**Uso:** Sidebar, modais, elementos em destaque.

---

#### `.glass-subtle`

Glassmorfismo sutil para elementos secundários.

```css
.glass-subtle {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
```

**Uso:** Tags, badges, elementos menores.

---

#### `.glass-sidebar`

Efeito Apple-style vibrancy para navegação lateral.

```css
.glass-sidebar {
  background: rgba(28, 28, 32, 0.78);
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
  border-right: 0.5px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 0 1px rgba(0, 0, 0, 0.4),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.04);
}
```

**Uso:** Sidebar de navegação.

---

#### `.glass-nav-item`

Item de navegação com hover.

```css
.glass-nav-item {
  background: transparent;
  border-radius: 8px;
  transition: all 0.15s ease-out;
}

.glass-nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
}
```

**Uso:** Itens de menu, links de navegação.

---

#### `.glass-header`

Glassmorfismo para headers e barras superiores.

```css
.glass-header {
  background: rgba(10, 12, 18, 0.85);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
```

**Uso:** Topbar, header de página.

---

#### `.glass-card-interactive`

Card de glass com hover interativo.

```css
.glass-card-interactive {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card-interactive:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow: var(--glass-shadow-lg);
  transform: translateY(-2px);
}
```

**Uso:** Cards clicáveis, elementos interativos.

---

#### `.glass-highlight`

Overlay de brilho superior para elementos destacados.

```css
.glass-highlight::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--glass-highlight);
  border-radius: inherit;
  pointer-events: none;
  opacity: 0.5;
}
```

**Uso:** Elementos em destaque, CTAs.

---

#### `.glass-glow`

Glass com efeito de brilho (glow).

```css
.glass-glow {
  box-shadow: var(--glass-shadow), 0 0 20px rgb(212 175 55 / 0.1);
}
```

**Uso:** Elementos em foco, notificações.

---

## Animações

### Fade In Up

Animação de entrada para cards e elementos que aparecem na tela.

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.4s ease-out forwards;
}
```

---

### Fade In

Animação de fade simples.

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out forwards;
}
```

---

### Scale In

Animação de escala para modais e popovers.

```css
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out forwards;
}
```

---

### Shimmer

Efeito de loading skeleton.

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 0%,
    hsl(var(--muted-foreground) / 0.1) 50%,
    hsl(var(--muted)) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

---

### Pulse Suave

Indicador de status online.

```css
@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.status-online {
  animation: pulse-soft 2s ease-in-out infinite;
}
```

---

### Animações de Funil

Animação sequencial para estágios de funil.

```css
.funnel-stage {
  animation: funnel-fade-in 0.5s ease-out forwards;
  animation-delay: calc(var(--stage-index) * 80ms);
  opacity: 0;
}

.funnel-arrow {
  animation: funnel-fade-in 0.4s ease-out forwards;
  animation-delay: calc(var(--stage-index) * 80ms + 200ms);
  opacity: 0;
}
```

---

### Stagger Animation

Delays escalonados para listas.

```css
.animate-stagger:nth-child(1) { animation-delay: 0ms; }
.animate-stagger:nth-child(2) { animation-delay: 50ms; }
.animate-stagger:nth-child(3) { animation-delay: 100ms; }
.animate-stagger:nth-child(4) { animation-delay: 150ms; }
.animate-stagger:nth-child(5) { animation-delay: 200ms; }
.animate-stagger:nth-child(6) { animation-delay: 250ms; }
.animate-stagger:nth-child(7) { animation-delay: 300ms; }
.animate-stagger:nth-child(8) { animation-delay: 350ms; }
```

---

## Utilitários de Componentes

### Card Interativo

Card com hover sutil e sombra premium.

```css
.card-interactive {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s ease;
}

.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-premium);
  border-color: hsl(var(--border) / 0.8);
}
```

---

### Stat Card

Card de estatística com borda esquerda colorida.

```css
.stat-card {
  border-left: 3px solid transparent;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s ease,
              border-left-color 0.25s ease;
}

.stat-card:hover {
  border-left-color: hsl(var(--primary));
}
```

---

### Botão com Glow

Botão primário com efeito de brilho.

```css
.btn-glow {
  position: relative;
  overflow: hidden;
}

.btn-glow::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    hsl(var(--primary) / 0.2),
    transparent
  );
  transform: translateX(-100%);
  transition: transform 0.5s ease;
}

.btn-glow:hover::after {
  transform: translateX(100%);
}
```

---

### Badge Empire

Badge com gradiente.

```css
.badge-empire {
  background: linear-gradient(
    135deg,
    hsl(var(--primary)) 0%,
    hsl(var(--primary) / 0.8) 100%
  );
  color: hsl(var(--primary-foreground));
}
```

---

### Table Row Interativo

Linha de tabela com hover.

```css
.table-row-interactive {
  transition: background-color 0.15s ease;
}

.table-row-interactive:hover {
  background-color: hsl(var(--muted) / 0.5);
}
```

---

### Focus Ring

Ring de foco consistente com a marca.

```css
.focus-ring-empire:focus-visible {
  outline: none;
  ring: 2px;
  ring-offset: 2px;
  ring-color: hsl(var(--ring));
}
```

---

### Transição Suave

Transição padrão para elementos interativos.

```css
.transition-smooth {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

### Sidebar Transition

Transição suave para sidebar.

```css
.sidebar-transition {
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

### Page Enter

Animação de entrada de página.

```css
.page-enter {
  animation: fade-in-up 0.3s ease-out forwards;
}
```

---

## Gradientes e Backgrounds

### Gradient Mesh

Background com múltiplas camadas de gradientes radiais.

```css
.bg-gradient-mesh {
  background:
    radial-gradient(ellipse 80% 50% at 20% 40%, hsla(220, 60%, 18%, 0.5) 0px, transparent 50%),
    radial-gradient(ellipse 60% 40% at 80% 20%, hsla(45, 70%, 25%, 0.15) 0px, transparent 50%),
    radial-gradient(ellipse 50% 60% at 10% 80%, hsla(220, 50%, 15%, 0.4) 0px, transparent 50%),
    radial-gradient(ellipse 40% 40% at 90% 70%, hsla(200, 40%, 12%, 0.3) 0px, transparent 50%),
    linear-gradient(180deg, hsl(220, 25%, 7%) 0%, hsl(220, 30%, 4%) 100%);
}
```

---

## Tokens Semânticos

### Cores de Estado

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--success` | `152 69% 40%` | ![#15803d](https://via.placeholder.com/20/15803d/ffffff?text=+) | Mensagens de sucesso |
| `--warning` | `43 74% 49%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | Avisos |
| `--info` | `210 53% 23%` | ![#1e3a5f](https://via.placeholder.com/20/1e3a5f/ffffff?text=+) | Informações |

---

### Tokens da Sidebar

| Token | HSL | Exemplo Visual | Uso |
|-------|-----|----------------|-----|
| `--sidebar-background` | `220 20% 4%` | ![#0a0c10](https://via.placeholder.com/20/0a0c10/ffffff?text=+) | Fundo da sidebar |
| `--sidebar-foreground` | `0 0% 98%` | ![#fafafa](https://via.placeholder.com/20/fafafa/000000?text=+) | Texto da sidebar |
| `--sidebar-primary` | `43 74% 49%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | Item ativo |
| `--sidebar-primary-foreground` | `220 20% 4%` | ![#0a0c10](https://via.placeholder.com/20/0a0c10/ffffff?text=+) | Texto sobre item ativo |
| `--sidebar-accent` | `220 15% 12%` | ![#1a1d24](https://via.placeholder.com/20/1a1d24/ffffff?text=+) | Fundo de hover |
| `--sidebar-accent-foreground` | `43 74% 55%` | ![#ddc65a](https://via.placeholder.com/20/ddc65a/000000?text=+) | Texto em hover |
| `--sidebar-border` | `220 15% 15%` | ![#1f242e](https://via.placeholder.com/20/1f242e/ffffff?text=+) | Bordas da sidebar |
| `--sidebar-ring` | `43 74% 49%` | ![#d4b037](https://via.placeholder.com/20/d4b037/000000?text=+) | Focus ring |

---

## Referência Rápida

### Valores CSS

```css
/* Cores */
--empire-gold: 43 74% 49%;
--empire-black: 220 20% 4%;
--background: 220 20% 4%;
--foreground: 0 0% 98%;
--primary: 43 74% 52%;
--secondary: 210 45% 30%;
--muted: 220 15% 13%;
--border: 220 13% 18%;

/* Sombras */
--shadow-premium: 0 4px 24px -4px rgb(212 175 55 / 0.15), 0 16px 48px -12px rgb(0 0 0 / 0.4);
--shadow-glow: 0 0 25px rgb(212 175 55 / 0.25);
--shadow-glow-strong: 0 0 40px rgb(212 175 55 / 0.4);

/* Glass */
--glass-blur: 24px;
--glass-bg: 15 15 20 / 0.75;
--glass-bg-elevated: 20 20 28 / 0.80;
--glass-border: 255 255 255 / 0.15;

/* Border Radius */
--radius: 0.625rem; /* 10px */
```

---

## Boas Práticas

1. **Sempre use HSL** — Nunca use RGB hex para cores definidas no design system
2. **Use variáveis CSS** — Referencie tokens como `hsl(var(--primary))`
3. **Dark mode only** — O sistema foi projetado exclusivamente para dark mode
4. **Glassmorfismo com moderação** — Use `.glass` para elementos principais, `.glass-subtle` para secundários
5. **Animações consistentes** — Use as classes utilitárias (`animate-fade-in-up`, etc.) para manter consistência
6. **Dourado para CTAs** — Use `--primary` para botões de ação principal
7. **Sombras premium para destaque** — Use `--shadow-premium` para elementos que precisam de atenção
