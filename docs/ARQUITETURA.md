# Arquitetura do Sistema

## Atualização 2026-07-07 18:47 BRT — Mapeamento GHL Multi-Conta (Fase 1)

Criada a fundação do banco de dados para expandir o Empire para múltiplas contas GoHighLevel.

**Tabelas:**
- `ghl_integration_settings` — credenciais e configuração de webhook por workspace.
- `ghl_field_mappings` — mapeamento de campos lógicos do Empire para chaves reais do GHL.
- `ghl_pipeline_mappings` — categorização de pipelines GHL (`pre_vendas`, `vendas`, `recuperacao`, etc.).
- `ghl_stage_mappings` — mapeamento de estágios/columns GHL para estágios canônicos do Empire.
- `ghl_field_mapping_templates` — templates reutilizáveis para seed inicial de novos workspaces.
- `ghl_discovery_runs` — log de descoberta de campos/pipelines via API GHL.

**Segurança:** RLS ativado em todas as tabelas; qualquer membro ativo pode ler; apenas `owner`/`admin` podem modificar; `service_role` acesso total.

**Seed:** template `Empire Default` preenchido com todos os campos lógicos do Empire baseados em `docs/Document_GHL.md`.

**Regras críticas:**
- `ghl_api_key` nunca é exposta no frontend React.
- A função `extrair_dados_ghl()` ainda **não** foi alterada — isso é da Fase 4.

Documentação completa: [`docs/GHL-MAPEAMENTO-CAMPOS.md`](docs/GHL-MAPEAMENTO-CAMPOS.md).

---

## Atualização 2026-06-26 12:13 BRT — Sub-apps Modulares (Fase 1)

Criada a fundação de backend para sub-apps ativáveis por workspace.

**Tabelas:**
- `workspace_apps` — ativação e settings de cada app no workspace.
- `app_role_permissions` — permissões default por role (`can_view`).
- `app_user_overrides` — overrides por usuário, que vencem as permissões de role.

**Edge function:** `workspace-apps` (`POST /workspace-apps`) lista todos os apps do catálogo com `is_active` e `allowed` para o usuário autenticado. A função valida o JWT internamente e resolve o workspace pelo header `x-workspace-id` ou pelo primeiro workspace ativo do usuário.

**Segurança:** RLS ativado em todas as tabelas; apenas `owner`/`admin` podem modificar; `service_role` mantém acesso total para rotinas internas.

**Seed:** workspaces existentes têm todos os apps ativados com `can_view = true` para `owner` e `admin`.

Documentação completa: [`docs/SUB-APPS-MODULARES.md`](docs/SUB-APPS-MODULARES.md).

---

## Atualização 2026-05-18 20:45 BRT — Schema de Relatórios Semanais (Tipado por Módulo)

Criado o módulo de snapshots semanais com **tabelas tipadas por módulo** + tabela central `weekly_snapshots`.

**Tabela central:** `weekly_snapshots` — catálogo mestre. Cada semana comercial (segunda→domingo) gera 2 snapshots: `cohort` e `produtividade`. Rastreia `status`, `data_version`, `computed_at`, `error_message`.

**Tabelas por módulo (9):** `weekly_trafego`, `weekly_aquisicao`, `weekly_organico`, `weekly_prevendas`, `weekly_vendas`, `weekly_recuperacao`, `weekly_sdr`, `weekly_closer`, `weekly_metas`. Todas com colunas tipadas (INTEGER, NUMERIC) + `extras JSONB` para extensibilidade. FK para `weekly_snapshots(id)` com `ON DELETE CASCADE`.

**Audit trail:** `weekly_cohort_audit` — registra toda mudança em cohort com `old_value`, `new_value`, `delta`, `reason`, `trigger_record_id`.

**Fila de reprocessamento:** `weekly_reprocess_queue` — quando `vendas_fechamento.data_pagamento_entrada` afeta semana antiga, a semana entra na fila com `priority`.

**Views unificadas:**
- `v_weekly_snapshots_status` — visão geral do catálogo (quantos registros cada módulo tem por snapshot)
- `v_weekly_dashboard` — UNION ALL de todos os módulos em uma "tabela única" para leitura simples

**RLS:** Todas as 12 tabelas têm RLS com política `SELECT` para `auth.role() = 'authenticated'`.

**Migration:** `supabase/migrations/20260518200000_weekly_reports_schema.sql`

---

## Atualização 2026-04-13 10:10 BRT — score real do MQL na aba Leads

- A camada de leitura da aba `Leads` ganhou um cálculo derivado de score para MQL sem criar tabela nova no banco.
- O fluxo agora combina três fontes já canônicas do sistema:
  - `oportunidades` para marcos do funil
  - `comunicacoes` para detectar resposta inbound e tempo da primeira resposta
  - `vendas_fechamento` para compra confirmada por `data_pagamento_entrada`
- O cálculo foi centralizado em `eb-dash2/src/lib/lead-quality-score.ts` para evitar fórmulas duplicadas na UI.
- A `LeadsTable` passou a consumir esse derivado e expor dois níveis de leitura:
  - score por lead (`Score` + `Termômetro`)
  - score agregado por filtro (`Canal`, `Funil`, `Campanha`, `SDR`, `Estágio`)
- O score opera apenas sobre leads com tag `MQL`, respeita lógica `cohort + snapshot` e normaliza por maturidade via `pontos_elegiveis`, para não penalizar lead recente por etapas ainda não vencidas.

## Atualização 2026-04-10 11:25 BRT — remoção da aba Estatísticas de Pré-Vendas

- O módulo `Pré-Vendas` não expõe mais a aba `Estatísticas`.
- Foram removidos do frontend os artefatos exclusivos dessa experiência:
  - `tabs/EstatisticasTab.tsx`
  - `hooks/useSDREstatisticas.ts`
  - componentes auxiliares de score, grid, tabela e cards de ranking SDR
- A navegação foi simplificada em dois pontos obrigatórios:
  - `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`
  - `eb-dash2/src/components/layout/Sidebar.tsx`
- A documentação indexada do módulo foi limpa para não manter referência morta a uma aba inexistente.

## Atualização 2026-04-09 20:14 BRT — Estatísticas SDR orientada por produtividade

- A aba `Pré-Vendas > Estatísticas` deixou de ser um placar de ranking e passou a operar como painel analítico de produtividade.
- O fluxo de dados continua centralizado em `useSDREstatisticas.ts`, mas agora a camada de transformação entrega métricas derivadas prontas para visualização:
  - `baseCount` / `baseLabel`
  - `taxaAgendamentoMql`
  - `mensagensPorMql`
  - `ligacoesPorMql`
  - `esforcoPorMql`
  - `velocidadeScore`
  - `vendasPorAgendamento`
  - `scoreBreakdown`
- A regra oficial de esforço foi fixada no frontend e na documentação:
  - `80%` mensagens por base
  - `20%` ligações por base
- O score agora é composto por 5 blocos: `45% agendamento`, `20% mensagens`, `5% ligações`, `20% velocidade`, `10% vendas`.
- A visualização principal passou a ser um gráfico SVG agrupado por SDR, sem dependências externas de charting.

## Atualização 2026-04-09 15:00 BRT — auto-tag "conectado" via trigger em comunicacoes

- Criado trigger `trg_auto_tag_conectado` (função `auto_tag_conectado_on_inbound()`) em `comunicacoes`.
- Dispara em AFTER INSERT para cada linha com `direction = 'inbound'`.
- Fluxo em 4 passos:
  1. Verifica se contato já tem tag "conectado" (split por vírgula → UNNEST → match exato lowercase) — saída imediata se sim
  2. Atualiza `contatos.tags` imediatamente na mesma transação
  3. Preenche `oportunidades.data_conectado` com a data da mensagem, para oportunidades com `data_conectado IS NULL AND status != 'lost'`
  4. Enfileira `PUT /contacts/{ghl_id}` em `ghl_api_jobs` (caller `auto-tag-conectado`, priority 3) com array completo de tags
- Backfill retroativo (migration `20260409160000`) cobre contatos com inbound desde 2026-03-01 (caller `auto-tag-conectado-backfill`, priority 10).
- Nenhuma mudança no `ghl-api-worker` — worker genérico já processa PUT normalmente.
- Migrations: `20260409150000_auto_tag_conectado_trigger.sql`, `20260409160000_backfill_tag_conectado_retroativo.sql`

## Atualização 2026-04-09 11:40 BRT — comportamento real do repair de attribution

- O cron `sync-contact-attribution` está operacional em produção, mas o desenho atual é um repair em duas etapas mediado pela fila `ghl_api_jobs`.
- Sequência real:
  1. `sync-contact-attribution` enfileira `GET /contacts/{id}` para leads `Facebook + [cp] form-fb` com `utm_*` vazios
  2. `ghl-api-worker` executa o GET e persiste o payload bruto em `ghl_api_jobs.result`
  3. na execução seguinte, `sync-contact-attribution` consome esse resultado, traduz os campos e atualiza `contatos`
  4. então enfileira `PUT /contacts/{id}` para popular custom fields vazios no GHL
- Implicação: o fluxo não é instantâneo para lead novo; ele depende da próxima passada do próprio cron para aplicar o resultado do fetch.
- Em 2026-04-09 isso foi validado na prática com os leads `Domerval Júnior`, `Marcus serrano` e `Diego Alves`, que foram preenchidos após a segunda passada.
- Persistem 2 casos não resolvíveis com a fonte atual (`Rubens Cunha`, `Tatiana Coelho`) porque o `attributionSource` do GHL não trouxe `utmContent`, `campaignId` nem `adId`.

## Atualização 2026-04-08 19:15 BRT — repair de attribution para leads `form-fb`

- Foi criada a edge function `sync-contact-attribution` para reparar contatos de formulário do Facebook com `utm_*` vazios.
- O fluxo usa `GET /contacts/{id}` do próprio GHL como fonte operacional de attribution, porque esse payload já espelha `attributionSource` / `lastAttributionSource` vindos da Meta.
- A tradução para o padrão interno do projeto é determinística a partir do tracking code:
  - `P29` → `utm_sources.public_code` → `utm_source = iads-28`
  - `PG32` → `utm_campaigns.page_code` → `utm_campaign = 32`
  - `O1` → `utm_medium = 1`
  - `CR-248` → `utm_content = CR-248`
  - código completo → `utm_term`
- A function só preenche lacunas:
  - não sobrescreve coluna local já preenchida em `contatos`
  - não sobrescreve custom field do GHL já preenchido
- Foi criada a tabela `ghl_custom_field_mappings` para guardar o mapeamento lógico → ID real dos custom fields do GHL.

## Atualização 2026-04-08 16:36 BRT — Produção (Notion) ganha tracking manual de teste de criativos

- A tabela `notion_creatives` agora possui dois campos operacionais manuais: `creative_tested` (`boolean`) e `test_started_at` (`date`).
- Esses campos são editados pela UI da sub-aba `Traqueamento > Anúncios > Produção (Notion)` e ficam fora do payload sincronizado do Notion.
- A política RLS de `notion_creatives` passou a permitir `UPDATE` para membros autenticados do workspace, mantendo leitura por workspace e sync automatizado via `service_role`.
- Regra de UX: desmarcar "Testado" limpa `test_started_at`; preencher `test_started_at` marca o criativo como testado.

## Atualização 2026-03-31 15:47 BRT — sync de tags blindado contra timeout e backlog de nulos

- `sync-contact-tags` ganhou dois trilhos operacionais:
  - **repair por webhook em lote pequeno** para drenar `contatos.tags IS NULL` sem scan global caro
  - **fallback por API GHL** via `ghl_api_jobs` para contatos sem webhook útil recente
- Foi criada uma função SQL de reparo em lote e outra de reparo direcionado por contato, para operação sem `UPDATE` manual ad hoc.
- Contatos com `tags IS NULL` agora entram em trilho urgente: prioridade maior na fila, mais tentativas e reprocesso por slot de 15 minutos.
- `ghl-api-worker` passou a impor timeout explícito de 15s por request; timeout vira erro retryável com novo agendamento automático.
- Regra institucional: **tags do último webhook são a fonte de verdade primária**; a API GHL é mecanismo de recuperação, não o caminho normal.

## Atualização 2026-03-31 12:14 BRT — sync frequente passa a priorizar o universo operacional recente

- O refresh rápido de `data_reuniao_agendada` agora trabalha com janela de 10 minutos.
- Cada invocação do `sync-appointment-dates` processa múltiplos sublotes internamente.
- O escopo de alta frequência foi reduzido a reuniões recentes/ativas (últimos 60 dias), evitando que histórico antigo concorra com reuniões do dia.

