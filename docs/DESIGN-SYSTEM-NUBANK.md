# Design System "Nubank" v2.2 — eb-dash2

> Fonte da verdade do tema visual do dashboard Empire (`eb-dash2/`). Qualquer alteração de
> cor, raio, tipografia ou motion deve ser feita nos tokens abaixo (CSS variables em
> `src/index.css` + mapeamento em `tailwind.config.js`) — nunca hex/raio soltos em componentes.

Referenciado no índice de `CLAUDE.md`. Substituiu o tema anterior ("Empire" — dourado
`#c9a227`/`#fcd535` inspirado em Binance), preservando a arquitetura de tokens e o
**liquid glass** já existente.

---

## 1. Decisões de arquitetura tomadas nesta refatoração

Estas decisões foram tomadas de forma autônoma (dono sem acesso ao computador durante a
execução) e estão documentadas aqui para rastreabilidade:

1. **`defaultMode` do design system é `light`**, mas o app mantinha `defaultTheme="dark"` em
   `src/main.tsx`. Dark continua 100% suportado e visualmente completo — não removi nada —
   mas não alterei o padrão do app nesta PR de tokens para não misturar uma mudança de
   comportamento (qual tema abre por padrão) com a reharmonização puramente visual. Fica
   registrado como decisão pendente de confirmação do dono: trocar `defaultTheme` para
   `"light"` em um PR seguinte, já que o novo brand é light-first.
2. **Liquid glass também no light mode.** Antes, `.glass-sidebar/header/card` só existiam
   sob `.dark`— em light mode as superfícies eram opacas. Como o requisito explícito do
   dono foi "manter os efeitos de liquid glass que já existem" e o dono quer o produto
   consistente independente do tema, estendi as mesmas classes para funcionar nos dois
   modos, com tokens `--glass-*` próprios por modo (branco+roxo no light, preto+roxo no
   dark). Blur amounts (8/16/24px) e a estrutura de opacidade relativa foram mantidos
   idênticos ao original — só o matiz mudou.
3. **`secondary` (slot shadcn) ≠ swatch `secondary` do design system.** O documento define
   `secondary: #3E1874` como swatch de marca, mas a receita `button-secondary` do mesmo
   documento diz `bg #FFFFFF, texto #000000`. São coisas diferentes: o swatch é uma cor de
   marca (usada em `--brand-core-*`/`--ultravioleta-*` para uso decorativo), e o slot
   `secondary` do shadcn (usado por botões/badges "secondary") segue a **receita do
   componente**, que é branco/preto. Ambos foram implementados como tokens distintos —
   nenhum foi descartado.
4. **Chart palette estendida.** O design system só define `chart-1..5` (quase mono-roxo:
   roxo, roxo, lilás, marrom, marrom). Mantive esses 5 exatamente como especificado e
   estendi `chart-6..8` com tons já presentes na paleta de marca (`ultravioleta-50`,
   `brand-core-50`, `success`) para não quebrar gráficos existentes que iteram sobre até 8
   séries — documentado aqui como extensão, não como parte da "fonte da verdade" do dono.
4b. **Paleta de séries (`--series-1..8`), adicionada em 2026-07-31.** A `chart-1..8` serve
   para gráficos de uma dimensão por vez (uma rosca, uma barra por categoria), mas repete
   tons (`chart-1 = chart-2`, `chart-4 = chart-5`) e é quase toda roxa. Em gráficos com
   **várias séries no mesmo eixo** — o caso do `OriginTrendChart` — duas linhas vizinhas
   saíam com o mesmo roxo e o gráfico ficava ilegível. `--series-1..8` são oito matizes
   distintas (roxo da marca, verde, âmbar, azul, rosa, teal, vermelho, lima), com versão
   escura para fundo claro e clara para fundo escuro.