## Atualização 2026-03-31 12:03 BRT — sync-appointment-dates cobre reuniões fora de Vendas SQL

- O escopo do cron `sync-appointment-dates` deixou de ser apenas `Vendas SQL`.
- A sincronização agora segue o recorte operacional do dashboard de reuniões: oportunidades fora de Recuperação com sinal real de reunião de vendas.
- Isso elimina o descompasso em que o frontend listava reuniões de outros funis, mas o backend só preenchia `data_reuniao_agendada` para um pipeline específico.

## Atualização 2026-03-31 11:55 BRT — sync-appointment-dates reconhece cancelamento por múltiplos campos

- O endpoint `GET /contacts/{contactId}/appointments` não pode mais ser interpretado apenas por `appointmentStatus`.
- O cron `sync-appointment-dates` passou a normalizar também `appointment_status`, `status`, `calendarStatus`, `calendar_status` e flags booleanas de cancelamento/deleção.
- A edge function agora aceita execução direcionada por `opp_id` ou `contact_ghl_id` e um modo `include_debug` para inspecionar o payload normalizado de um lead específico.

## Atualização 2026-03-31 09:54 BRT — importação manual de vendas antigas

- Foi criado um fluxo operacional de importação histórica via `scripts/import-vendas-antigas.js`.
- A carga popula diretamente `contatos`, `oportunidades` e `vendas_fechamento` a partir do CSV legado em `vendas antigas/`.
- O pipeline é fixado como `Vendas SQL` e o stage é inferido da base viva para manter compatibilidade com o estado atual do CRM.
- `DATA_OPORTUNIDADE_GHL` alimenta `oportunidades.data_lead_recebido`; quando vazia, a carga faz fallback para `DATA_PG_ENTRADA`.
- `DATA_PG_ENTRADA` alimenta `vendas_fechamento.data_pagamento_entrada`, `vendas_fechamento.data_da_assinatura_do_contrato` e `oportunidades.data_fechado`.
- Para contratos históricos, `oportunidades.openclaw_notificado_em` é preenchido preventivamente para bloquear disparos retroativos do OpenClaw.

## Atualização 2026-03-27 10:31 BRT — sync-appointment-dates ignora cancelados

- O cron `sync-appointment-dates` passou a tratar a API de appointments do GHL com regra de negócio mais rígida.
- `appointmentStatus = canceled/cancelled` não conta mais como reunião válida.
- Quando um contato não tem nenhum appointment ativo, `oportunidades.data_reuniao_agendada` é limpa para evitar reunião fantasma no dashboard.

## Atualização 2026-03-27 10:01 BRT — Produtividade orientada por data de evento

- Os hooks/telas de produtividade do frontend deixaram de usar `data_lead_recebido` como limitador da base operacional.
- A regra nova é: cada métrica usa a data do próprio evento e respeita apenas os filtros ativos da tela.
- Para métricas de vendas, o critério canônico de fechamento continua sendo `vendas_fechamento.data_pagamento_entrada`.
- `Leads` e `MQLs` continuam existindo em produtividade, mas como etapas independentes por `data_lead_recebido`, sem servir de base de conversão para as demais colunas.
- Os componentes compartilhados de produtividade (`computeProducao`, matrizes e visões gerais) passaram a expor contagens independentes por etapa, sem `FunnelViz` ou percentuais encadeados no modo produtividade.

## Stack Tecnológica
- **Banco de dados:** Supabase (PostgreSQL)
- **Edge Functions:** Supabase Functions (Deno)
- **Frontend:** `eb-dash2/` — Vite + React 18 + TypeScript (dashboard ativo, porta 3222)
  - React Router v7, TanStack Query v5, Tailwind v3, shadcn-compatible components (sem radix-ui)
  - Design System: DS1 — Silver Empire v2.0 (ver seção abaixo)
  - `eb-dash/` — Next.js v14 (legado, não usado em produção)
- **Deploy:** Vercel / Supabase

---

## 🎨 Design System — DS1 Silver Empire v2.0

**Filosofia:** Editorial "cold institutional" — fundo claro como primário (bone), sidebar navy escuro como seção intencional, gold usado com parcimônia como acento de destaque.

### Paleta Raw

| Token | Hex | Papel |
|-------|-----|-------|
| `--void` | `#070C14` | Fundo mais escuro (sombras) |
| `--empire` | `#0D1829` | Sidebar, bg escuro, primário dark |
| `--steel` | `#243B55` | Secundário, textos auxiliares |
| `--platinum` | `#BFC5CC` | Textos em contexto escuro |
| `--gold` | `#C9A240` | Acento principal (labels, bordas ativas, CTAs) |
| `--bone` | `#F2EFE8` | **Fundo principal do conteúdo** |
| `--ink` | `#1A1F2E` | Texto primário em contexto claro |
| `--ghost` | `#E4E2DC` | Bordas, divisores |
| `--mist` | `#F7F6F2` | Inputs, backgrounds alternativos, muted |
| `--danger` | `#8B2E2E` | Destrutivo, erros |

### Tipografia Tripla

| Família | CSS Var | Papel |
|---------|---------|-------|
| Cormorant Garamond | `--font-display` | Títulos de página, CardTitle, H1-H3 |
| DM Sans | `--font-body` | Corpo, parágrafos, nav, UI geral |
| IBM Plex Mono | `--font-mono` | Labels eyebrow, TableHead, Badge, section-label |

### Padrão de Contexto Claro/Escuro

| Região | Fundo | Texto | Border |
|--------|-------|-------|--------|
| Main content (body) | `--bone` (#F2EFE8) | `--ink` (#1A1F2E) | `--ghost` (#E4E2DC) |
| Cards | `#FFFFFF` | `--ink` | `--ghost` |
| Sidebar | `--empire` (#0D1829) | `--platinum` (#BFC5CC) | rgba branca 8% |
| Login page | `--empire` (#0D1829) | `--platinum` | rgba branca 12% |
| Inputs | `--mist` (#F7F6F2) | `--ink` | `--ghost` (1.5px) |

### Tokens Shadcn Compat (CSS HSL)

```css
--background: 47 37% 93%;   /* bone */
--foreground: 229 28% 14%;  /* ink */
--card: 0 0% 100%;          /* white */
--primary: 218 52% 11%;     /* empire */
--secondary: 210 41% 36%;   /* steel */
--muted: 40 30% 96%;        /* mist */
--accent: 43 53% 52%;       /* gold */
--border: 40 17% 90%;       /* ghost */
```

### Utilitários CSS

- `.section-label` — IBM Plex Mono, gold, 11px, tracking 0.18em, linha gold 24px antes
- `.stat-card` — border-left transparente → gold + translateY(-2px) no hover
- `.dark-glass` — para cards em contexto escuro (rgba white 4% + blur)
- `body::before` — film grain overlay (opacity 0.025, fractalNoise SVG 128px)

### Sombras (light-mode, ink-tinted via `--void`)

```css
--shadow-sm: 0 1px 3px rgba(7,12,20,0.08), 0 1px 2px rgba(7,12,20,0.04)
--shadow-md: 0 4px 16px rgba(7,12,20,0.10), 0 2px 6px rgba(7,12,20,0.06)
--shadow-lg: 0 16px 48px rgba(7,12,20,0.14), 0 6px 16px rgba(7,12,20,0.08)
--shadow-xl: 0 32px 80px rgba(7,12,20,0.20), 0 12px 32px rgba(7,12,20,0.12)
```

Cards: sem sombra no default — apenas borda ghost. Sombra aparece só no hover (`--shadow-lg`).

### Radius

```css
--radius-sm: 3px   /* botões, badges, inputs, checkboxes */
--radius-md: 6px   /* swatches pequenos, toast */
--radius-lg: 12px  /* cards, painéis, modais, tabelas wrappers */
```

### Motion Tokens

```css
--duration-fast:   150ms   /* hover de cor/bg */
--duration-base:   280ms   /* transições padrão: card hover, button states */
--duration-slow:   500ms   /* panel reveal, drawer */
--duration-slower: 800ms   /* scroll reveal (.reveal class) */
```

### Variante de Input por Contexto

| Variante | Contexto | Texto | Fundo |
|----------|----------|-------|-------|
| `variant="default"` | **Claro** (cards, pages bone) | `--ink` (#1A1F2E) | `--mist` (#F7F6F2) |
| `variant="glowing"` | **Escuro** (login, drawer, painéis empire/void) | `--platinum` (#BFC5CC) | rgba white 6% |

> ⚠️ Usar `glowing` em contexto claro quebra o DS1: texto platinum (#BFC5CC) sobre branco tem contraste insuficiente.

### Regras Obrigatórias DS1 (Proibições)

1. **Zero cores hardcoded** — toda cor usa token CSS (`var(--ink)`, `var(--gold)`, etc.) ou valor rgba derivado de token documentado. Tailwind `bg-emerald-500`, `text-red-400`, `hsl(220,20%,6%)` são **proibidos**.
2. **Zero emojis como ícone** — usar sempre SVG do Lucide React.
3. **`--gold` nunca como fundo** — apenas em labels, linhas separadoras, unidades de métricas, bordas de painéis, e no `.btn-gold` variant.
4. **Animações só em `transform` e `opacity`** — nunca `width`, `height`, `top`, `left` ou `margin`.
5. **Sombra sempre via token** (`var(--shadow-sm/md/lg/xl)`) — nunca `shadow-premium` ou valores inventados.
6. **Contexto escuro usa bordas platinum-tinted** (`rgba(191,197,204,0.10)`) — nunca `border-white/10` (pure white).
7. **Botões usam `--radius-sm` (3px)** — não `--radius-md`. Inputs também usam `--radius-sm`.
8. **Status won/lost em contexto escuro**: success=`rgba(45,125,74,0.2)` + `#5CD688`, danger=`rgba(139,46,46,0.2)` + `#E07070`.
9. **⛔ PROIBIDO: texto claro em fundo claro.** Em qualquer fundo claro (`--white`, `--bone`, `--mist`, `--ghost`), texto usa obrigatoriamente `var(--ink)` (primário) ou `var(--steel)` (secundário). **`var(--platinum)`, `rgba(191,197,204,…)`, `text-muted-foreground` não qualificado e qualquer `opacity-*` aplicado sobre texto já claro são PROIBIDOS em contexto claro** — contraste mínimo 4.5:1 (WCAG AA). `--platinum` é exclusivo de contexto escuro (`--empire`, `--void`).
10. **⛔ PROIBIDO: `opacity-*` Tailwind em `<th>` de tabela em contexto claro.** `text-[var(--steel)] opacity-70` resulta em ~2.2:1 de contraste (falha WCAG). Usar `text-[var(--steel)]` sem modificador (9.8:1 ✅).
11. **⛔ PROIBIDO: `text-xs` (12px) com IBM Plex Mono.** A escala DS1 não inclui 12px. Labels/badges → `text-[var(--text-11)]` (11px); conteúdo de inputs/textareas → `text-[var(--text-13)]` (13px). Mínimo absoluto: 11px em qualquer contexto incluindo SVG.
12. **Labels de card eyebrow** seguem padrão `.section-label`: `font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--gold)]`. Nunca usar `--steel` com opacidade para essa função.
13. **Separadores de breadcrumb** usam `text-[var(--steel)]` direto — nunca com `opacity-*`.
14. **SVG text** tem as mesmas restrições de tamanho mínimo (11px) e cores. Usar `fill="var(--steel)"` / `fill="var(--ink)"` / `fill="var(--gold)"` em vez de `rgba` com opacidade sobre tokens claros.
15. **Estados disabled:** aplicar `opacity-*` no wrapper `<label>` ou componente — nunca via modificador de cor no `<span>` de texto interno. Ex: `<label className={cn(..., !enabled && 'opacity-40')}>`.
16. **Contexto escuro (login, OTP, drawers empire/void):** `text-primary/60` e `text-primary/70` = empire sobre escuro = invisível. Usar `text-[rgba(191,197,204,0.6)]` ou `text-[var(--platinum)]`.

---

## Módulos do Dashboard (`eb-dash2/src/pages/`)

| Módulo | Rota | Filtro de pipeline | Descrição |
|--------|------|--------------------|-----------|
| Aquisição | `/aquisicao` | exclui Recuperação | Visão de TODAS as fontes (pago, orgânico, direto, desconhecido) com filtros hierárquicos por origem |
| Tráfego | `/trafego` | exclui Recuperação | Painel cohort de tráfego pago |
| Traqueamento | `/traqueamento` | — | UTMs, anúncios, funis |
| Pré-Vendas | `/pre-vendas` | exclui Recuperação | Funil SDR + cohort + leads parados |
| **Recuperação** | `/recuperacao` | **somente Recuperação** | Gêmeo de Pré-Vendas para leads reativados |
| **Metas** | `/metas` | — | Cadastro, histórico e acompanhamento central de metas |
| Leads | `/leads` | — | Lista e limpeza de leads |

### Padrão "Módulos Gêmeos" (`pipelineMode`)

Pré-Vendas e Recuperação compartilham **100% do código de UI** (tabs `GeralTab`, `SDRsTab`, `LeadsParadosTab`, componentes `AlertasCard`, `NoShowsPendentesCard`). A diferença é controlada por um único parâmetro:

```typescript
// usePreVendas.ts e LeadsParadosTab.tsx
pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
```

- `exclude_recuperacao` → `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)` — Pré-Vendas
- `only_recuperacao` → `.eq('pipeline_id', PIPELINE_RECUPERACAO_ID)` — Recuperação

**Regra:** toda mudança estética ou funcional nas tabs reflete automaticamente em ambos os módulos. Nunca criar tabs/componentes separados para Recuperação.

---

## Estrutura de Pastas
```
docs/
├── webhooks-ghl/           ← Documentação de webhooks GHL
│   ├── README.md
│   ├── REGRAS-EXTRACAO.md  ← LEIA PRIMEIRO
│   ├── EVENTOS.md
│   ├── EXEMPLOS-PAYLOADS.md
│   ├── MAPEAMENTO-CAMPOS.md
│   └── DECISOES/
supabase/
├── migrations/
└── functions/
    └── webhook-ghl/        ← Recebe webhooks GHL
```

## 🔄 Fluxo de Dados - Webhooks GHL (Automático - pg_cron)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    GHL (Source)                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼ POST
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              Edge Function (Deno)                                       │
│                         • Valida webhook secret                                         │
│                         • Salva JSON em webhooks_ghl                                    │
│                         • Retorna HTTP 200 imediatamente                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼ INSERT
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              webhooks_ghl                                               │
│                         (payload JSONB - imutável)                                      │
│                         • processado_em: NULL (novo)                                    │
│                         • processado_em: TIMESTAMPTZ (processado)                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼ ⏰ Job pg_cron (a cada 1 min)
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              processar_webhooks_pendentes()                             │
│                         • Busca webhooks não processados                                │
│                         • Processa em lotes de 100                                      │
│                         • Marca processado_em = NOW()                                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              extrair_dados_ghl_v2()                                     │
│                    Usa ghl_field_mappings por workspace:                                │
│                    • 70+ campos de contato (UTMs, SWOT, follow-ups)                     │
│                    • 25+ campos de oportunidade (datas com fallback)                    │
│                    • vendas_fechamento (contratos)                                      │
│                    • comunicacoes (mensagens/ligações)                                  │
│                    • reunioes (agendamentos)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────┐
│ contatos │  │oportunidades │  │vendas_        │  │comunicacoes  │  │reunioes  │
│  70+ cols│  │  25+ cols     │  │fechamento     │  │             │  │          │
│          │◄─┤              │  │              │  │             │  │          │
└──────────┘  └──────────────┘  └───────────────┘  └──────────────┘  └──────────┘
```

**Fluxo Automático (100% conforme Document_GHL.md):**
1. **GHL** envia webhook via workflow trigger
2. **Edge Function** valida secret e salva em `webhooks_ghl`
3. **Job pg_cron** executa a cada 1 minuto (assíncrono)
4. **Função** processa webhooks pendentes em lotes de 100
5. **Extração** distribui 100+ campos em 5 tabelas
6. **Mapeamentos** por workspace em `ghl_field_mappings` definem quais chaves GHL correspondem a cada campo lógico do Empire

**Características:**
- ✅ **Confiável:** Webhooks nunca perdem dados (INSERT sempre funciona)
- ✅ **Assíncrono:** Processamento não bloqueia recebimento
- ✅ **Tolerante:** Erro em um webhook não afeta os outros
- ✅ **Multi-conta:** Cada workspace pode ter seus próprios mapeamentos GHL
- ✅ **Completo:** Todos os campos do Document_GHL.md
- ✅ **Fallbacks:** Datas (mql → d_mql → sql → d_sql)
- ✅ **Cálculos:** valor_faturado derivado no frontend (entrada + parcelas × valor_parcela)
- ✅ **Idempotente:** Sem duplicatas
- ✅ **Observável:** `processado_em`, logs em `cron.job_run_details`

**Monitoramento:**
```sql
-- Webhooks pendentes
SELECT COUNT(*) FROM webhooks_ghl WHERE processado_em IS NULL;

-- Últimas execuções do job
SELECT * FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'processar-webhooks-ghl')
ORDER BY start_time DESC LIMIT 5;
```

---

### 🏛️ Evolução da Arquitetura

| Versão | Mecanismo | Quando | Status |
|--------|-----------|--------|--------|
| v1 | Trigger AFTER INSERT | 2026-02-18 → 2026-02-19 | ❌ Removido (erro em alta carga) |
| **v2** | **Job pg_cron (1 min)** | **2026-02-19 → atual** | **✅ Ativo** |

**Mudança ADR-005:** Ver [docs/DECISOES.md](./DECISOES.md)

---

## 📊 Modelo de Dados (Conforme Document_GHL.md)

### Resumo das Tabelas

| Tabela | Registros | Colunas | Propósito |
|--------|-----------|---------|-----------|
| `webhooks_ghl` | 201 | 4 | JSON bruto dos webhooks (imutável) + processado_em |
| `contatos` | 127 | 70+ | Dados completos do lead (UTMs, SWOT, follow-ups) |
| `oportunidades` | 126 | 35+ | Pipeline e follow-ups (datas MQL/SQL) |
| `vendas_fechamento` | 0 | 18 | Dados do contrato (quando fechar) |
| `comunicacoes` | 0 | 16 | Mensagens, ligações, AI conversations |
| `reunioes` | 0 | 11 | Agendamentos de reuniões |

### Tabela: `webhooks_ghl` (imutável + tracking)
Armazena payloads JSON brutos dos webhooks GHL.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK, gerado automaticamente |
| `payload` | JSONB | JSON bruto do webhook GHL (imutável) |
| `created_at` | TIMESTAMPTZ | Horário de recebimento (America/Sao_Paulo) |
| `processado_em` | TIMESTAMPTZ | **NOVO:** Horário de processamento (NULL = pendente) |

**Índices:**
- `idx_webhooks_ghl_payload` (GIN no payload)
- `idx_webhooks_ghl_processado` (parcial: WHERE processado_em IS NULL)

### Tabela: `contatos` (70+ colunas)
Armazena dados completos dos leads do GHL.

**Campos principais:**
| Categoria | Colunas |
|-----------|---------|
| **Base** | id, ghl_id, nome, email, telefone, primeiro_nome, ultimo_nome |
| **Atribuição** | ip, url, fbclid, gclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content |
| **Meta Ads (tt_)** | tt_term, tt_medium, tt_source, tt_content, tt_campaign |
| **SWOT** | swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas |
| **Follow-ups** | follow_up_1 a follow_up_15 |
| **Análise** | perfil_inteligente, faturamento_anual, como_nos_conheceu |
| **Reconciliação de Opps** | total_oportunidades_ghl, total_oportunidades_db |

### Tabela: `oportunidades` (35+ colunas)
Armazena pipeline e follow-ups (relacionamento 1:N com contatos).

**Campos principais:**
| Categoria | Colunas |
|-----------|---------|
| **Base** | id, ghl_opportunity_id, contato_id, titulo, valor, status |
| **SDR** | sdr_name (TEXT, NULL=pendente) — SDR da oportunidade, populado via API GHL Followers pela `sync-opp-sdr` |
| **Datas MQL** | data_mql_lead_recebido, data_mql_contato_1 a 8, data_mql_no_show, data_mql_conectado |
| **Datas SQL** | data_sql_reuniao_agendada, data_sql_reuniao_realizada, data_sql_negociacao, data_sql_fechada |
| **Qualificação** | vendedor_closer, resumo_ia, percepcao_closer, lost_reason |

> **SDR por oportunidade (2026-03-27):** `oportunidades.sdr_name` substituiu `contatos.owner_name` como fonte primária do SDR. Um mesmo lead pode ter opps em pipelines diferentes, cada uma com SDR diferente. `contatos.owner_name` é mantido apenas como fallback na edge function. Ver [`docs/SYNC-OPP-SDR.md`](SYNC-OPP-SDR.md).

### Tabela: `vendas_fechamento`
Dados do contrato quando o closer fecha venda. Gerada pelo `extrair_dados_ghl()` quando `data_pagamento_entrada` está preenchida.

| Coluna | Descrição |
|--------|-----------|
| `oportunidade_id` | FK → oportunidades.id |
| `contato_id` | FK → contatos.id |
| `nome_contratante`, `cpf_cnpj_contratante` | Dados do contratante |
| `logradouro_rua_avenida`, `numero_endereco`, `complemento_endereco` | Endereço (nomes exatos) |
| `bairro`, `municipio`, `estado_uf`, `cep` | Endereço (cont.) — `estado_uf`, não `estado` |
| `valor_entrada`, `numero_parcelas`, `valor_parcela` | Valores brutos |
| `forma_pagamento`, `produto_vendido`, `observacoes_venda` | Descritivos |
| `data_pagamento_entrada` | Critério de venda fechada |

> ⚠️ **`valor_faturado` NÃO é coluna do DB.** É calculado no frontend:
> `valor_faturado = valor_entrada + (numero_parcelas × valor_parcela)`

### Tabela: `comunicacoes`

Histórico completo de toda interação entre o time comercial e os leads: WhatsApp, SMS, email, ligações, DMs de Instagram/Facebook, chat do site. Sincronizado da GHL Conversations API a cada 30 minutos (cron) + backfill histórico executado em 2026-03-12 (~78k mensagens).

> Guia completo com queries prontas: [`docs/AI-INSTRUCTIONS.md § Tabela comunicacoes`](AI-INSTRUCTIONS.md)
> API source documentada: [`docs/APIS-DOCS/ghl-conversations-api.md`](APIS-DOCS/ghl-conversations-api.md)

**Três tipos de remetente nesta tabela:**
- **Lead** — enviou mensagem pro time (`direction = 'inbound'`)
- **Humano** — SDR/Closer digitou manualmente no app GHL (`direction = 'outbound'`, `ghl_source = 'app'`)
- **Automação/IA** — workflow, bot ou sistema disparou (`direction = 'outbound'`, `ghl_source = 'workflow'` ou `'api'`)

#### Colunas — Identificação e Relacionamento

| Coluna | Tipo | Interpretação |
|--------|------|---------------|
| `ghl_message_id` | TEXT UNIQUE | ID da mensagem no GHL. Chave de deduplicação — todos os upserts usam este campo. |
| `ghl_conversation_id` | TEXT | Agrupa todas as mensagens de um contato num mesmo canal. Muda se o lead mudar de canal. |
| `contato_id` | UUID | FK → `contatos` (nullable). NULL = contato existe no GHL mas não no nosso DB. |
| `contato_nome` | TEXT | Desnormalizado de `contatos.nome` no momento do sync. Pode estar desatualizado. |
| `contato_email` | TEXT | Desnormalizado de `contatos.email`. |
| `contato_telefone` | TEXT | Desnormalizado de `contatos.telefone`. |
| `sdr_name` | TEXT | Desnormalizado de `contatos.owner_name` (SDR responsável pelo lead). |

#### Colunas — Direção e Origem

| Coluna | Tipo | Valores e Interpretação |
|--------|------|------------------------|
| `direction` | TEXT | `'inbound'` = lead enviou \| `'outbound'` = time/sistema enviou \| `NULL` = histórico pré-2026-03-11 (sem info) |
| `ghl_source` | TEXT | `'app'` = humano digitou no app GHL \| `'workflow'` = bot/workflow GHL \| `'api'` = automação externa \| `NULL` = dados históricos pré-2026-03-12 |
| `usuario_ghl_id` | TEXT | ID do usuário GHL humano que enviou. `NULL` em outbound = automação/IA. `NULL` em inbound = normal (lead não tem user GHL). |
| `ghl_assigned_to` | TEXT | ID do usuário GHL atribuído à **conversa** (pode diferir de `usuario_ghl_id`, que é quem enviou **essa mensagem específica**). |

**Detectar automação/IA (robusto — cobre histórico e dados novos):**
```sql
WHERE direction = 'outbound'
  AND (ghl_source IN ('workflow', 'api', 'bot')
       OR (ghl_source IS NULL AND usuario_ghl_id IS NULL))
```

**Garantir que foi humano:**
```sql
WHERE direction = 'outbound' AND ghl_source = 'app' AND usuario_ghl_id IS NOT NULL
```

#### Colunas — Canal e Conteúdo

| Coluna | Tipo | Valores e Interpretação |
|--------|------|------------------------|
| `channel` | TEXT | `whatsapp` \| `sms` \| `email` \| `call` \| `facebook` \| `instagram` \| `gmb` \| `webchat` |
| `mensagem_body` | TEXT | Texto da mensagem. Em ligações pode ser transcrição (se disponível). |
| `mensagem_subject` | TEXT | Assunto do email. Só preenchido quando `channel = 'email'`. |
| `attachments` | JSONB | Array de URLs de mídia: `["https://...jpg", "https://...ogg"]`. NULL ou `[]` = sem anexos. |

**Particularidades por canal:**
- `whatsapp` — `msg_status` rico (read/delivered/failed), `alt_id` = wamid da API do WhatsApp Business
- `email` — `mensagem_subject` preenchido
- `call` — campos `phone_call_*` preenchidos; `mensagem_body` = transcrição se houver
- `sms` — `msg_status` menos confiável, sem confirmação de leitura
- `facebook`/`instagram` — `alt_id` = ID numérico Meta

#### Colunas — Status e Entrega

| Coluna | Tipo | Valores e Interpretação |
|--------|------|------------------------|
| `msg_status` | TEXT | `'sent'` = enviado, aguardando entrega \| `'delivered'` = chegou no dispositivo \| `'read'` = lead abriu (WhatsApp) \| `'failed'` = falhou — ver `error_msg` \| `'pending'` = na fila \| `'completed'` = ligação completada \| `NULL` = inbound ou histórico |
| `error_msg` | TEXT | Descrição do erro quando `msg_status = 'failed'`. Ex: `"Blocked by user"`, `"Invalid destination number or unreachable"`. |
| `ghl_date_updated` | TIMESTAMPTZ | Quando o GHL atualizou o status (entrega, leitura, falha). Diferente de `data_comunicacao` (criação). |
| `alt_id` | TEXT | ID da mensagem na plataforma de origem (wamid WhatsApp, ID Meta). Útil para auditoria e debugging. |
| `msg_from` | TEXT | Remetente para todos os canais (número, email ou ID de perfil). |
| `msg_to` | TEXT | Destinatário para todos os canais. |

**`msg_status` só é confiável para mensagens `outbound`.** Para `inbound`, geralmente vem `NULL`.

#### Colunas — Tempo

| Coluna | Tipo | Interpretação |
|--------|------|---------------|
| `data_comunicacao` | TIMESTAMPTZ | **Sempre usar este para análise temporal.** = `dateAdded` da GHL API — quando a mensagem foi criada/enviada. |
| `created_at` | TIMESTAMPTZ | Quando o registro entrou no Supabase. Pode ser horas ou dias depois (via backfill). **Nunca usar para filtrar por data de comunicação.** |

```sql
-- CORRETO
WHERE data_comunicacao >= '2026-03-01'

-- Converter para horário de Brasília ao exibir:
data_comunicacao AT TIME ZONE 'America/Sao_Paulo'
```

#### Colunas — Ligações (apenas quando `channel = 'call'`)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `phone_call_from` | TEXT | Número que originou a ligação |
| `phone_call_to` | TEXT | Número que recebeu a ligação |
| `phone_call_duration` | INTEGER | Duração em segundos. NULL se não completou. |
| `phone_call_status` | TEXT | `completed` \| `failed` \| `no-answer` \| `busy` \| `canceled` |

---

#### View `comunicacoes_com_remetente`

LEFT JOIN com `ghl_users` (que usa `papeis TEXT[]`, não `papel TEXT`). Usar para a maioria das análises — evita JOIN manual.

**Campos extras da view:**

| Campo | Tipo | Interpretação |
|-------|------|---------------|
| `remetente_nome` | TEXT | Nome do usuário GHL que enviou. NULL se lead ou automação sem userId. |
| `remetente_papeis` | TEXT[] | Array de papéis: `['sdr']`, `['closer']`, `['sdr','closer']`. NULL se não há usuário. |
| `remetente_email` | TEXT | Email do usuário GHL. |
| `is_automatico` | BOOLEAN | `true` se `ghl_source IN ('workflow','api','bot')` ou outbound sem userId. |
| `autor` | TEXT | Rótulo calculado — ver tabela abaixo. |

**Valores de `autor`:**

| Valor | Quando ocorre |
|-------|---------------|
| `'lead'` | `direction = 'inbound'` |
| `'automacao'` | `ghl_source IN ('workflow','api','bot')` ou outbound sem userId |
| `'sdr'` | Outbound, usuário GHL com papel `sdr` |
| `'closer'` | Outbound, usuário GHL com papel `closer` |
| `'social_seller'` | Outbound, usuário GHL com papel `social_seller` |
| `'gestor'` | Outbound, usuário GHL com papel `gestor` |
| `'sistema'` | Outbound, usuário GHL com papel `sistema` |
| `'time'` | Outbound, usuário GHL sem papel definido |
| `'desconhecido'` | direction NULL ou estado indeterminado |

---

#### Queries Prontas

```sql
-- Reconstruir conversa completa com um lead
SELECT data_comunicacao AT TIME ZONE 'America/Sao_Paulo' AS horario,
       autor, channel, ghl_source, msg_status,
       COALESCE(mensagem_body, '[ligação ' || COALESCE(phone_call_status,'') || ']') AS conteudo
FROM comunicacoes_com_remetente
WHERE contato_id = '{uuid}'
ORDER BY data_comunicacao;

-- Volume por autor e canal (últimos 30 dias)
SELECT autor, channel, COUNT(*) AS total
FROM comunicacoes_com_remetente
WHERE data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY autor, channel ORDER BY total DESC;

-- Proporção automação vs humano
SELECT
  CASE WHEN is_automatico THEN 'automacao' ELSE 'humano' END AS tipo,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM comunicacoes_com_remetente
WHERE direction = 'outbound'
  AND data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY is_automatico;

-- Mensagens com falha (últimos 7 dias)
SELECT contato_nome, channel, error_msg, data_comunicacao AT TIME ZONE 'America/Sao_Paulo'
FROM comunicacoes
WHERE msg_status = 'failed' AND data_comunicacao >= NOW() - INTERVAL '7 days'
ORDER BY data_comunicacao DESC;
```

**Índices:** `idx_comunicacoes_ghl_message_id` (UNIQUE), `idx_comunicacoes_direction_source`, `idx_comunicacoes_ghl_source`, `idx_comunicacoes_msg_status`, `idx_comunicacoes_alt_id`, `idx_comunicacoes_contato_channel_data`.

### Tabela: `reunioes`
Agendamentos de reuniões.

| Coluna | Descrição |
|--------|-----------|
| contato_id, oportunidade_id | Relacionamentos |
| titulo, notas | Dados da reunião |
| data_agendada, data_realizada | Datas |
| status | agendada \| realizada \| cancelada \| no_show |

### Relacionamentos
```
                              ┌─────────────────┐
                              │  webhooks_ghl   │
                              │   (JSON bruto)  │
                              └────────┬────────┘
                                       │ Job pg_cron
                                       ▼
                              ┌─────────────────┐
                              │processar_       │
                              │webhooks_        │
                              │pendentes()      │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────┐            ┌───────────────┐
│   contatos    │◄───────────│ oportunidades │◄───────────│vendas_        │
│    (1:N)      │   FK       │    (1:N)      │   FK       │fechamento     │
│  70+ colunas  │            │  35+ colunas  │            │ (0-1 por opp) │
└───────────────┘            └───────────────┘            └───────────────┘
        │
        ├──────────────────────────────────────────────────────────────┐
        │                                                              │
        ▼                                                              ▼
┌───────────────┐                                            ┌───────────────┐
│ comunicacoes  │                                            │   reunioes    │
│    (N por     │                                            │    (N por     │
│   contato)    │                                            │   contato)    │
└───────────────┘                                            └───────────────┘
```

## 🚨 Decisão Arquitetural Importante: Webhooks GHL

### Regra de Ouro
> **NENHUMA extração de dados de webhooks GHL pode ser feita sem documentação prévia em `docs/webhooks-ghl/`**

### Processo Obrigatório
1. Receber webhook em `webhooks_ghl` (json bruto)
2. Documentar payload em `EXEMPLOS-PAYLOADS.md`
3. Analisar e propor mapeamento
4. Criar decisão em `DECISOES/YYYYMMDD-nome.md`
5. Aprovação de arquiteto
6. Só então: criar tabela e extrair

### Documentação Completa
Ver: [docs/webhooks-ghl/README.md](./webhooks-ghl/README.md)

## 🔗 Integrações Externas

### GoHighLevel (GHL) — Webhooks + Sincronização
- **Webhooks (real-time):** Edge Function `webhook-ghl` recebe eventos de oportunidade/contato
- **Fila central GHL (`ghl_api_jobs` + `ghl-api-worker`):**
  - `ghl-api-worker` — **Todo minuto:** único ponto centralizado de saída para chamadas REST do GHL com rate limit compartilhado
  - `sync-opp-dates` — **A cada 10 minutos em `:02`:** enfileira `GET /opportunities/{id}`, drena resultados no início e no fim da request e aplica `data_lead_recebido`
  - `sync-opp-pipelines` — **A cada 10 minutos em `:04`:** enfileira `GET /opportunities/{id}`, drena resultados no início e no fim da request e aplica `pipeline_id` + `pipeline_name`
  - `sync-contact-tags` — **A cada 15 minutos:** primeiro repara `contatos.tags` via webhook em lote pequeno; depois enfileira `GET /contacts/{id}` para fallback e refresh
  - `sync-contact-attribution` — **A cada 5 minutos em `:01/:06/:11/...`:** enfileira `GET /contacts/{id}` para leads `form-fb`, traduz attribution Meta→padrão interno e enfileira `PUT /contacts/{id}` para preencher custom fields vazios
- **Sincronização direta fora da fila central (por enquanto):**
  - `sync-ghl-conversations-incremental` — **A cada 10 minutos:** sincroniza mensagens/ligações (comunicações) em tempo próximo do real. Saúde validada por `ghl_conversations_sync_log`
  - `sync-contact-opportunities` — **A cada 5 minutos:** sincroniza oportunidades por contato via fila própria `contact_opp_sync_queue`, com até **2 batches de 50** por execução (até 100 contatos por cron)

**📚 Documentação completa:** [`docs/CRONS-STATUS.md`](./CRONS-STATUS.md), [`docs/GHL-API-QUEUE.md`](./GHL-API-QUEUE.md), [`docs/COMUNICACOES-GHL-SYNC.md`](./COMUNICACOES-GHL-SYNC.md)

**⚠️ Problema conhecido (2026-03-16):** Webhook GHL às vezes não traz `pipeline_name` completo. Edge function `sync-opp-pipelines` sincroniza a cada 10min como rede de segurança automática.

### Meta Ads
- `sync-meta-ads` — **A cada 1 hora:** Sincronização incremental. Dados: `meta_ads_insights` + `meta_ads_sync_log`. Custo: ~0.5k req/dia.
- `sync-meta-ads-backfill` — Backfill histórico (manual, rate-limited 1 req/5s)
- `meta_ads_account_daily` — leitura por admin/owner da agência somente quando o workspace vinculado está `active`; a policy usa `can_access_workspace_via_agency(workspace_id)` e nunca concede acesso a outra agência ou subconta suspensa.

### Auditoria de permissões
- Alterações normais em permissões continuam registradas em `permission_audit_log`.
- Durante exclusão em cascata de um workspace, os triggers não criam um log órfão depois que o workspace foi removido; isso evita bloquear a exclusão sem ampliar permissões.

### Notion
- `notion-creatives-sync` — Sincroniza criativos de bases Notion (paid/organic) para `notion_creatives`

### OpenRouter (LLM Gateway)
- Acesso via API unificada. Primário: `z-ai/glm-5`, fallback: `anthropic/claude-sonnet-4.6`
- `prevendas-ai` — Análise one-shot de padrões. Cache 24h em `prevendas_ai_insights`
- Docs: [`docs/Integracoes/openrouter.md`](./Integracoes/openrouter.md)

---

## Módulo Dashboard > Tráfego (eb-dash2)

### Filtros e suas fontes de dados

| Filtro | Tabela fonte | Campo exibido | Valor usado no filtro |
|--------|-------------|---------------|-----------------------|
| Campanha Meta | `meta_ads_insights` | `campaign_name` | `campaign_name` |
| Conjunto Meta | `meta_ads_insights` | `adset_name` | `adset_name` |
| Anúncio Meta | `meta_ads_insights` | `ad_name` | `ad_name` |
| Canal | `utm_slugs` | `"{nome} ({slug})"` | `utm_slugs.nome` = `contatos.utm_source` |
| Funil [fn] | `funnels` | `nome` | cross-ref via `utm_campaigns.funnels` |
| Campanha [cp] | `utm_campaigns` | `nome` | cross-ref via `utm_campaigns.utm_campaign` |
| MQL/nMQL | client-side | pipeline_name | `Pré-Vendas MQL` / `Pré-Vendas nMQL` |

### Lógica de cross-referência filtros → leads → receita

**Filtro Funil [fn]:**
1. Buscar `utm_campaigns` cujo campo `funnels` (JSONB array de nomes) contém o funil selecionado
2. Coletar os `utm_campaign` codes desses registros
3. Filtrar `opps` onde `contatos.utm_campaign` está na lista de codes

**Filtro Campanha [cp]:**
1. Buscar `utm_campaigns` onde `nome === cpTag`
2. Pegar o `utm_campaign` code desse registro
3. Filtrar `opps` onde `contatos.utm_campaign === code`

**Revenue filtrada pelos leads filtrados:**
- Após filtrar opps (channel/funilTag/cpTag), coletar IDs dos opps filtrados
- `revenueRows` retornados pelo hook já são filtrados por esses IDs
- **NOTA (2026-03-20):** KPIs de faturamento/caixa/ROAS foram removidos da Visão Geral de Pré-Vendas. A tabela Cohort mantém coluna de Faturamento, mas sem cards de resumo acima.
  - **⚠️ REMOVIDA (2026-04-02):** A aba Visão Geral do módulo Pré-Vendas foi removida inteiramente. As análises de cohort estão now disponíveis nas abas MQLs e SDRs.

### Funil de conversão (COHORT)

6 etapas, exibidas como SVG trapezoid funnel:
1. **Leads gerados** — total de oportunidades no período (by `data_lead_recebido`)
2. **MQLs** — `pipeline_name = 'Pré-Vendas MQL'`
3. **Conectados** — `data_conectado IS NOT NULL`
4. **Agendados** — `data_agendamento_reuniao IS NOT NULL`
5. **Reuniões feitas** — `data_realizacao_vendas IS NOT NULL`
6. **Vendas fechadas** — `data_fechado IS NOT NULL`

Cada etapa do funil é clicável → abre `LeadListModal` com os leads daquela etapa.
Percentuais exibidos: % do total e % da etapa anterior (fontSize 13, gold, semi-bold).
Custo por etapa: `spend / count` exibido abaixo dos percentuais (fontSize 13, branco legível), só aparece quando `spend > 0`.
Números do count: fontSize 30, bold. Labels: fontSize 12, muted.

### KPI Cards (removido da Visão Geral em 2026-03-20)

⚠️ **DESCONTINUADO:** Cards de Faturamento, Caixa, ROAS e ROAS Caixa foram removidos da aba **Visão Geral** da Pré-Vendas (2026-03-20). A aba Visão Geral foi removida inteiramente em 2026-04-02. As análises de cohort estão now disponíveis nas abas MQLs e SDRs.

Métrica ainda está documentada abaixo para referência histórica:

| KPI | Fonte | Tabela |
|-----|-------|--------|
| Investimento | `SUM(spend)` | `meta_ads_insights` |
| Faturamento bruto | `SUM(valor_faturado)` filtrado por opp IDs | `vendas_fechamento` |
| Caixa recebido | `SUM(valor_entrada)` filtrado por opp IDs | `vendas_fechamento` |
| ROAS | valorFaturado / spend | calculado |
| ROAS Caixa | valorEntrada / spend | calculado |
| Impressões | `SUM(impressions)` | `meta_ads_insights` |
| Cliques | `SUM(clicks)` | `meta_ads_insights` |
| CTR | clicks / impressions × 100 | calculado |
| Leads (Meta) | `SUM(actions[action_type=lead].value)` | `meta_ads_insights` |

### Meta Ads sync: Edge Function sync-meta-ads + meta_ads_sync_log

- **Edge Function:** `sync-meta-ads` — chamada via `supabase.functions.invoke('sync-meta-ads')`
- **Log table:** `meta_ads_sync_log` — colunas: `id, started_at, finished_at, status, records_fetched, records_inserted, records_updated, error_message, execution_time_ms`
- **Banner de status:** exibido no topo dos filtros do Dashboard > Tráfego
- **Botão "Sincronizar agora":** dispara a Edge Function e re-busca o status após 2s

#### Constraint de unicidade (fix 2026-03-11)

Constraint corrigida de `UNIQUE(ad_id, date, hour)` → `UNIQUE(ad_id, date)`.

**Causa do bug anterior:** `hour = EXTRACT(HOUR FROM fetch_finished_at)` criava uma nova linha por sync (hora diferente = sem conflito). Cada linha continha o gasto acumulado do dia, então `SUM(spend)` multiplicava o valor real pelo número de syncs do dia.

**Comportamento atual:** cada sync faz `ON CONFLICT (ad_id, date) DO UPDATE` — atualiza a linha existente com os valores mais recentes da Meta API. O campo `hour` permanece na tabela (nullable) para uso futuro com breakdowns horários reais.

**Migrations aplicadas:**
- `20260311150000` — deduplicação de dados + nova constraint + função `processar_meta_ads_raw` corrigida
- `20260311160000` — coluna `hour` tornou-se nullable (necessário pois o sync diário não popula esse campo)

**Frontend:** query `meta_ads_insights` usa `.limit(5000)` para evitar truncamento silencioso (default Supabase = 1000 rows).

---

## Módulo Leads (eb-dash2)

### Tabela paginada e campos exibidos

- Paginação server-side: 50 por página, ordenação por qualquer campo
- Filtros: data, pipeline, status, vendedor, utm_source (client-side), busca de texto
- Colunas exibidas: nome, email, pipeline, status, data_lead_recebido, utm_source, vendedor_closer

### LeadCard: todas as abas e campos

**Aba Dados:**
- Identificação: email, telefone, pipeline, status, vendedor_closer, data_created
- Atribuição: utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, gclid
- Meta Ads extra/tt_ (condicional): tt_source, tt_campaign, tt_medium, tt_term, tt_content
- SDR/Owner (condicional): owner_name, owner_email
- Perfil (condicional): como_nos_conheceu, faturamento_anual, perfil_inteligente

**Aba Timeline:** (eventos ordenados por data asc)
- Lead recebido → Tentativas 1-8 → Conectado → Qualificado → No-show (pré-venda)
- → Reunião agendada → Reunião de vendas agendada → Reunião realizada
- → No-show (vendas) → Em negociação → Pendência de preenchimento
- → Venda fechada / Perdido (pré-venda) / Perdido (vendas)

**Aba Financeiro:**
- Valores: faturado, entrada, nº parcelas, valor_parcela, forma_pagamento, produto_vendido
- Contratante: nome, CPF/CNPJ
- Endereço: logradouro, bairro, município, estado, CEP
- Observações da venda

**Aba Observações:** resumo_ia, percepcao_closer, lost_reason

### Link GHL

- Formato: `https://app.gohighlevel.com/v2/location/{GHL_LOCATION_ID}/contacts/detail/{ghl_id}`
- `GHL_LOCATION_ID` configurado via `VITE_GHL_LOCATION_ID` env var

---

## Módulo Traqueamento (referência — eb-dash2)

### Tabs principais

| Tab (key) | Label | Descrição |
|-----------|-------|-----------|
| `cods_utm` | CODS UTM | Cadastro de slugs UTM, sources, campanhas, mediums e termos |
| `origem` | Origem | Grupos de origem e atribuição de sources |
| `anuncios` | Anúncios | Campanhas de anúncios, criativos e gerador de UTMs pago |
| `organico` | Orgânico | Produção orgânica (Notion) e gerador de UTMs orgânico |
| `funis` | Funis | Funis de conversão cadastrados |

### Sub-tabs por tab

**cods_utm:**
| Sub-tab (key) | Label | Tabela principal |
|---------------|-------|-----------------|
| `slug_utm` | Slug UTM | `utm_slugs` |
| `utm_source_ads` | UTM-SOURCE ADS | `utm_sources` (lista canônica de fontes pagas) |
| `utm_source_organico` | UTM-SOURCE Orgânico | `utm_sources_plain` |
| `utm_campaign` | UTM-CAMPAIGN | `utm_campaigns` |
| `utm_medium` | UTM-MEDIUM | `utm_mediums` |
| `utm_term` | UTM-TERM | `utm_terms` |

**anuncios:**
| Sub-tab (key) | Label | Status | Tabela principal |
|---------------|-------|--------|-----------------|
| `campanhas` | Campanhas | ✅ Implementado | `ads_campaigns` |
| `testes_criativos` | Testes de Criativos | 🔲 Placeholder | — |
| `catalogo_criativos` | Gerador de UTMs | ✅ Implementado | `ads_catalog` + `utm_objectives` + `notion_creatives` |
| `producao_notion` | Produção (Notion) | ✅ Implementado | `notion_creatives` (database_type = 'paid') |
| `producao_direta` | Produção (Direta) | 🔲 Placeholder | — |

**organico:**
| Sub-tab (key) | Label | Tabela principal |
|---------------|-------|-----------------|
| `producao` | Produção Orgânico | `notion_creatives` (database_type = 'organic') |
| `catalogo` | Gerador de UTMs | `organic_catalog` |

**origem:**
- Tabelas: `utm_origins` + `utm_source_origin_assignments`

**funis:**
- Tabela: `funnels`

### Tabelas de configuração do Traqueamento

| Tabela | Propósito | Colunas principais |
|--------|-----------|-------------------|
| `utm_sources` | **Fontes pagas (registro canônico)** — `utm_source` = valor exato salvo em `contatos.utm_source` | `id, workspace_id, utm_source` |
| `utm_slugs` | Sources cadastradas (nomes amigáveis) | `id, workspace_id, nome` (= label), `slug` (código curto) |
| `utm_sources_plain` | Sources orgânicas | `id, workspace_id, utm_source` |
| `utm_origins` | Grupos de origem (Pago / Orgânico / etc.) | `id, workspace_id, nome` |
| `utm_source_origin_assignments` | Junction slug → origin (UI de Traqueamento) | `utm_source, origin_id` |

> **IMPORTANTE — Filtro do Painel Tráfego:** O painel Tráfego (eb-dash2) usa `utm_sources.utm_source`
> como whitelist de tráfego pago. Não usa `utm_origins` nem `utm_source_origin_assignments` para esse fim.
> Essas duas tabelas são usadas apenas na UI de configuração do Traqueamento (aba Origem).
>
> **Cross-filter Meta ↔ CRM (2026-03-12):** Quando `filters.ad` ou `filters.campaign` estão ativos,
> os leads CRM também são filtrados — `filters.ad` cruza via `contatos.utm_term` (ad_name Meta = utm_term);
> `filters.campaign` cruza via `utm_campaigns.nome → utm_campaign code → contatos.utm_campaign`.
> `filters.adset` filtra apenas Meta Ads (conjuntos não têm campo correspondente em contatos).
>
> **Timezone (2026-03-12):** Datas usam `-03:00` (America/Sao_Paulo) para não perder leads das primeiras 3h de cada dia.
> **Canal filter (2026-03-12):** `<option value>` usa `utm_source` (slug), não o nome amigável.
| `utm_campaigns` | Campanhas UTM | `id, workspace_id, nome, utm_campaign` (número), `page_code, funnels` (JSONB array) |
| `utm_mediums` | Mediums UTM | `id, workspace_id, nome, utm_medium` (número) |
| `utm_terms` | Terms UTM | `id, workspace_id, nome, utm_term` (número) |
| `utm_objectives` | Objetivos de campanha | `id, workspace_id, nome, objective_code` |
| `funnels` | Funis de conversão | `id, workspace_id, nome` |
| `ads_campaigns` | Campanhas de anúncios | `id, workspace_id, objective_code, objective_name, page_name, campaign_date, code` |
| `ads_catalog` | Catálogo de UTMs pagos | `id, workspace_id, month_number, objective_*, public_*, creative_id, page_*, utm_campaign_number, utm_medium_*, url` |
| `organic_catalog` | Catálogo de UTMs orgânicos | `id, workspace_id, profile, utm_source_name, utm_source, utm_campaign_name, utm_campaign, utm_medium_name, utm_medium, utm_term_name, utm_term, utm_content, url` |
| `notion_creatives` | Criativos sincronizados do Notion | `id, workspace_id, database_type` ('paid'\|'organic'), `external_id, name, status, format, available_date, videos_folder_url, final_asset_url, creative_tested, test_started_at, synced_at` |

### Geração de códigos UTM (Anúncios)

**Código de campanha** (`ads_campaigns.code`):
```
{objetivo_code}_{page_name}_{campaign_date}
Ex: O1_Black Nov 25_30-10-2025
```

**Código do anúncio** (`utm_term` no catálogo):
```
M{MM}_{objective_code}_{public_code}_{creative_id}_{page_code}
Ex: M01_O1_PB01_C042_PG03
```

**URL final gerada** (ads_catalog):
```
{url}?utm_source={utm_source}&utm_medium={utm_medium}&utm_campaign={utm_campaign}&utm_content={creative_id}&utm_term={ad_code}
```

### Sincronização com Notion

- Edge Function: `notion-creatives-sync`
- Invocação: `supabase.functions.invoke('notion-creatives-sync', { body: { database_type: 'paid'|'organic', request_source: 'manual' } })`
- Botão "Sincronizar" disponível nas sub-tabs `producao_notion` e `producao` (orgânico)

---

## Módulo Pré-Vendas (eb-dash2)

Rota: `/pre-vendas` — performance do time de SDRs.

### Tabs

| Tab (key) | Label | Conteúdo |
|-----------|-------|---------|
| `sdrs` | SDRs | Leaderboard de SDRs com métricas individuais de funil |
| `leads_parados` | Leads Parados | **No-shows pendentes** (topo, com modal e LeadCard) → lista leads sem atividade + análise IA via `prevendas-ai` |

### Filtros globais do módulo

- **Período:** presets Hoje / 7d / 30d / Este mês + date range manual
- **SDR, Closer, Canal, Funil, Campanha** (dropdowns, opções derivadas dos dados)
- **Modo MQL toggle:** `todos` (default) vs `apenas MQL` — filtra `pipeline_name = 'Pré-Vendas MQL'` client-side

### Hooks

| Hook | Arquivo | Responsabilidade |
|------|---------|-----------------|
| `usePreVendas` | `src/hooks/usePreVendas.ts` | Busca opps + meta_ads_insights + vendas_fechamento; expõe helpers `computeFunnel`, `computeRevenueKpis`, `applyMqlFilter`, `spToday`, `spDaysAgo` |
| `useSDRLeaderboard` | `src/hooks/useSDRLeaderboard.ts` | Agrupa opps por `contatos.owner_name` para o leaderboard |
| `useCohort` | `src/hooks/useCohort.ts` | Análise cohort dos leads filtrados |
| `useGoalsModule` | `src/hooks/useGoalsModule.ts` | Carrega catálogo de indicadores, metas versionadas, snapshots, escopos e performance do módulo `/metas` |
| `useMetas` | `src/hooks/useMetas.ts` | Adaptador legado somente leitura: converte `goal_definitions` + `goal_versions` para o formato antigo de cards (`tipo`, `referencia`, `valor`, vigência) |
| `useLeadComunicacoes` | `src/hooks/useLeadComunicacoes.ts` | Busca até 500 comunicações de um contato (`contato_id`); separa `messages` (não-call) de `calls`; lazy — só ativa quando `contatoId` é fornecido |

### Análise de Cohort (Pré-Vendas)

⚠️ **REMOVIDA (2026-04-02):** A aba **Visão Geral** do módulo Pré-Vendas foi removida. A Matriz Cohort e as análises de conversão associatedas estão disponíveis nas abas **MQLs** e **SDRs**.

**Etapas de funil calculadas:**
1. **Leads recebidos** — `data_lead_recebido` no período
2. **Conectados** — `data_conectado IS NOT NULL`
3. **Agendados** — `data_agendamento_reuniao IS NOT NULL`
4. **Reuniões feitas** — `data_realizacao_vendas IS NOT NULL`
5. **Vendas fechadas** — `data_fechado IS NOT NULL`

### 🐛 Bugfixes: Pré-Vendas (2026-03-12)

**12 bugs críticos corrigidos** em hooks, tabs e cálculos de período:

| Bug | Arquivo | Problema | Correção |
|-----|---------|----------|----------|
| BUG-01 | `useSDRLeaderboard.ts` | `.in('tipo', [...])` — campo não existe em dados novos | `.eq('channel', 'call')` para ligações |
| BUG-02 | `useSDRLeaderboard.ts` | `.gte('created_at', ...)` — data errada de backfill | `.gte('data_comunicacao', ...)` + filtro humano `ghl_source='app'` |
| BUG-03 | `LeadsParadosTab.tsx` | 4 usos de `created_at` (select, order, filter, compare) | Todos trocados para `data_comunicacao` |
| BUG-04 | `LeadsParadosTab.tsx` | Quadrante 2 inclui bots na fila de "Aguardando SDR" | Adicionado `.eq('ghl_source', 'app')` |
| BUG-05 | `PreVendasPage.tsx` | `computeRevenueKpis()` ignora filtro MQL | Criado `filteredRevenueRows` respeitando `filteredOpps` |
| BUG-06 | `LeadsParadosTab.tsx` | No-shows alertas sem limite de data recente | Adicionado `.gte('data_agendamento_reuniao', d30ago)` |
| BUG-07 | `LeadsParadosTab.tsx` | Contagem "leads antigos" inclui todos pipelines | Adicionado `.in('pipeline_name', ['Pré-Vendas MQL', 'Pré-Vendas nMQL'])` |
| BUG-08 | `LeadsParadosTab.tsx` | Múltiplas opps por contato — ordem não-determinística | Adicionado `.order('data_lead_recebido', {desc})` |
| BUG-09 | `useSDRLeaderboard.ts` | Timezone `-03:00` inconsistente com usePreVendas | Alinhado para `+00:00` |
| BUG-10 | `SDRsTab.tsx` | Sparkline parse date sem timezone | Resolvido definitivamente: `data_agendamento_reuniao` agora é tipo `DATE` — `.slice(0, 10)` direto, sem conversão de timezone |
| BUG-11 | `useCohort.ts` | `conectados_pct` pode ultrapassar 100% | Trocado denominador de `mqls` para `leads_count` |
| BUG-12 | `useCohort.ts` | Última tentativa assume ordem crescente de campos | Substituído por `Math.max(...dates)` |

**Impacto:** Coluna "Ligações/Mensagens" agora mostra dados corretos; Quadrante 2 não mostra respostas de bot; filtro MQL afeta faturamento; cálculos cohort robustos.

### Edge Function: `prevendas-ai`

- **Modelo:** `z-ai/glm-5` (fallback: `anthropic/claude-sonnet-4.6`) via OpenRouter
- **Cache:** 24h em `prevendas_ai_insights` (chave: `workspace_id + SHA256(payload)`)
- **Output:** `{ padroes: string[], recomendacoes: string[], grupos: { label, leads_indices }[] }`
- **Invocação:** `supabase.functions.invoke('prevendas-ai', { body: { workspace_id, leads } })`

### Tabela: `prevendas_ai_insights`

Cache de análises IA para o módulo Pré-Vendas.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `workspace_id` | UUID | Workspace dono do cache |
| `input_hash` | TEXT | SHA256 hex do payload enviado |
| `resultado` | JSONB | `{ padroes, recomendacoes, grupos }` |
| `created_at` | TIMESTAMPTZ | Timestamp de geração (TTL manual de 24h) |

**Constraint:** `UNIQUE(workspace_id, input_hash)`
**RLS:** membros do workspace leem; apenas service_role insere.

---

## Tabelas do sistema (referência completa)

| Tabela | Propósito | Colunas-chave |
|--------|-----------|---------------|
| `webhooks_ghl` | JSON bruto de webhooks GHL (imutável) | id, payload JSONB, created_at, processado_em |
| `contatos` | Dados do lead/contato (70+ cols) | ghl_id, nome, email, telefone, utm_*, tt_*, fbclid, gclid, owner_*, date_created, perfil_inteligente, como_nos_conheceu, faturamento_anual |
| `oportunidades` | Pipeline e follow-ups (35+ cols) | id, contato_id, pipeline_name, pipeline_id, status, vendedor_closer, lost_reason, **data_lead_recebido (TIMESTAMPTZ)**, data_conectado, data_qualificado, data_no_show, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, data_perdido, data_perdido_vendas, data_negociacao, data_no_show_vendas, data_agendamento_vendas, data_pendencias_preenchimento, data_tentativa_1..8 **(23 colunas de pipeline = tipo DATE desde 2026-03-15)**, resumo_ia, percepcao_closer |
| `vendas_fechamento` | Dados do contrato de venda | oportunidade_id, valor_faturado (calculado), valor_entrada, numero_parcelas, valor_parcela, forma_pagamento, produto_vendido, data_pagamento_entrada, nome_contratante, cpf_cnpj_contratante, logradouro, bairro, municipio, estado, cep, observacoes_venda |
| `comunicacoes` | Mensagens e ligações (GHL Conversations API) | contato_id, ghl_message_id (UNIQUE), channel, direction, ghl_source, msg_status, ghl_date_updated, alt_id, error_msg, msg_from, msg_to, usuario_ghl_id, ghl_assigned_to, data_comunicacao, mensagem_body, attachments JSONB, phone_call_* |
| `reunioes` | Agendamentos | contato_id, oportunidade_id, titulo, notas, data_agendada, data_realizada, status |
| `contact_opp_sync_queue` | Fila operacional de sync de oportunidades por contato | ghl_contact_id, location_id, status, attempts, claimed_at, last_error, processed_at |
| `ghl_api_jobs` | Fila centralizada para chamadas REST do GHL | url, method, priority, status, attempts, caller, idempotency_key, context, claimed_at, processed_at, handled_at |
| `ghl_opp_reconcile_runs` | Runs de auditoria/backfill de oportunidades | mode, source, status, total_contacts, processed_contacts, opportunities_missing, opportunities_inserted, opportunities_updated |
| `ghl_opp_reconcile_items` | Itens por contato dentro de um run | run_id, contato_id, ghl_contact_id, location_id, status, attempts, missing_in_db, extra_in_db, updated_in_db |
| `metas` | Metas configuráveis do dashboard com vigência própria | workspace_id, tipo, referencia, valor, periodo_inicio, periodo_fim, periodo |
| `goal_metric_definitions` | Catálogo de indicadores do módulo Metas | area_key, metric_key, analysis_mode, tracking_mode, provider_key, legacy_tipo, supported_scope_types |
| `goal_definitions` | Identidade lógica da meta por indicador + escopo | workspace_id, metric_definition_id, scope_type, scope_id, scope_label, notes |
| `goal_versions` | Versões históricas da meta com vigência própria | goal_definition_id, target_value, period_start, period_end, cadence, notes |
| `goal_snapshots` | Snapshots de acompanhamento da meta | goal_version_id, snapshot_date, actual_value, ideal_value, projected_value, status, payload |
| `meta_ads_insights` | Dados de performance Meta Ads | date, campaign_name, adset_name, ad_name, spend, impressions, clicks, ctr, actions JSONB |
| `meta_ads_sync_log` | Log de sincronização Meta Ads | id, started_at, finished_at, status, records_fetched, records_inserted, records_updated, error_message, execution_time_ms |
| `utm_slugs` | Sources de tráfego (legado) | id, workspace_id, nome, slug |
| `utm_sources` | Sources de tráfego pago | id, workspace_id, nome, utm_source, public_code |
| `utm_sources_plain` | Sources orgânicas | id, workspace_id, utm_source |
| `utm_origins` | Grupos de origem | id, workspace_id, nome |
| `utm_source_origin_assignments` | Junction source → origin | utm_source, origin_id |
| `utm_campaigns` | Campanhas UTM | id, workspace_id, nome, utm_campaign, page_code, funnels JSONB |
| `utm_mediums` | Mediums UTM | id, workspace_id, nome, utm_medium |
| `utm_terms` | Terms UTM | id, workspace_id, nome, utm_term |
| `utm_objectives` | Objetivos de campanha | id, workspace_id, nome, objective_code |
| `funnels` | Funis de conversão | id, workspace_id, nome |
| `ads_campaigns` | Campanhas de anúncios | id, workspace_id, objective_code, objective_name, page_name, campaign_date, code |
| `ads_catalog` | Catálogo de UTMs pagos | id, workspace_id, month_number, objective_*, public_*, creative_id, page_*, utm_campaign_number, utm_medium_*, url |
| `organic_catalog` | Catálogo de UTMs orgânicos | id, workspace_id, profile, utm_source_name, utm_source, utm_campaign_*, utm_medium_*, utm_term_*, utm_content, url |
| `notion_creatives` | Criativos do Notion | id, workspace_id, database_type, external_id, name, status, format, available_date, videos_folder_url, final_asset_url, creative_tested, test_started_at, synced_at |
| `prevendas_ai_insights` | Cache de análise IA (Pré-Vendas) | id, workspace_id, input_hash (SHA256), resultado JSONB, created_at |

---

## Módulo Gestão de Usuários (eb-dash2)

Rota: `/settings/users` — gerenciamento do time GHL e controle de acesso ao dashboard.

### Tabs

| Tab | Conteúdo |
|-----|---------|
| GHL — Time | Lista todos os `ghl_users` (29 usuários do location). Edição inline de papéis com debounce 800ms. Coluna "Acesso ao Sistema" com badge (Sem acesso / Ativo). Dropdown: Conceder acesso / Permissões / Revogar acesso. |
| Sistema — Acesso | Membros com login ativo (`workspace_members`). Gerenciamento de role (Admin/Membro) e permissões de módulo. Botão "Adicionar externo" para convidar e-mails fora do GHL. |

### Componentes

- **`PapelSelector`** (`src/components/users/PapelSelector.tsx`) — chips multi-papel coloridos com check icon ao selecionar
- **`InviteUserDialog`** — 3 etapas: email, papel no sistema (Admin/Membro), permissões de módulo. Auto-preenche permissões com base em `PAPEL_CONFIG[papel].defaultPermissions`.
- **`PermissionsDialog`** — árvore de módulos com checkboxes Ver/Editar, expande sub-módulos.

### Fluxo GHL User → Auth User

```
ghl_users (nome, papeis[])
    ↓ admin clica "Conceder acesso"
invite-user (edge fn)
    ↓ inviteUserByEmail
auth.users (novo usuário, convite por email)
    ↓ aceita convite
workspace_members (role = admin | member)
    ↓ permissões de módulo
dashboard_user_permissions (can_view, can_edit por module_key)

ghl_users.auth_user_id = auth.users.id  (link bidirecional)
```

### PAPEL_CONFIG

| Papel | Cor | Permissões padrão |
|-------|-----|-------------------|
| `sdr` | azul #60a5fa | pre_vendas |
| `closer` | violeta #a78bfa | leads, dashboard.trafego |
| `social_seller` | laranja #fb923c | traqueamento.organico |
| `gestor` | gold #C9A240 | dashboard, leads, pre_vendas, traqueamento |
| `sistema` | slate #94a3b8 | (nenhuma) |

### Edge Function: invite-user

`POST /functions/v1/invite-user`

Body: `{ email, workspaceId, workspaceRole, ghlUserId?, permissions? }`

Fluxo: `inviteUserByEmail` → `workspace_members` upsert → `dashboard_user_permissions` insert → `ghl_users.auth_user_id` update

---

## 🎯 Matching de Anúncios (utm_term → Nomes Descritivos)

### Problema

Os leads chegam ao sistema com um campo `utm_term` que contém um **código estruturado** do anúncio (ex: `M1_O1_P29_CR-248_PG12`), mas esse código sozinho não é legível em relatórios. Precisamos conectar esse código ao **nome descritivo** do anúncio catalogado (ex: "M1_O1_P29_CR-248_PG12 - (Pedro e Breno) Personagem Breno e P...").

### Solução Implementada

**3 tabelas envolvidas:**

| Tabela | Papel | Relação |
|--------|-------|---------|
| `contatos` | Contém `utm_term` do lead | Source dos codes |
| `ads_catalog` | Histórico completo de anúncios gerados (incompleto em produção) | Lookup by `utm_term` |
| `notion_creatives` | Catálogo de criativos Notion sincronizados | Nomes legíveis |

**Estrutura do utm_term:**
```
M[MÊS]_O[OBJETIVO]_P[PÁGINA]_CR-[CRIATIVO]_PG[PÚBLICO]

Exemplo: M1_O1_P29_CR-248_PG12
```

### Algoritmo de Matching

**Passo 1:** Extrair `creative_id` do utm_term usando regex `CR-(\d+)` → `CR-248`

**Passo 2:** Buscar em `notion_creatives` onde `external_id = 'CR-248'`

**Passo 3:** Retornar `notion_creatives.name` se encontrado, senão exibir "sem nome catalogado"

### Implementação (Frontend Hook)

Exemplo no hook `useTrafego.ts` (linhas 120-150 aprox.):

```typescript
// 1. Fetch contatos com utm_term
const contacts = await supabase
  .from('contatos')
  .select('utm_term')
  .not('utm_term', 'is', null)
  .gte('date_created', startDate)
  .lte('date_created', endDate)

// 2. Fetch todos os criativos
const { data: creatives } = await supabase
  .from('notion_creatives')
  .select('external_id, name, database_type')
  .eq('database_type', 'paid')

// 3. Build creative lookup map
const creativeMap = new Map<string, string>()
creatives.forEach((c) => {
  creativeMap.set(c.external_id, c.name)
})

// 4. Extract creative ID e buscar nome
const extractCreativeId = (utm_term: string): string | null => {
  const match = utm_term.match(/CR-(\d+)/)
  return match ? `CR-${match[1]}` : null
}

const adCounts = {}
contacts.forEach((row) => {
  if (!adCounts[row.utm_term]) {
    const creativeId = extractCreativeId(row.utm_term)
    const creativeName = creativeId ? creativeMap.get(creativeId) : null
    adCounts[row.utm_term] = {
      count: 0,
      creative_id: creativeId,
      creative_name: creativeName
    }
  }
  adCounts[row.utm_term].count += 1
})
```

### Cobertura de Dados (Fevereiro 2026)

- **Total de leads com utm_term:** 972
- **Total de anúncios distintos:** 37
- **Anúncios com nome catalogado:** 35/37 (94.6%)
- **Anúncios sem nome:** 2 (ex: "00 - MixEnvolvimento Acelerador" — manual, fora do padrão)

### Top 5 Anúncios (Fevereiro 2026)

| Rank | Código | Criativo | Leads |
|------|--------|----------|-------|
| 1 | M1_O1_P29_CR-248_PG12 | (Pedro e Breno) Personagem Breno e P... | 184 |
| 2 | M1_O1_P29_CR-2_PG12 | [TR] (Davi) | 178 |
| 3 | M2_O1_P26_CR-567_PG24 | Se você não gosta de pular carnaval | 141 |
| 4 | M1_O1_P29_CR-324_PG12 | [TR] (Davi) Compilado: Esse é o perf... | 98 |
| 5 | M1_O1_P29_CR-408_PG12 | [TR] (Pedro) Perfil do Thiago Reis q... | 74 |

### Referências

- **Documentação de Matching:** `docs/CORRELACAO-META-CRM.md` (seções 3-5)
- **Schema das Tabelas:** `docs/TABELAS-SISTEMA.md` seção "notion_creatives"
- **Query Completa:** Script em `eb-dash2/query_top_ads_v3.ts` (benchmark October 2026)

---

## Decisões Arquiteturais
Ver arquivo [DECISOES.md](./DECISOES.md)

## Data de atualização
- 2026-02-18 - Adicionada arquitetura de webhooks GHL
- 2026-02-19 - Implementação completa Document_GHL.md (5 tabelas, 100+ campos)
- **2026-02-19 - Refatoração: Trigger → Job pg_cron (ADR-005)**
- **2026-02-26 - Módulo de Assistente de IA removido (feature abandonada)**
- **2026-03-11 - Documentação completa dos módulos Dashboard/Tráfego, Leads, Traqueamento (eb-dash2)**
- **2026-03-11 - Traqueamento: adicionadas tabs Anúncios e Orgânico, sub-tabs completas, novas tabelas (utm_sources, utm_mediums, utm_terms, utm_objectives, ads_campaigns, ads_catalog, organic_catalog, notion_creatives)**
- **2026-03-11 - Dashboard/Tráfego: funil SVG com números maiores (fontSize 30), custo por etapa (spend/count) e percentuais mais legíveis (fontSize 13)**
- **2026-03-12 - LeadCard: adicionada aba Comunicações (hook `useLeadComunicacoes`, bolhas de chat + seção de ligações); fix: `contato_id` adicionado ao `OPP_SELECT_FULL`**
- **2026-03-11 - Módulo Pré-Vendas documentado: rota /pre-vendas, 4 tabs, edge fn prevendas-ai, tabela prevendas_ai_insights, comunicacoes.direction**
- **2026-03-11 - Stack corrigida: eb-dash2 é Vite+React 18 (ativo); eb-dash Next.js é legado**
- **2026-03-11 - Edge functions sync-meta-ads-backfill e prevendas-ai adicionadas às integrações**
- **2026-03-11 - Fix owner_name: extrair_dados_ghl agora lê de customData->>'Owner (SDR ou SS)' (era payload root)**
- **2026-03-11 - Módulo Gestão de Usuários: ghl_users.papel TEXT → papeis TEXT[], auth_user_id UUID, UsersPage /settings/users, edge fn invite-user**
- **2026-03-12 - Auditoria tipográfica DS1: corrigidas violações de contraste (opacity-70 em th, text-primary/60 em contexto claro), tamanhos abaixo de 11px em SVG, font-mono text-xs → text-[var(--text-13)], section labels sem gold. Regras 10-16 adicionadas às proibições DS1.**
- **2026-03-12 - comunicacoes: +8 colunas da GHL API (ghl_source, msg_status, ghl_date_updated, alt_id, error_msg, msg_from, msg_to, ghl_assigned_to). View com is_automatico + autor='automacao'. Detecção de IA via ghl_source. Backfill histórico ~55k mensagens via scripts/backfill-comunicacoes.py**
- **2026-03-12 - 🐛 Bugfixes Pré-Vendas: Corrigidos 12 bugs críticos (BUG-01 a BUG-12) em useSDRLeaderboard, LeadsParadosTab, PreVendasPage, useCohort, SDRsTab. Principais: campo `tipo` → `channel`, `created_at` → `data_comunicacao`, filtro automação, revenue MQL, cálculos cohort. Ver seção "🐛 Bugfixes: Pré-Vendas (2026-03-12)" em Análise de Cohort.**
- **2026-03-12 - Fix extrair_dados_ghl: UPDATE de contatos agora inclui utm_source/medium/campaign/term/content. Webhook é fonte de verdade — sempre sobrescreve (não usa COALESCE com valor antigo). Migration 20260312210000.**
- **2026-03-12 - Backfill cohort fev/26: re-execução de extrair_dados_ghl() para 4 leads de fevereiro (mcharliston, danieltiago + 2 já corretos) via migration 20260312220000. Garante data_fechado preenchida → cohort exibe 4 vendas (era 3).**
- **2026-03-12 - 🐛 BUG CRÍTICO: usePreVendas paginação — PostgREST max_rows=1000 ignorava .limit(10000). Fevereiro tem 1163 opps; 163 leads (incl. danieltiago) nunca chegavam ao frontend. Fix: loop paginado com .range() em usePreVendas.ts. Regra: TODA query que pode ter >1000 rows DEVE usar paginação.**
- **2026-03-15 - Mudança arquitetural: 23 colunas de pipeline em `oportunidades` convertidas de TIMESTAMPTZ para DATE. `parse_safe_date()` e `parse_date_flexible()` agora retornam DATE. `extrair_dados_ghl()` atualizada. Novo arquivo `eb-dash2/src/lib/utils/dates.ts` centraliza todos os utilitários de data do frontend. `data_lead_recebido` permanece TIMESTAMPTZ (via sync-opp-dates). Ver `docs/PADRAO-TIMEZONE.md`.**
- **2026-03-17 - Novo sistema: sync-contact-opportunities. Edge function que sincroniza TODAS as oportunidades de um contato via API GHL quando ContactCreate webhook chega. Soluciona problema de leads "invisíveis" em importações em massa. Nova tabela `contact_opp_sync_queue` (deduplicada) com trigger + cron a cada 5 min. Taxa limite adaptativa idêntica ao sync-opp-dates. Ver `docs/SYNC-OPP-DATES.md` seção "sync-contact-opportunities".**
- **2026-03-20 - Robustez de oportunidades GHL: `sync-contact-opportunities` passou a usar claim atômico via RPC (`claim_contact_opp_sync_queue`) + reclaim de itens presos (`requeue_stale_contact_opp_sync_queue`) + merge com dados existentes para não zerar campos com `null` da API. Na mesma data, a edge function passou a processar até 2 batches de 50 por execução, elevando a vazão efetiva para até 100 contatos por disparo do cron legado `*/5`. Novas tabelas `ghl_opp_reconcile_runs` e `ghl_opp_reconcile_items` suportam auditoria/backfill completo de oportunidades. Nova edge function `reconcile-contact-opportunities` executa runs `audit` ou `write`. Novos crons: starter diário 03:00 BRT (`ghl-opp-reconcile-nightly-start`) e processor `*/5` (`ghl-opp-reconcile-processor`). Ver `docs/SYNC-CONTACT-OPPORTUNITIES.md`.**
- **2026-03-20 - Reconciliação de oportunidades por contato: tabela `contatos` ganhou os campos `total_oportunidades_ghl` e `total_oportunidades_db`. O run noturno `mode=write` agora persiste esses contadores para facilitar identificação de defasagem e futuros crons corretivos por contato.**
- **2026-03-20 - Fila central GHL ativada no caminho real: `sync-opp-dates`, `sync-opp-pipelines` e `sync-contact-tags` passaram a enfileirar em `ghl_api_jobs` e depender do `ghl-api-worker` para chamar a API GHL. A fila ganhou `context`, `claimed_at`, `handled_at` e reclaim de stale. Auditoria final em produção: `data_lead_recebido NULL = 0`, `pipeline_id NULL = 0`, `pipeline_name NULL com pipeline preenchido = 0`, `contatos.tags NULL = 0`, `ghl_api_jobs pending = 0`, `processing = 0`.**
- **2026-03-20 - Fechamento da janela de reaplicação nas opps GHL: `sync-opp-dates` e `sync-opp-pipelines` passaram a executar um segundo drain de jobs `done` / `dead` no fim da própria request. Motivo: eliminar o gap curto entre `processed_at` e `handled_at` que ainda podia deixar 1 oportunidade residual até o próximo cron. Auditoria final às 23:07 BRT: `pipeline_id NULL = 0`, `data_lead_recebido NULL = 0`, `ghl_api_jobs pending = 0`, `processing = 0`.**
- **2026-03-18 - 🚀 Sistema de Faturamento: Trigger auto-preenche `vendas_fechamento`. Migration 20260318040000 criou trigger `tr_extrair_vendas_fechamento` que dispara após INSERT em webhooks_ghl. Função `extrair_vendas_fechamento_do_webhook()` extrai valor_entrada, numero_parcelas, valor_parcela, data_pagamento_entrada + dados de contrato. Migration 20260318050000 fez backfill de 4.864 registros. Migration 20260318060000 CORRIGIU nomes de campos ({{ opportunity.valor_a_ser_pago_de_entrada }} estava errado em v1). Resultado: 45 registros com R$ 1.494.611,15 faturado. Coluna "Faturamento" exibida na Matriz Cohort. Ver `docs/VENDAS-FECHAMENTO.md`.**
- **2026-03-20 - Removidos KPI Cards de receita (Faturamento, Caixa, ROAS, ROAS Caixa) da Visão Geral de Pré-Vendas. A tabela Cohort mantém coluna "Faturamento" para análise granular por cohort. Migration: remove props de `GeralTab`, clean-up imports em `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`.**
- **2026-03-20 - LeadCard: Renderizar com `createPortal(..., document.body)` para escapar stacking contexts de ancestrais com `transform/filter/will-change`. Fix: drawer não fica mais "travado" no canto quando página scrollada. Adicionado toggle fullscreen com ícones `Maximize2/Minimize2`, width dinâmica `w-[520px]` → `w-screen`, transição suave via `transition-[transform,width]`. Padrão documentado em `docs/FRONTEND-EB-DASH2.md` seção "Componentes Portalizados".**
- **2026-03-21 - 🚀 Edge Function sync-opp-pipelines: Sincroniza `pipeline_id` para 4356 oportunidades que chegaram via webhook sem pipeline. Problema: PostgREST filtra NULL = UNKNOWN → leads invisíveis em dashboard. Solução: GET /opportunities/{id} via API GHL, extrai pipelineId, atualiza banco. Cron automático a cada 10 min (batch=100). Rate limiting: 130ms entre reqs + exponential backoff para 429. Migration 20260321000000. Deployment: 2026-03-21 21:30 UTC.**
- **2026-03-19 - ✨ Tags de contato GHL: nova coluna `tags TEXT` em `contatos`. Edge function `sync-contact-tags` (GET /contacts/{id} → contact.tags[]) + cron 15min. Função auxiliar `extract_ghl_tags(JSONB)` normaliza array JSON `["mql","[fn] app"]` para CSV `"mql,[fn] app"`. `extrair_dados_ghl` usa `extract_ghl_tags()` preventivamente. Frontend: `isMqlByTag()` em `useTrafego.ts` detecta MQL por tag. LeadCard exibe badges coloridos (`[fn]`=azul, `[cp]`=laranja, `mql`/`sql`=verde, `nmql`/`nsql`=vermelho). Backfill: ~6.900 contatos via cron. Decisão: `docs/webhooks-ghl/DECISOES/20260319-tags-contato-ghl.md`.**
- **2026-03-22 - ✅ Backfill sync-opp-pipelines: 100% CONCLUÍDO. Fase 1 (cron automático 2026-03-21 21:30 → 2026-03-22 05:00): ~3500 opps em 7h. Fase 2 (backfill acelerado manual 2026-03-22 ~15:00): 863 opps em 10min via script Node.js. Total: 4356/4356 opps (100%). Verificação: SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL; = 0 ✅. Lead `eduardosampaio.mb@gmail.com` agora visível em cohort. Todos os 4356 aparecem em painéis tráfego/pré-vendas. Cron continua como fallback para novos webhooks incompletos.**
- **2026-03-24 - 🔔 OpenClaw robusto para contrato assinado: migration `20260324010000` separou o trigger de `webhooks_ghl` do trigger de `vendas_fechamento`, eliminando a colisão de função reaproveitada entre tabelas. O fluxo agora cobre as duas ordens reais do processo: `link → Assinada` e `Assinada → link`. A idempotência passou a ser centralizada em `oportunidades.openclaw_notificado_em`, e o trigger de stage volta a disparar no drag do card para `Assinada`, com busca do link no webhook atual ou no histórico. Ver `docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md`.**
- **2026-03-24 - 🧷 Backfill de idempotência OpenClaw: migration `20260324020000` marcou contratos históricos já assinados como notificados em `oportunidades.openclaw_notificado_em`, evitando reenvio quando alguém edita uma oportunidade antiga. O backfill só considera leads com link de contrato e que já estejam em `Assinada` no pipeline Vendas SQL, ou com `data_da_assinatura_do_contrato` preenchida.**
- **2026-03-24 - 🔁 OpenClaw com entrega confirmada: migration `20260324030000` parou de tratar `net.http_post()` como sucesso final. O banco agora grava `openclaw_request_id`, timestamps/status/erro da tentativa, confirma `openclaw_notificado_em` apenas depois de resposta `2xx`, e usa o cron SQL `openclaw-contrato-assinado-retry` para sincronizar respostas e reenfileirar falhas/timeout automaticamente.**
- **2026-03-24 - ⏱️ Timeout OpenClaw ajustado: migration `20260324031000` elevou o `timeout_milliseconds` do `net.http_post` para `30000 ms` depois que um teste real controlado registrou erro de `5000 ms` no endpoint. O reteste no mesmo lead fake retornou `status_code = 200`.**
- **2026-03-23 - 🧹 Limpeza de schema em `contatos`: coluna `hashtags` removida por migration `20260324032000`. Verificação prévia confirmou que o backend já não populava o campo, o frontend só o usava para exibição no detalhe do lead, e o banco acessado pelo app estava com `0` linhas úteis (`IS NOT NULL = 0`, `= '' = 0`).**
- **2026-03-20 - Auditoria webhook/cohort/crons: `sync-opp-dates` deixou de gravar timestamp fake quando a API GHL falha. Falhas agora permanecem com `data_lead_recebido = NULL` para retry e diagnóstico real. Edge functions críticas (`webhook-ghl`, `sync-opp-dates`, `sync-opp-pipelines`, `sync-contact-opportunities`, `sync-contact-tags`, `sync-ghl-conversations`) aceitam tanto `SUPABASE_*` quanto `SB_*` para reduzir erro de configuração. Monitoramento correto de conversas passa a usar `ghl_conversations_sync_log`, não `comunicacoes.created_at`. Script operacional adicionado: `scripts/audit-ghl-sync-health.js`.**
- **2026-04-08 - Repair de attribution Facebook Form: nova edge function `sync-contact-attribution` lê `GET /contacts/{id}` do GHL, traduz `attributionSource/lastAttributionSource` para o padrão interno (`utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`) e preenche os custom fields equivalentes no GHL apenas quando estiverem vazios. Nova tabela `ghl_custom_field_mappings` guarda os IDs reais dos custom fields. Cron a cada 5 minutos no offset `:01`.**
- **2026-03-17 - 🔧 UX: Melhorada clicabilidade na aba "Lista" do módulo Leads. Adicionado onClick na `<tr>` para abrir LeadCard ao clicar em qualquer célula (não apenas data). Adicionada coluna final com botão delete (lixeira) visível no hover. Checkbox mantém stopPropagation próprio. Padrão: cursor pointer + hover bg-mist, delete button opacity 0→1 no hover. Ver `docs/MUDANCAS.md` seção "2026-03-17 (🔧 FIX: Melhorar clicabilidade)".**
- **2026-03-23 - 📋 Auditoria do Painel Cohort/Tráfego: a lógica central segue o modelo correto de cohort (`data_lead_recebido`, exclusão de Recuperação, MQL por tag, faturamento sem upper bound), mas o estado atual não deve ser tratado como "perfeito". Permanecem 2 riscos conhecidos: paginação de `oportunidades` com ordenação não determinística por `data_lead_recebido` apenas, e possível desalinhamento do filtro `Campanha Meta` quando não existe mapeamento em `utm_campaigns`. Não houve mudança de código nesta etapa; apenas documentação. Ver `docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md`.**
- **2026-03-23 - Leads/Lista: filtros dependentes de `contatos` (`search` e `utmSource`) passaram a rodar no Supabase antes da paginação em `useLeads.ts`. Quando esses filtros existem, a lista usa `contatos!inner(...)` para que a busca considere o conjunto completo de oportunidades, e não apenas a página já carregada no frontend.**
- **2026-03-23 - 🛠️ Hardening do painel Cohort/Tráfego: `useTrafego.ts` passou a paginar oportunidades com ordenação determinística por `data_lead_recebido` + `id`, e o filtro `Campanha Meta` agora zera o cohort e exibe aviso quando não existe mapeamento em `utm_campaigns`. Objetivo: impedir mistura silenciosa entre spend específico e leads genéricos. Ver `docs/PAINEL-TRAFEGO-PAGO.md` e `docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md`.**
- **2026-07-08 - Fase 4: `extrair_dados_ghl_v2()` criada para usar mapeamentos configuráveis por workspace (`ghl_field_mappings`). Helpers `resolve_ghl_field_value`, `apply_ghl_field_mappings` e `get_workspace_id_by_ghl_location_id` introduzidos. Template `Empire Default` expandido para equivalência exata com a v1. Trigger `auto_extrair_dados_ghl` passou a chamar a v2. Ver `docs/GHL-MAPEAMENTO-REFATORACAO.md`.
# Isolamento da Clara por conta (2026-07-14)

As Edge Functions `bot-chat`, `bot-chat-synthesis` e `bot-chat-data` exigem
`workspace_id` e validam membership ativa. A chave OpenRouter é resolvida pelo
Vault para a conta informada, sem fallback global. Conversas e sessões carregam
`workspace_id`; registros antigos cuja conta não pode ser inferida não são
expostos. O worker de dados usa um guard que acrescenta o filtro de conta a toda
leitura permitida.

O owner/admin testa a chave OpenRouter pelo endpoint `/auth/key` da OpenRouter,
chamado somente no servidor e sem consumir modelo. A revogação remove tanto o
ponteiro de credencial da conta quanto o segredo correspondente no Vault.

`workspace_ai_usage_events` registra a operação de IA por conta sem conteúdo
sensível. Chamadas internas de relatório e Telegram carregam `workspace_id`; o
Telegram não atende entradas sem mapeamento explícito para uma conta.