4c. **Paleta categórica única (`--series-1..12`), a partir de 2026-08-19.** Convivíamos com
   duas regras: pizza/barra pegavam a cor pelo **hash do rótulo** em `chart-1..8`, e o
   gráfico de linhas pegava pela **posição no ranking** em `series-1..8`. Consequência: a
   mesma origem (ex.: "acelerador") aparecia roxa na pizza e verde na linha, e a cor da
   linha ainda trocava quando o ranking mudava de período. Agora **todo gráfico categórico
   usa `--series-*`** e a cor vem sempre do RÓTULO, via `buildLabelColorMap` em
   `src/lib/utils/colors.ts`: cor canônica por hash + desempate determinístico (ordem
   alfabética, probing na paleta) para que duas séries exibidas juntas nunca fiquem
   idênticas. A paleta foi ampliada para 12 matizes para reduzir colisão. `getChartColorByIndex`
   foi removida — cor por posição reintroduz a inconsistência. A `chart-1..8` continua
   existindo no CSS para usos pontuais (KPIs, gauges), fora de gráfico categórico.
5. **Cores categóricas não-semânticas não foram unificadas na paleta de marca.** Mapas de
   cor por papel de usuário (`types/users.ts:PAPEL_CONFIG`) e por status de disparo
   (`types/disparos.ts:DISPARO_SIGNIFICADOS`) existem para dar contraste visual entre
   categorias (SDR vs Closer vs Gestor, etc.) — não são elementos de marca. Removi apenas o
   resíduo do dourado antigo (`#C9A240` no papel "gestor") por não fazer mais sentido ao
   lado do novo roxo primário, e realinhei os status semânticos de disparo
   (`respondeu`/`parou`/`erro`/`converteu`) para usarem os mesmos tons de
   sucesso/destrutivo/aviso do design system. As demais cores categóricas (azul do SDR,
   violeta do Closer, laranja do Social Seller) foram mantidas — são identidade visual de
   papel, não CTA de marca.
6. **Escala de espaçamento `xs/sm/md/lg/xl`** do documento (`0.35em`...`1em`) foi adicionada
   como tokens novos (`--xs`...`--xl`) ao lado da escala `--s4`...`--s128` já existente no
   projeto — a escala antiga continua em uso extensivo no código (spacing absoluto em rem);
   a nova escala relativa (`em`) fica disponível para uso pontual onde o dono pedir
   compassing tipográfico (ex.: padding de botão que deve escalar com o tamanho da fonte).

---

## 2. Cores — tokens CSS (`src/index.css`)

### 2.1 Semânticos (shadcn-compat, formato `H S% L%`)

| Token | Light | Dark | Uso |
|---|---|---|---|
| `--background` | `0 0% 100%` (#FFF) | `0 0% 0%` (#000) | fundo da página |
| `--foreground` | `0 0% 0%` | `0 0% 100%` | texto padrão |
| `--card` / `--popover` | `0 0% 100%` | `0 0% 3%` (#080808) | superfícies elevadas |
| `--primary` | `276 91% 43%` (#820AD1) | igual | CTA dominante — **mesmo nos dois modos** |
| `--primary-foreground` | `0 0% 100%` | igual | texto sobre CTA |
| `--secondary` | `0 0% 100%` | `0 0% 7%` | bg de botão/badge secundário |
| `--secondary-foreground` | `0 0% 0%` | `0 0% 100%` | texto sobre secondary |
| `--tertiary` | `270 100% 82%` (#D2A5FF) | igual | acentos suaves, hover states |
| `--muted` / `--muted-foreground` | `0 0% 96%` / `0 0% 47%` | `0 0% 7%` / `0 0% 75%` (#BFBFBF) | texto/superfície apagada |
| `--destructive` | `1 76% 46%` (#D01D1C) | `1 84% 64%` | erros, ações destrutivas — **nunca reusar o `--primary`** |
| `--border` / `--input` | `0 0% 89%` (#E4E4E4) | `0 0% 100% / 0.10` (#ffffff1a) | hairline |
| `--ring` | `276 91% 43%` | igual | focus ring |
| `--success` | `145 82% 26%` (#0C7A3A) | `145 55% 45%` | estados de sucesso |
| `--warning` | `35 100% 30%` (#9B5A00) | `35 65% 51%` | estados de alerta |
| `--info` | `276 91% 43%` | `270 100% 82%` | informativo (usa primary no light; tertiary no dark p/ contraste) |

### 2.2 Empire primitives (`--empire-*`) — consumidos por quase todos os componentes `ui/*`

Ver `src/index.css` `:root`/`.dark`. Trocar estes ~19 tokens é o ponto único de propagação
de cor para praticamente toda a UI (botões, cards, inputs, tabelas, sidebar).

### 2.3 Brand swatches e M3 surface ladder

Tokens `--brand-core-10..90`, `--ultravioleta-50/80/100`, `--neutral-0..100` e
`--surface-container-*`/`--surface-bright`/`--surface-dim`/`--surface-inverse*` foram
adicionados como referência de marca completa (fonte da verdade do dono), disponíveis para
uso decorativo/gradientes/estados avançados, mesmo que os componentes `ui/*` não os
consumam diretamente hoje.

---

## 3. Tipografia

- **Família:** `graphikMedium` (display/headings/label/nav/botão) e `graphikRegular`
  (corpo/mono), ambas com fallback declarado `Arial, sans-serif` — **não há asset
  proprietário da Graphik no repo**, então o navegador cai no fallback automaticamente, sem
  travar build nem exigir licença.
- Removida a importação do Google Fonts (Geist + JetBrains Mono) de `index.html` — não é
  mais necessária.
- **Escala:** h1 56px, h2 40px, h3 32px, h4 24px, body-lg 18px, body-md 16px, body-sm 14px,
  label 14px, mono 14px — tokens `--text-*` em `src/index.css`.
- **Regra de acessibilidade:** nenhum texto de **corpo** (inputs, parágrafos, textarea) fica
  abaixo de 16px. Rótulos de UI densa (badges, itens de menu, cabeçalhos de tabela) usam
  14px — é o tamanho `label` definido pelo próprio design system, não uma violação.

---

## 4. Raios (border-radius)

| Var | Valor | Uso |
|---|---|---|
| `--radius-none` | 0px | — |
| `--radius-sm` | 12px | `rounded-sm` — botões |
| `--radius-md` | 24px | `rounded-md` — inputs, botão secundário/ghost |
| `--radius-lg` | 32px | `rounded-lg` — cards |
| `--radius-xl` | 48px | `rounded-xl` — superfícies grandes/decorativas |
| `--radius-full` | 9999px | `rounded-full` — badges, avatars, pills |

---

## 5. Liquid Glass — preservado e reharmonizado

Arquitetura mantida idêntica ao original: 3 classes centralizadas em
`src/index.css` (`@layer utilities`): `.glass-sidebar`, `.glass-header`, `.glass-card`,
usando `backdrop-filter: blur(8|16|24px)` + tokens `--glass-*-bg`/`--glass-border`.

**O que mudou:** só o matiz. Light mode agora tem glass próprio (branco translúcido com
tinta roxa sutil no *inset*/borda); dark mode trocou o azul-petróleo/dourado Binance por
preto + roxo. Nenhum componente que consome `.glass-card`/`.glass-sidebar`/`.glass-header`
precisou de alteração — a classe é a mesma, só os tokens por trás mudaram.

Overlays de modal (`backdrop-blur-sm` + cor) que estavam com `bg-black/40` ou uma cor
hardcoded (`rgba(7,12,20,0.6)`) foram normalizados para `bg-empire-void/40` ou `/50`, que
já respeita o token de void por modo.

---

## 6. Componentes — receitas aplicadas

| Componente | Antes | Depois |
|---|---|---|
| `button` (default/gold/premium) | `rounded-xl`, `font-semibold` | `rounded-sm` (12px), `font-medium` — bg `--empire-primary` |
| `button` (secondary) | bordado, `rounded-lg` | sem borda, bg branco/`--secondary`, `rounded-md` (24px) |
| `button` (ghost) | `rounded-lg` | borda transparente, `rounded-md` (24px) |
| `button` (destructive) | usava `--empire-danger` já | mantido — nunca usa o roxo de marca para erro |
| `button` (default/lg) size | ~36px altura | ≥44px altura (alvo de toque AA) |
| `button` (icon) | 36x36px | 44x44px |
| `card` | `rounded-xl` (16px calc) | `rounded-lg` (32px, recipe) |
| `input`/`textarea` | 14px, `rounded-lg` (32px), borda forte | **16px** (corpo), `rounded-md` (24px), borda `#E4E4E4` |
| `badge` | `rounded-md`; `warning`/`info` com `amber-800`/`blue-700` hardcoded | `rounded-full` (recipe); usa `--empire-warning`/`--empire-info` |
| `select`/`dialog` | `rounded-lg` (32px) em trigger/dropdown | `rounded-md` (24px) — comportam-se como input |
| `date-picker` (2026-08-07) | `<input type="date">` nativo — visual do sistema operacional, ignorava tema/tipografia/paleta | calendário próprio (`src/components/ui/date-picker.tsx`) |

### 6.1 DatePicker (`src/components/ui/date-picker.tsx`)

Único seletor de data da plataforma. **Não use `<input type="date">`** em código novo: ele renderiza com a cara do sistema operacional, não respeita o tema escuro nem a tipografia, e varia entre navegadores.

**Contrato — igual ao do input nativo, para a troca ser mecânica:**

```tsx
<DatePicker
  value={startDate}                    // string 'YYYY-MM-DD' ('' = vazio)
  onChange={(v) => setStartDate(v)}    // recebe a string, não um evento
  min={outraData}                      // opcional, mesmo formato
  max={outraData}
  clearable                            // mostra o "x" e o botão Limpar
  fullWidth                            // ocupa a largura toda (campo de formulário)
  aria-label="Data inicial"
/>
```

**Por que `string` e não `Date`:** `new Date('2026-08-07')` é interpretado como UTC e, no fuso do Brasil, volta um dia. Mantendo `YYYY-MM-DD` na borda do componente, esse bug não tem por onde entrar — e a comparação de `min`/`max` é lexicográfica, sem conversão.

**Comportamento:** abre em popover ancorado (vira para cima ou alinha à direita quando não cabe na viewport), fecha com clique fora, `Esc` ou ao escolher o dia. Destaca hoje com anel roxo e o dia escolhido com o roxo de marca. Rodapé com "Hoje" e "Limpar". Dias fora de `min`/`max` ficam desabilitados.

**Adoção:** os 25 usos de `<input type="date">` que existiam em 13 arquivos foram migrados em 2026-08-07 — nenhum restou no `src/`.

---

## 7. Acessibilidade (WCAG AA)

- **Contraste:** `--primary` (#820AD1) vs branco = ~7.5:1 (AAA). `--destructive` (#D01D1C)
  vs branco ≈ 5.9:1. `--warning` (#9B5A00) sobre `--empire-warning-soft` (10% tint) ≈ 5.4:1.
  Todos passam AA (4.5:1 texto normal).
- **Focus ring:** `:focus-visible` global usa `outline: 2px solid var(--empire-primary)` +
  `outline-offset: 2px`, além do `focus-visible:ring-2` por componente.
- **Alvo de toque:** tamanhos `default`/`lg`/`xl` de botão e o `input`/`textarea` têm
  ≥44x44px. Variantes densas (`size="sm"`, `size="icon"` em contexto de tabela) são uma
  exceção documentada — permanecem ≥24x24px (WCAG 2.2 AA critério 2.5.8), com espaçamento
  adequado entre alvos adjacentes nas tabelas onde são usadas.
- **`prefers-reduced-motion`:** media query global em `src/index.css` zera durações de
  animação/transição para quem pede.
- **Texto de corpo:** nunca abaixo de 16px (inputs/textarea corrigidos nesta refatoração).

---

## 8. O que ficou fora do escopo desta PR (documentado, não esquecido)

- Gráficos de série (`OrganicoMqlGoalChart`, `TrendChart`, `InvestimentoCpmqlChart`,
  `VerticalBarChart`, `PerformanceOriginChart`, `DonutChart`, `FunnelViz`,
  `DisparoBarChart`/`DisparoFunnel`) têm hex hardcoded pontual para cores de série/barra que
  não foram varridos linha a linha nesta PR — são majoritariamente cores categóricas de
  dado, não cores de marca. Ficam como candidatos a uma PR de camada 3 (telas) dedicada, se
  o dono quiser unificação total.
- `defaultTheme` do app (login em dark por padrão) — ver decisão #1 acima.
- Extração de um `AppShellLayout` compartilhado entre `WorkspaceLayout`/`AgencyLayout`/
  `AdminLayout`/`DashboardLayout` (hoje replicam `glass-sidebar`+`glass-header` de forma
  independente) — refactor estrutural, fora do escopo de uma reharmonização visual.
