# PRD: Dashboard Empire

| Campo | Valor |
|-------|-------|
| **One-liner** | Dashboard web multi-usuário para rastreamento UTM, análise de leads e gestão de criativos, conectado ao Supabase |
| **Owner** | OMNX |
| **Status** | Em Desenvolvimento |
| **Data** | 2026-02-25 |
| **Versão** | 1.2 |

---

## 0. Stack Tecnológico

### Stack Obrigatória (Lovable-style)

Este projeto DEVE ser implementado 100% usando a seguinte stack:

| Camada | Tecnologia | Versão | Descrição |
|--------|------------|--------|-----------|
| **Framework** | Next.js | 14+ | App Router, Server Components |
| **Linguagem** | TypeScript | 5+ | Strict mode habilitado |
| **Backend/DB** | Supabase | - | Auth, Database, RLS, Edge Functions |
| **Styling** | Tailwind CSS | 3+ | Design tokens via CSS variables |
| **UI Components** | shadcn/ui | - | Componentes acessíveis |
| **State** | React Query (TanStack Query) | 5+ | Server state management |
| **Forms** | React Hook Form + Zod | - | Validação de formulários |

### Arquitetura de Pastas (Lovable-style)

```
eb-dash/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Grupo de rotas de auth
│   │   ├── login/page.tsx
│   │   └── callback/page.tsx
│   ├── (dashboard)/              # Grupo de rotas autenticadas
│   │   ├── layout.tsx            # Layout com sidebar
│   │   └── traqueamento/         # Módulo Traqueamento
│   │       ├── page.tsx
│   │       └── [tab]/
│   ├── api/                      # API Routes (apenas se necessário)
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Landing/redirect
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── layout/                   # Sidebar, Header, Breadcrumb
│   ├── tables/                   # DataTable e variantes
│   ├── forms/                    # Form components
│   └── modals/                   # Modal components
├── hooks/                        # Custom hooks
│   ├── use-module-tree.ts
│   ├── use-permissions.ts
│   └── use-supabase.ts
├── lib/
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── admin.ts              # Admin client (service role)
│   ├── utils.ts                  # Utility functions
│   └── validations/              # Zod schemas
├── types/                        # TypeScript types
│   ├── database.ts               # Supabase generated types
│   └── index.ts
├── contexts/                     # React contexts
│   └── permission-context.tsx
└── middleware.ts                 # Next.js middleware (auth)
```

### Padrões Obrigatórios

1. **Server Components por padrão**: Use `'use client'` apenas quando necessário
2. **Supabase Auth**: Autenticação via Supabase Auth com OAuth (Google)
3. **RLS**: Todo isolamento de dados via Row Level Security no Supabase
4. **Server Actions**: Mutações via Server Actions, não API routes
5. **Design Tokens**: NENHUMA cor hard-coded - usar CSS variables do DESIGN_TOKENS.md

### Variáveis de Ambiente Necessárias

```env
# Supabase (obrigatório)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side apenas!

# Integrações (opcional)
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID_PAID=...
NOTION_DATABASE_ID_ORGANIC=...
SWITCHY_API_KEY=...
```

### Supabase - Tabelas e Migrações

Todas as tabelas são criadas e gerenciadas via migrations SQL em `supabase/migrations/`. O projeto NÃO usa ORM - usa Supabase Client diretamente com queries tipadas via TypeScript.

**Tabelas já criadas no Supabase:**
- `workspaces` e `workspace_members` (isolamento multi-tenant)
- `dashboard_user_permissions` (permissões por módulo)
- `dashboard_user_lead_filters` (filtros de leads por usuário)
- 17 tabelas do módulo Traqueamento (UTMs, catálogos, funis, etc.)
- `permission_audit_log` (auditoria de alterações)
- Tabelas GHL: `contatos`, `oportunidades`, `webhooks_ghl`
- Tabelas Meta Ads: `meta_ads_insights`, `meta_ads_raw_insights`

---

## Índice

1. [Resumo para Leigos](#1-resumo-para-leigos)
2. [Contexto e Problema](#2-contexto-e-problema)
3. [Objetivos e Sucesso](#3-objetivos-e-sucesso)
4. [Usuários e Personas](#4-usuários-e-personas)
5. [Escopo e Priorização](#5-escopo-e-priorização)
6. [Arquitetura de Módulos](#6-arquitetura-de-módulos)
7. [Módulo: TRAQUEAMENTO](#7-módulo-traqueamento)
8. [Sistema de Acesso Multi-Usuário](#8-sistema-de-acesso-multi-usuário)
9. [Requisitos Funcionais](#9-requisitos-funcionais)
10. [Requisitos Não-Funcionais](#10-requisitos-não-funcionais)
11. [Design System e Tokenização](#11-design-system-e-tokenização)
12. [UX Notes](#12-ux-notes)
13. [Dados e Modelo](#13-dados-e-modelo)
14. [Integrações e APIs](#14-integrações-e-apis)
15. [Segurança e Compliance](#15-segurança-e-compliance)
16. [Critérios de Aceitação](#16-critérios-de-aceitação)
17. [Roadmap](#17-roadmap)
18. [Riscos e Mitigações](#18-riscos-e-mitigações)
19. [Próximos Passos](#19-próximos-passos)

---

## 1. Resumo para Leigos

### O que é

O **Dashboard Empire** é um sistema web que transforma dados brutos de leads, campanhas e anúncios em informações organizadas e acessíveis para toda a equipe. É o painel de controle central do negócio: onde você configura como rastrear de onde vêm os leads, quem é cada lead e como seus anúncios estão performando.

### Para quem é

- **Gestor de tráfego** que precisa configurar UTMs e ver performance de anúncios
- **Analista de CRM** que precisa entender a jornada de cada lead
- **Vendedor (closer)** que precisa ver apenas os leads atribuídos a ele
- **Dono do negócio** que quer uma visão geral de todos os canais

### Qual problema resolve

> "Hoje, toda a configuração de UTMs fica espalhada em planilhas do Google Sheets. Não tem um lugar central para cadastrar campanhas, criativos e origens. Quando alguém quer ver quais leads vieram de qual campanha, precisa cruzar dados manualmente entre CRM, planilha e Meta Ads. E quando um vendedor entra para ver seus leads, ele vê dados de toda a equipe que não são relevantes para ele."

### Como funciona (passo a passo simples)

1. O admin configura os parâmetros de rastreamento no módulo **Traqueamento** (códigos UTM, origens, campanhas, anúncios, funis)
2. Esses parâmetros são usados para gerar URLs rastreadas com links únicos por anúncio
3. Quando um lead chega, o sistema já sabe automaticamente de qual canal, campanha e criativo ele veio
4. O admin convida usuários (vendedores, analistas) e define exatamente o que cada um pode ver
5. Cada usuário vê o dashboard personalizado para sua função

### O que o usuário consegue fazer

- [x] Cadastrar e organizar todos os parâmetros UTM (fontes, campanhas, meios, objetivos)
- [x] Gerar URLs rastreadas automaticamente para anúncios pagos e conteúdo orgânico
- [x] Visualizar e gerenciar criativos (via Notion ou upload direto)
- [x] Organizar campanhas em funis e processos de vendas
- [x] Convidar usuários e controlar o que cada um pode ver
- [x] Restringir quais leads cada usuário consegue visualizar

### O que NÃO faz

- [ ] Não substitui o GoHighLevel (GHL) como CRM — lê dados do GHL via Supabase
- [ ] Não gerencia pagamentos ou contratos diretamente
- [ ] Não envia mensagens ou e-mails para leads
- [ ] Não faz upload direto para Meta Ads ou Google Ads

### Exemplo Prático

> **Carla é gestora de tráfego da OMNX.**
>
> Antes do Dashboard Empire, Carla usava 3 planilhas diferentes para organizar os UTMs: uma para fontes, outra para campanhas, outra para criativos. Toda vez que criava um novo anúncio, passava 30 minutos montando a URL manualmente e verificando se o código UTM não conflitava com outros.
>
> Com o Dashboard Empire, Carla entra no módulo Traqueamento, cadastra o novo criativo em 2 minutos, e o sistema gera automaticamente a URL completa com todos os parâmetros e ainda encurta o link. João, um vendedor da equipe, acessa o mesmo dashboard mas só vê os leads atribuídos a ele — graças ao filtro de acesso configurado por Carla.

---

## 2. Contexto e Problema

### Dor do Usuário

A configuração de parâmetros UTM é feita hoje em planilhas manuais sem validação, sem geração automática de códigos e sem um lugar centralizado. Isso causa:

- Erros de digitação em códigos UTM (ex: `iorg-2` vs `lorg-2`)
- Conflito de numeração (dois criativos com o mesmo código)
- Impossibilidade de gerar relatórios confiáveis de atribuição de leads
- Falta de controle sobre quem da equipe vê quais dados sensíveis

### Impacto

- **Quantitativo:** Estimativa de 2-3 horas/semana perdidas por gestor em configuração manual de UTMs
- **Qualitativo:** Decisões de investimento em mídia baseadas em dados de atribuição incorretos; exposição de dados de leads a usuários sem necessidade de ver tais informações

### Por que agora?

A infraestrutura de dados já está pronta: GHL → Supabase com mais de 127 contatos e oportunidades capturados. O Meta Ads já está sincronizado. O próximo passo natural é uma interface de gestão que feche o ciclo de rastreamento e análise.

### Alternativas atuais

| Alternativa | Prós | Contras |
|-------------|------|---------|
| Google Sheets | Familiar, sem custo | Sem validação, sem auto-geração, sem controle de acesso, sem integração ao Supabase |
| UTM Builder genérico | Rápido para uso pontual | Não se integra aos dados do CRM, sem histórico, sem multi-usuário |
| Fazer nada | Zero esforço | Atribuição de leads incorreta, decisões de mídia erradas |

---

## 3. Objetivos e Sucesso

### Objetivos

1. Centralizar toda a configuração de parâmetros UTM em uma interface web integrada ao Supabase
2. Eliminar erros de duplicidade e conflito de códigos UTM com validação automática
3. Permitir controle granular de acesso: por módulo e por conjunto de leads
4. Criar uma arquitetura extensível que permita adicionar novos módulos sem refatoração

### Não-Objetivos

1. Não replicar funcionalidades do GoHighLevel (pipeline, envio de mensagens, etc.)
2. Não criar um BI completo com gráficos avançados na V1 (isso vem em módulos futuros)
3. Não gerenciar criativos fora do fluxo de Notion/upload direto já estabelecido
4. Não migrar dados históricos de planilhas automaticamente

### Definição de Sucesso

| Métrica | Baseline | Meta | Como medir |
|---------|----------|------|------------|
| Tempo para cadastrar novo anúncio | ~30 min (manual) | < 3 min | Observação de uso |
| Erros de código UTM duplicado | Frequente (assumption) | 0 por semana | Logs de validação |
| Usuários ativos no dashboard | 0 | 3+ usuários | Supabase Auth logs |
| Cobertura de atribuição de leads | < 70% (assumption) | > 95% | % de leads com canal identificado |

---

## 4. Usuários e Personas

### Persona 1: Admin / Gestor de Tráfego (Acesso Total)

**Nome:** Carla
**Perfil:** Gestora de tráfego, acesso a todos os módulos e dados
**Dor principal:** Perda de tempo com configuração manual e erros de UTM
**Motivação:** Ter atribuição correta para otimizar investimento em mídia
**Frustração atual:** Planilhas manuais sem validação, impossível auditar quem alterou o quê

### Persona 2: Closer / Vendedor (Acesso Restrito)

**Nome:** João
**Perfil:** Vendedor, vê apenas seus leads e dados de desempenho
**Dor principal:** Acessa o sistema e vê dados de outros vendedores que o distraem
**Motivação:** Focar nos próprios leads sem ruído de dados irrelevantes
**Frustração atual:** Dashboard com informações de toda a equipe misturadas

### Persona 3: Analista de CRM (Acesso Parcial)

**Nome:** Ana
**Perfil:** Analista, acessa módulos de traqueamento para auditoria de UTMs
**Dor principal:** Não consegue verificar quais campanhas estão sem código de rastreamento
**Motivação:** Garantir qualidade dos dados de atribuição
**Frustração atual:** Não tem interface para auditar a configuração UTM

### Jobs To Be Done (JTBD)

| Job | Contexto | Motivação | Resultado esperado |
|-----|----------|-----------|-------------------|
| Cadastrar nova fonte UTM | Novo canal de tráfego contratado | Rastrear performance do canal | Código único gerado, URL pronta |
| Criar URL de anúncio | Novo criativo aprovado para veicular | Rastrear performance do criativo | URL encurtada com todos os params UTM |
| Verificar leads atribuídos | Fim do mês para relatório | Entender ROI por canal | Lista de leads filtrada por utm_source |
| Convidar vendedor | Novo closer entrou na equipe | Dar acesso restrito ao CRM visual | Vendedor vê só seus leads |

---

## 5. Escopo e Priorização

### MUST — MVP (Módulo Traqueamento)

- [x] Autenticação de usuários (login/logout)
- [x] Sistema de workspace (isolamento por conta)
- [x] Controle de acesso por módulo/sub-módulo
- [x] Filtro de leads por parâmetros (UTM, campos de contato/oportunidade)
- [x] Módulo TRAQUEAMENTO completo com 6 abas:
  - [x] CODS UTM (7 sub-abas)
  - [x] ORIGEM
  - [x] PROCESSO DE VENDAS
  - [x] ANÚNCIOS (5 sub-abas)
  - [x] ORGÂNICO (2 sub-abas)
  - [x] FUNIS
- [x] Colar dados do Google Sheets em todas as sub-abas
- [x] Geração automática de códigos UTM
- [x] Validação anti-duplicata
- [x] Integração com Notion (sync de criativos)
- [x] Encurtamento de URL via Switchy

### SHOULD — Importante, não bloqueante

- [ ] Painel de administração de usuários (UI para convidar e gerenciar permissões)
- [ ] Histórico de alterações (audit log)
- [ ] Configurações da integração Notion via UI (sem precisar do Supabase Secrets manualmente)
- [ ] Exportar catálogo de URLs para CSV/Sheets

### COULD — Nice to have

- [ ] Dashboard de performance por UTM (futuros módulos de análise)
- [ ] Alertas de slugs sem origem atribuída via e-mail/notificação
- [ ] Busca global no sistema
- [ ] Dark mode

### WON'T — Fora de escopo V1

- [ ] Aplicativo mobile — Web responsivo é suficiente por ora
- [ ] Integração direta com Meta Ads API para criar anúncios — apenas leitura de dados
- [ ] Automação de testes de criativos — apenas catálogo

---

## 6. Arquitetura de Módulos

O Dashboard Empire é construído sobre uma arquitetura **modular e hierárquica**. Cada parte do sistema é identificada por uma **chave de módulo** em notação de pontos, usada tanto para controle de acesso quanto para navegação.

### Hierarquia de Módulos

```
dashboard-empire/
│
├── traqueamento/                      ← Módulo V1
│   ├── cods_utm/                      ← Aba
│   │   ├── slug_utm                   ← Sub-aba
│   │   ├── utm_source_ads             ← Sub-aba
│   │   ├── utm_source_organico        ← Sub-aba
│   │   ├── utm_campaign               ← Sub-aba
│   │   ├── utm_medium                 ← Sub-aba
│   │   ├── utm_term                   ← Sub-aba
│   │   └── objetivo_ads               ← Sub-aba
│   ├── origem/                        ← Aba
│   ├── processo_vendas/               ← Aba
│   ├── anuncios/                      ← Aba
│   │   ├── campanhas                  ← Sub-aba
│   │   ├── testes_criativos           ← Sub-aba
│   │   ├── catalogo_criativos         ← Sub-aba
│   │   ├── producao_notion            ← Sub-aba
│   │   └── producao_direta            ← Sub-aba
│   ├── organico/                      ← Aba
│   │   ├── producao                   ← Sub-aba
│   │   └── catalogo                   ← Sub-aba
│   └── funis/                         ← Aba
│
├── [modulo_futuro_2]/                 ← Módulo V2 (ex: CRM, Funil, Vendas)
│   └── [sub_modulo]/
│       └── [sub_sub_modulo]
│
└── [modulo_futuro_3]/                 ← Módulo V3 (ex: Meta Ads, Analytics)
```

### Chaves de Módulo (Module Keys)

Cada nó na hierarquia tem uma chave única:

| Nível | Exemplo de Chave | Descrição |
|-------|-----------------|-----------|
| Módulo | `traqueamento` | Acesso ao módulo inteiro |
| Aba | `traqueamento.cods_utm` | Acesso à aba específica |
| Sub-aba | `traqueamento.cods_utm.slug_utm` | Acesso à sub-aba específica |
| Sub-sub-aba | `traqueamento.anuncios.catalogo_criativos.config` | Nível 4 se necessário |

### Regra de Herança de Permissão

- Ter permissão em `traqueamento` implica acesso a **todas** as abas e sub-abas
- Ter permissão em `traqueamento.cods_utm` implica acesso a **todas** as sub-abas de CODS UTM
- Permissões mais específicas têm precedência (ex: pode-se negar uma sub-aba específica mesmo com acesso ao módulo pai)
- Documentação completa: ver [DASHBOARD-MODULOS.md](DASHBOARD-MODULOS.md)

### Padrão de URL de Navegação

```
/[modulo]                              → /traqueamento
/[modulo]?tab=[aba]                    → /traqueamento?tab=cods_utm
/[modulo]?tab=[aba]&sub=[sub_aba]      → /traqueamento?tab=cods_utm&sub=slug_utm
```

---

## 7. Módulo: TRAQUEAMENTO

### Visão Geral

O módulo Traqueamento é onde a equipe configura todos os parâmetros que serão usados para rastrear a origem dos leads. Sem essa configuração, os dashboards de tráfego e aquisição não conseguem atribuir leads ao canal correto.

**Rota:** `/traqueamento`
**Permissão base:** `can_view_tracking`
**Chave de módulo:** `traqueamento`

---

### Aba 1: CODS UTM

**Chave:** `traqueamento.cods_utm`

A aba mais complexa do módulo. Contém 7 sub-abas, cada uma configurando um dos parâmetros de uma URL de rastreamento UTM.

#### Conceito de URL UTM

```
https://site.com/pagina
  ?utm_source=iorg-2
  &utm_medium=9
  &utm_campaign=12
  &utm_content=CR-188
  &utm_term=M10_O1_P5_CR-188_PG6
```

#### Anatomia do utm_term (string composta)

```
M10   _O1    _P5          _CR-188     _PG6
 │      │      │               │        │
 │      │      │               │        └── page_code da campanha
 │      │      │               └────────── ID do criativo (Notion)
 │      │      └───────────────────────── public_code do canal ADS
 │      └─────────────────────────────── objective_code
 └────────────────────────────────────── mês do anúncio (01–12)
```

---

#### Sub-aba 1.1: Slug UTM

**Chave:** `traqueamento.cods_utm.slug_utm`
**Tabela:** `utm_slugs`

Slugs são nomes curtos padronizados que servem como base para gerar os códigos `utm_source`. Ex: o influenciador "Davi Louback" tem o slug `odavilouback`.

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Único por workspace (case-insensitive) |
| slug | text | Sim | Único por workspace, sem espaços |

**Comportamentos:**
- Colar do Sheets: 2 colunas (Nome, Slug)
- Detecção automática de cabeçalho (palavras-chave: "nome", "slug")
- Validação anti-duplicata: no lote E contra o banco

---

#### Sub-aba 1.2: UTM-SOURCE ADS

**Chave:** `traqueamento.cods_utm.utm_source_ads`
**Tabela:** `utm_sources`

Define canais de tráfego **pago**. Cada canal recebe dois códigos únicos: `utm_source` e `public_code`.

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Descritivo |
| slug | text | Sim | Deve existir em `utm_slugs` |
| utm_source | text | Não | Auto-gerado: `[slug]-[N]` se vazio |
| public_code | text | Não | Auto-gerado: `P[N]` se vazio |

**Regras de negócio:**
- **RN1:** `utm_source` deve ser único entre `utm_sources` E `utm_sources_plain` (namespace compartilhado)
- **RN2:** Numeração do `public_code` é exclusiva da tabela ADS (a orgânica não tem public_code)
- **RN3:** Auto-geração do `utm_source`: próximo número disponível considerando ambas as tabelas
- **RN4:** Auto-geração do `public_code`: maior número existente em `utm_sources` + 1

**Por que public_code existe:**
O `public_code` (P5, P13...) é embutido no `utm_term` composto. Quando um lead chega com `utm_term` contendo `_P5_`, o sistema identifica o canal ADS mesmo que o `utm_source` tenha sido sobrescrito por um intermediário. Este é o **P-Code System** — documentado em `docs/CORRELACAO-META-CRM.md`.

**Colar do Sheets:** 4 colunas (Nome, Slug, utm_source, public_code). Dois últimos podem estar em branco.

---

#### Sub-aba 1.3: UTM-SOURCE Orgânico

**Chave:** `traqueamento.cods_utm.utm_source_organico`
**Tabela:** `utm_sources_plain`

Define canais de tráfego **orgânico**. Sem `public_code` pois canais orgânicos não participam do P-Code System.

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Descritivo |
| slug | text | Sim | Deve existir em `utm_slugs` |
| utm_source | text | Não | Auto-gerado: `[slug]-[N]` se vazio |

**Regras de negócio:**
- **RN1:** Namespace compartilhado com `utm_sources` — não pode duplicar códigos
- **RN2:** Sem campo `public_code`

**Colar do Sheets:** 3 colunas (Nome, Slug, utm_source).

---

#### Sub-aba 1.4: UTM-CAMPAIGN

**Chave:** `traqueamento.cods_utm.utm_campaign`
**Tabela:** `utm_campaigns`

Registra campanhas de marketing. Cada campanha recebe um número inteiro único e um `page_code`.

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Único (case-insensitive) |
| utm_campaign | integer | Não | Auto-gerado: próximo inteiro disponível |
| page_code | text | Não | Auto-gerado: `PG[N]`; regex `/^PG\d+$/i` |
| funnels | JSONB array | Não | Gerenciado pela aba Funis, não editável aqui |

**Relação com utm_term:** O `page_code` é o segmento `_PG6` dentro do utm_term composto. Permite identificar a campanha mesmo sem o parâmetro `utm_campaign` explícito.

**Colar do Sheets:** 3 colunas (Nome, utm_campaign, page_code). Detecção de cabeçalho com "nome", "utm", "page".

---

#### Sub-aba 1.5: UTM-MEDIUM

**Chave:** `traqueamento.cods_utm.utm_medium`
**Tabela:** `utm_mediums`

Define os meios/formatos de veiculação (botão, swipe up, link na bio, story...).

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Ex: "Botão", "Swipe Up", "Story" |
| utm_medium | integer | Não | Auto-gerado: próximo inteiro disponível |

**Colar do Sheets:** 2 colunas (Nome, utm_medium).

---

#### Sub-aba 1.6: UTM-TERM

**Chave:** `traqueamento.cods_utm.utm_term`
**Tabela:** `utm_terms`

Registra identificadores de criativos individuais. O campo `utm_term` nas URLs é uma string composta — esta tabela cataloga cada criativo com seu ID.

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Descrição do criativo |
| utm_term | integer | Não | Auto-gerado: próximo inteiro disponível |

**Nota:** O `CR-188` dentro do utm_term composto vem da integração com o Notion, não desta tabela diretamente.

**Colar do Sheets:** 2 colunas (Nome, utm_term).

---

#### Sub-aba 1.7: Objetivo ADS

**Chave:** `traqueamento.cods_utm.objetivo_ads`
**Tabela:** `utm_objectives`

Define os objetivos de campanha de mídia paga (Conversão, Tráfego, Engajamento...).

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| nome | text | Sim | Ex: "Conversão", "Tráfego" |
| objective_code | text | Não | Auto-gerado: `O[N]`; regex `/^O\d+$/i` |

**Comportamentos:**
- Input aceita maiúsculo ou minúsculo, converte para maiúsculo automaticamente
- Uso: aparece no campo `objective` das campanhas de anúncios e como `_O1_` no utm_term

**Colar do Sheets:** 2 colunas (Nome, Objetivo).

---

### Aba 2: ORIGEM

**Chave:** `traqueamento.origem`

Agrupa canais (slugs) em origens mais amplas e legíveis para exibição nos dashboards. Em vez de "iorg-1", "iorg-2", o dashboard exibe "Instagram Orgânico".

#### Seção 2.1: Origens

**Tabela:** `utm_origins`

| Campo | Tipo | Validação |
|-------|------|-----------|
| nome | text | Único por workspace (case-insensitive) |

**Colar do Sheets:** 1 coluna (nomes, um por linha).

#### Seção 2.2: Atribuição de Origem

**Tabela:** `utm_source_origin_assignments`

| Campo | Tipo | Observação |
|-------|------|------------|
| utm_source | text | Armazena o **nome do slug** (de `utm_slugs.name`), não o código |
| origin_id | UUID | FK para `utm_origins` |

**Regras de negócio:**
- **RN1:** Cada slug pode ser atribuído a apenas uma origem (`UNIQUE(workspace_id, utm_source)`)
- **RN2:** Salvamento usa upsert por `(workspace_id, utm_source)`
- **RN3:** Exibir alerta visual quando slugs em `utm_slugs` não tiverem origem atribuída

**Alerta crítico:** O campo `utm_source` nesta tabela armazena o **nome** do slug (ex: "Davi Louback"), não o código gerado (ex: "odavilouback-1"). Isso é um detalhe crítico para consultas diretas ao banco.

**Colar do Sheets:** 2 colunas (Nome do Slug, Nome da Origem).

---

### Aba 3: PROCESSO DE VENDAS

**Chave:** `traqueamento.processo_vendas`

Define quais campanhas pertencem a qual processo/funil de vendas, permitindo filtrar dashboards por jornada comercial.

#### Seção 3.1: Processos de Vendas

**Tabela:** `sales_processes`

| Campo | Tipo | Validação |
|-------|------|-----------|
| nome | text | Único por workspace (case-insensitive) |

Ex: "Funil Direto", "Pré-vendas", "Lançamento"

#### Seção 3.2: Atribuição de Campanhas

**Tabela:** `sales_process_assignments`

| Campo | Tipo | Observação |
|-------|------|------------|
| utm_campaign_id | UUID | FK para `utm_campaigns` |
| sales_process_id | UUID | FK para `sales_processes` |

**Regras de negócio:**
- **RN1:** Cada campanha pertence a apenas um processo (`UNIQUE(workspace_id, utm_campaign_id)`)
- **RN2:** Salvamento usa upsert + delete de atribuições removidas
- **RN3:** Alerta quando campanhas não têm processo atribuído
- **RN4:** Alerta quando nenhum processo foi criado

---

### Aba 4: ANÚNCIOS

**Chave:** `traqueamento.anuncios`

Gerencia criação, organização e rastreamento de anúncios de tráfego pago.

#### Sub-aba 4.1: Campanhas de Anúncios

**Chave:** `traqueamento.anuncios.campanhas`
**Tabela:** `ads_campaigns`

| Campo | Tipo | Observação |
|-------|------|------------|
| objective_code | text | Aceita `O1` ou `Conversão (O1)`, extrai o código |
| objective_name | text | Nome do objetivo |
| page_name | text | Identificador da página de destino |
| campaign_date | date | Formato flexível; converte para `d-M-yyyy` |
| code | text | Gerado: `O[objetivo]_[página]_[data]` |

**Exemplo:** `O1_Black Nov 25_30-10-2025`

#### Sub-aba 4.2: Testes de Criativos

**Chave:** `traqueamento.anuncios.testes_criativos`

> **Status V1:** Placeholder informativo — sem tabela de dados ainda. Espaço reservado para funcionalidade futura de organização de testes A/B.

#### Sub-aba 4.3: Catálogo de Criativos

**Chave:** `traqueamento.anuncios.catalogo_criativos`
**Tabela:** `ads_catalog`

Catálogo central de anúncios pagos. Cada linha = um anúncio com cadeia completa de parâmetros UTM e URL final gerada.

**Campos completos:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| month_number | integer (1–12) | Mês do anúncio |
| objective_name / objective_code | text | Ex: "Conversão" / "O1" |
| public_name / public_code | text | Ex: "Brasil 25-40" / "P5" |
| utm_source | text | Código do canal (ex: `iorg-2`) |
| creative_id | text | ID do criativo do Notion (ex: `CR-188`) |
| page_name / page_code | text | Nome e código da campanha |
| utm_campaign_number | integer | Número inteiro da campanha |
| utm_medium_name / utm_medium_number | text/int | Ex: "Botão" / `9` |
| url | text | URL base da landing page |
| shortened_url | text | URL encurtada via Switchy |

**Geração automática do utm_term:**
```
M10_O1_P5_CR-188_PG6
 │    │   │    │    └── page_code
 │    │   │    └─────── creative_id (Notion)
 │    │   └──────────── public_code
 │    └──────────────── objective_code
 └───────────────────── mês (dois dígitos)
```

**URL UTM final:**
```
[url]?utm_source=[utm_source]&utm_medium=[medium]&utm_campaign=[campaign]&utm_content=[creative_id]&utm_term=[código composto]
```

**Encurtamento:** Ao salvar, invoca Edge Function `switchy-shorten` com a URL UTM completa. Resultado salvo em `shortened_url`.

**Personalização de colunas:** 12 colunas configuráveis. Preferências salvas em `localStorage` com chave `adsCatalog.columns.visible`.

**Colar do Sheets:** 7 colunas (Mês, Objetivo, Público, Criativo, Página, utm_medium, URL). Nomes de meses em português aceitos ("Outubro", "out", "10" → mês 10).

#### Sub-aba 4.4: Produção de Criativos (Notion)

**Chave:** `traqueamento.anuncios.producao_notion`
**Fonte:** Tabela `notion_creatives` (sincronizada via Edge Function)

**Campos exibidos:** external_id, name, status, available_date, format, cta_objective, videos_folder_url, final_asset_url, profile

**Funcionalidades:**
- Busca por texto (nome, ID, status)
- Filtros: Status, Formato, Perfil
- Ordenação por qualquer coluna
- Botão de sincronização manual → invoca `notion-creatives-sync`
- Spinner durante sincronização

#### Sub-aba 4.5: Produção de Criativos (Direta)

**Chave:** `traqueamento.anuncios.producao_direta`
**Fonte:** Upload direto (sem Notion)

Mesmos campos e funcionalidades que a sub-aba Notion, mas com fonte diferente.

---

### Aba 5: ORGÂNICO

**Chave:** `traqueamento.organico`

Equivalente da aba ANÚNCIOS para conteúdo sem investimento em mídia paga.

#### Sub-aba 5.1: Produção Orgânico

**Chave:** `traqueamento.organico.producao`

Visualização e gestão de criativos orgânicos. Mesma estrutura da Produção de Criativos paga, mas aponta para banco de dados Notion específico de conteúdo orgânico.

**Campos:** external_id, name, status, available_date, format, cta_objective, videos_folder_url, final_asset_url, profile

#### Sub-aba 5.2: Catálogo Orgânico

**Chave:** `traqueamento.organico.catalogo`
**Tabela:** `organic_catalog`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| profile | text | Perfil de rede social (ex: "@aliancadealtovalor") |
| utm_source_name / utm_source | text | Nome e código do canal orgânico |
| utm_campaign_name / utm_campaign | text/int | Nome e número da campanha |
| utm_medium_name / utm_medium | text/int | Nome e número do meio |
| utm_term_name / utm_term | text/int | Nome e número do criativo |
| utm_content | text | ID do conteúdo (filtrado por perfil) |
| url | text | URL base de destino |
| shortened_url | text | URL encurtada via Switchy |

**Diferenças em relação ao Catálogo ADS:**
- Sem mês, objetivo ou public_code
- `utm_content` filtrado por perfil (apenas criativos do perfil selecionado)
- Sem utm_term composto — usa código numérico diretamente

**Personalização de colunas:** 10 colunas configuráveis. Chave localStorage: `organicCatalog.columns.visible`.

**Colar do Sheets:** 7 colunas (Perfil, UTM-SOURCE, UTM-CAMPAIGN, UTM-MEDIUM, UTM-TERM, UTM-CONTENT, URL).

---

### Aba 6: FUNIS

**Chave:** `traqueamento.funis`

Define e organiza os funis do processo comercial.

#### Seção 6.1: Funis

**Tabela:** `funnels`

| Campo | Tipo | Validação |
|-------|------|-----------|
| nome | text | Único por workspace |

**Operações:** CRUD completo.

**Rename em cascata:** Ao renomear um funil, o sistema atualiza automaticamente o array `funnels` da tabela `utm_campaigns` em todos os registros que referenciam o nome antigo. Nunca renomear manualmente no banco sem fazer isso.

**Colar do Sheets:** 1 coluna (um nome por linha).

#### Seção 6.2: Hierarquia de Funis

Associa campanhas UTM a funis específicos. Campo afetado: `utm_campaigns.funnels` (JSONB array com nomes dos funis).

**Regras de negócio:**
- **RN1:** Uma campanha pode pertencer a **mais de um** funil
- **RN2:** Checkboxes por funil — adicionar/remover campanhas
- **RN3:** Alerta de campanhas sem funil atribuído
- **RN4:** Mapeamento sugerido como ponto de partida:
  - `[fn] aplicação` → campanhas 5, 9, 10, 12
  - `[fn] isca` → campanhas "pdfbait", "wppbait", 15, 10, "botbait"
  - `[fn] mini-wb-90d` → campanha 14
  - `[fn] Social Selling` → campanha 17

---

## 8. Sistema de Acesso Multi-Usuário

> Documentação completa: [DASHBOARD-CONTROLE-ACESSO.md](DASHBOARD-CONTROLE-ACESSO.md)

### Modelo de Workspace

```
Workspace (conta principal)
├── Owner (Admin) — acesso total, gerencia membros
├── Membro A — acesso a módulos X, Y; vê leads com utm_source = "iorg-2"
├── Membro B — acesso apenas a traqueamento.funis; vê todos os leads
└── Membro C — acesso a traqueamento; vê leads do vendedor "João"
```

### Três Camadas de Controle

| Camada | O que controla | Onde fica |
|--------|---------------|-----------|
| **Workspace RLS** | Qual empresa/conta o usuário pertence | Supabase RLS |
| **Permissão de Módulo** | Quais módulos/abas o usuário pode acessar | `dashboard_user_permissions` |
| **Filtro de Leads** | Quais leads o usuário pode ver | `dashboard_user_lead_filters` |

### Permissões de Módulo

Permissões são definidas por **chave de módulo** com ações `can_view` e `can_edit`:

| Nível de Acesso | Chave | Resultado |
|-----------------|-------|-----------|
| Módulo inteiro | `traqueamento` | Acessa todas as abas e sub-abas |
| Aba específica | `traqueamento.anuncios` | Acessa todas as sub-abas de Anúncios |
| Sub-aba específica | `traqueamento.anuncios.catalogo_criativos` | Apenas o Catálogo |

### Filtro de Leads

Cada usuário pode ter um conjunto de regras que define quais leads ele consegue ver **no sistema inteiro**. As regras podem ser baseadas em:

**Campos disponíveis para filtro:**

| Tabela | Exemplos de campos |
|--------|-------------------|
| `contatos` | utm_source, utm_medium, utm_campaign, utm_term, utm_content, como_nos_conheceu |
| `oportunidades` | vendedor_closer, status, pipeline_id, pipeline_stage_id |

**Operadores disponíveis:**

| Operador | Descrição | Exemplo |
|----------|-----------|---------|
| `eq` | Igual a | `utm_source = "iorg-2"` |
| `neq` | Diferente de | `status != "perdida"` |
| `in` | Em lista | `utm_source IN ["iorg-1", "iorg-2"]` |
| `nin` | Não em lista | `status NOT IN ["cancelada"]` |
| `contains` | Contém texto | `nome CONTAINS "Silva"` |
| `starts_with` | Começa com | `email STARTS WITH "joao"` |
| `is_null` | Campo vazio | `vendedor_closer IS NULL` |
| `is_not_null` | Campo preenchido | `utm_source IS NOT NULL` |

**Estrutura do filtro (JSON):**
```json
{
  "logic": "AND",
  "rules": [
    {
      "table": "oportunidades",
      "field": "vendedor_closer",
      "operator": "eq",
      "value": "João Silva"
    },
    {
      "table": "contatos",
      "field": "utm_source",
      "operator": "in",
      "value": ["iorg-1", "iorg-2"]
    }
  ]
}
```

---

## 9. Requisitos Funcionais

### FR-001: Autenticação e Workspace

**Descrição:** Sistema de login com isolamento por workspace.

**Regras de negócio:**
- RN1: Cada workspace tem um `owner_id` (Supabase Auth user_id)
- RN2: Membros são vinculados ao workspace via tabela de membros
- RN3: RLS garante que cada usuário só acessa dados de seu workspace
- RN4: Owner pode convidar membros via e-mail

**Permissões:**
| Role | Pode gerenciar membros? | Pode editar configurações? |
|------|------------------------|---------------------------|
| Owner/Admin | Sim | Sim |
| Membro (viewer) | Não | Depende de permissão |
| Membro (editor) | Não | Sim (módulos permitidos) |

---

### FR-002: Navegação por Módulos

**Descrição:** Sidebar lateral com módulos disponíveis. Apenas módulos com permissão são exibidos.

**Regras de negócio:**
- RN1: Módulos sem permissão não aparecem no menu — não ficam desabilitados, ficam invisíveis
- RN2: URL muda ao navegar entre abas/sub-abas (sem recarregar a página)
- RN3: Ao trocar de sub-aba, o parâmetro `?sub=` é substituído (não empilhado)
- RN4: Breadcrumb exibe módulo → aba → sub-aba atual

---

### FR-003: Padrões Comuns de Tabelas

**Descrição:** Todas as tabelas do sistema seguem o padrão documentado em `docs/TABELAS-DADOS.md`.

**Funcionalidades obrigatórias por tabela:**
- Sticky header + sticky primeira coluna
- Ordenação por clique no cabeçalho
- Paginação (10/25/50/100/todos)
- Fullscreen
- Visibilidade de colunas (persistida no localStorage)
- Footer com totalizadores
- Estados: loading (skeleton), vazio, erro
- Células clicáveis com modal de detalhes

---

### FR-004: Colar do Google Sheets

**Descrição:** Todas as sub-abas aceitam dados colados de planilhas.

**Regras de negócio:**
- RN1: Colunas separadas por `\t` (tab)
- RN2: Detecção automática de cabeçalho: se a primeira linha contém palavras-chave (nome, slug, utm, page), é ignorada
- RN3: Linhas completamente vazias são ignoradas
- RN4: Validação é executada no lote inteiro antes de qualquer escrita no banco
- RN5: Erros de duplicata exibem toast com o valor conflitante

---

### FR-005: Salvamento com Upsert

**Descrição:** Modelo não-destrutivo e idempotente para todas as operações de salvamento.

**Regras de negócio:**
- RN1: Sistema determina registros adicionados, modificados e removidos
- RN2: Novos → INSERT; editados → UPDATE (upsert); removidos → DELETE
- RN3: Usa `onConflict: "id"` ou `onConflict: "workspace_id,campo_unico"` por tabela
- RN4: Sucesso → toast de confirmação + refetch
- RN5: Erro → toast com mensagem do banco

---

### FR-006: Geração Automática de Códigos

**Descrição:** Campos de código podem ser deixados em branco. O sistema gera o próximo disponível.

**Tabela de referência:**

| Campo | Formato | Tabela de busca |
|-------|---------|-----------------|
| utm_source | `[slug]-[N]` | utm_sources + utm_sources_plain |
| public_code | `P[N]` | utm_sources apenas |
| utm_campaign | `[N]` (inteiro) | utm_campaigns |
| page_code | `PG[N]` | utm_campaigns |
| utm_medium | `[N]` (inteiro) | utm_mediums |
| utm_term | `[N]` (inteiro) | utm_terms |
| objective_code | `O[N]` | utm_objectives |

**Regra:** Usa maior número existente + 1 (não busca "lacunas").

---

### FR-007: Integração com Notion

**Descrição:** Sincronização de criativos do Notion via Edge Function.

**Fluxo:**
```
Notion API → Edge Function notion-creatives-sync → notion_creatives (Supabase)
```

**Parâmetros da Edge Function:**
- `database_type`: `"paid"` ou `"organic"` (seleciona o Database ID correto)
- `start_date` / `end_date`: filtro opcional na propriedade "Concluído"
- `request_source`: `"manual"` ou `"cron"`

**Agendamento:** 2x por dia — 6:00 e 18:00 (UTC-3)

**Log de execuções:** Tabela `notion_sync_runs` com status, datas, contagem, erros.

**Variáveis de ambiente necessárias:**
- `NOTION_API_KEY` — token de autenticação (único, compartilhado)
- `NOTION_DATABASE_ID_PAID` — database de criativos pagos
- `NOTION_DATABASE_ID_ORGANIC` — database de criativos orgânicos

---

### FR-008: Encurtamento de URL

**Descrição:** URLs UTM do Catálogo de Criativos e Catálogo Orgânico são encurtadas automaticamente via Switchy.

**Regras de negócio:**
- RN1: Encurtamento ocorre ao salvar o registro
- RN2: Edge Function `switchy-shorten` recebe a URL UTM completa
- RN3: Resultado salvo em campo `shortened_url` do registro
- RN4: Em caso de falha no encurtamento, o registro é salvo sem o `shortened_url` (não bloquear o save)

---

### FR-009: Rename de Funis em Cascata

**Descrição:** Ao renomear um funil, todas as referências em `utm_campaigns.funnels` são atualizadas.

**Regras de negócio:**
- RN1: Ao confirmar rename, sistema faz query em `utm_campaigns` buscando registros onde `funnels` contém o nome antigo
- RN2: Substitui o nome antigo pelo novo em cada array encontrado
- RN3: Operação atômica — falha total ou sucesso total
- RN4: Toast de confirmação com contagem de campanhas atualizadas

---

### FR-010: Hierarquia de Prioridade UTM

**Descrição:** Quando um lead chega, a fonte do canal é determinada por ordem de prioridade.

| Prioridade | Fonte | Quando se aplica |
|-----------|-------|-----------------|
| 1ª (máxima) | P-Code no `utm_term` | Lead veio de anúncio pago com P-Code |
| 2ª | `op_utm_source` da oportunidade | Canal editado manualmente no CRM |
| 3ª (fallback) | `utm_source` do contato | Canal original do cadastro |

**Implementação:** Função `getPrioritizedUtmSource()` — a ser criada em `src/lib/attributionHelpers.ts`.

---

## 10. Requisitos Não-Funcionais

### Performance

| Métrica | Meta |
|---------|------|
| API response (p95) | < 300ms |
| LCP (p95) | < 2.5s |
| TTFB | < 600ms |
| Carregamento de tabela com 1000 registros | < 1s |

### Disponibilidade

- **SLO:** 99.5% (herdado do Supabase)

### Segurança

- [x] HTTPS obrigatório
- [x] RLS em todas as tabelas (isolamento por workspace)
- [x] Rate limiting nas Edge Functions
- [x] Inputs sanitizados antes de queries
- [x] Chaves de API em variáveis de ambiente (nunca no frontend)
- [x] Logs de auditoria para ações sensíveis (convidar usuário, alterar permissões)

### Privacidade (LGPD)

- [x] Dados PII identificados (nome, email, telefone, CPF/CNPJ em `contatos`)
- [x] Acesso a PII restrito por permissão de módulo e filtro de leads
- [x] Política de retenção: dados de contatos retidos enquanto o workspace existir

### Observabilidade

- [x] Logs estruturados nas Edge Functions
- [x] `notion_sync_runs` para rastreamento de sincronizações
- [x] Supabase Dashboard para monitoramento de queries

### Acessibilidade

- [x] Navegação por teclado em tabelas e formulários
- [x] Contraste adequado (WCAG 2.1 AA)
- [x] Labels em todos os campos de formulário

---

## 11. Design System e Tokenização

> **Documentação completa:** [DESIGN_TOKENS.md](DESIGN_TOKENS.md)

### Regra Inviolável de Tokenização

⚠️ **REGRA OBRIGATÓRIA:** O sistema **NÃO PODE TER NENHUMA COR HARD-CODED**.

Todas as cores, espaçamentos, sombras, tipografia e outros valores de design DEVEM ser definidos através de design tokens documentados em [`DESIGN_TOKENS.md`](DESIGN_TOKENS.md).

#### O que isso significa na prática:

| ❌ Proibido | ✅ Obrigatório |
|------------|---------------|
| `color: #d4b037` | `color: hsl(var(--primary))` |
| `background: #0a0c10` | `background: hsl(var(--background))` |
| `border: 1px solid #262c38` | `border: 1px solid hsl(var(--border))` |
| `box-shadow: 0 4px 6px rgba(0,0,0,0.1)` | `box-shadow: var(--shadow-md)` |

#### Tokens Disponíveis (resumo)

O Design System OMNX utiliza:

**Cores da Marca:**
- `--empire-black` — Fundo principal
- `--empire-gold` — Cor primária (CTAs)
- `--empire-blue` — Cor secundária
- `--empire-white`, `--empire-gray`, `--empire-beige`, `--empire-green`, `--empire-brown`

**Tokens Semânticos:**
- `--background`, `--foreground` — Cores base
- `--card`, `--card-foreground` — Cards e superfícies
- `--primary`, `--primary-foreground` — Elementos primários
- `--secondary`, `--secondary-foreground` — Elementos secundários
- `--muted`, `--muted-foreground` — Elementos sutis
- `--accent`, `--accent-foreground` — Acentos e highlights
- `--destructive`, `--destructive-foreground` — Ações destrutivas
- `--border`, `--input`, `--ring` — Bordas e inputs

**Glassmorfismo:**
- Classes: `.glass`, `.glass-elevated`, `.glass-subtle`, `.glass-sidebar`, `.glass-header`
- Tokens: `--glass-blur`, `--glass-bg`, `--glass-border`, `--glass-shadow`

**Sombras:**
- `--shadow-xs` até `--shadow-lg`
- `--shadow-premium` — Para CTAs e elementos premium
- `--shadow-glow`, `--shadow-glow-strong` — Efeitos de brilho

### Verificação de Conformidade

Todo PR de código deve ser verificado para garantir que não existam:

1. **Cores hexadecimais hard-coded** (ex: `#d4b037`, `#fff`)
2. **Cores RGB/RGBA hard-coded** (ex: `rgb(212, 175, 55)`, `rgba(0,0,0,0.5)`)
3. **Valores de HSL hard-coded** (ex: `hsl(43, 74%, 49%)`) — usar sempre `hsl(var(--token))`
4. **Espaçamentos arbitrários** que não sigam a escala do Tailwind
5. **Sombras customizadas** não definidas nos tokens

### Exceções

As únicas exceções permitidas são:
- Cores em bibliotecas de terceiros que não aceitam CSS variables
- Gradientes complexos que usam cores tokenizadas como base

---

## 12. UX Notes

### Princípios de UI

1. **Clareza sobre estética:** Dados densos (tabelas de UTMs) devem ser legíveis antes de bonitos
2. **Feedback imediato:** Toda ação de salvar, sincronizar ou gerar código deve ter estado de loading e resultado visível
3. **Zero surpresas:** Operações destrutivas (deletar, substituir) pedem confirmação
4. **Progressividade:** Campos opcionais têm placeholder explicando o que é auto-gerado

### Microcopy

| Elemento | Texto |
|----------|-------|
| Botão salvar | "Salvar alterações" |
| Botão colar planilha | "Colar do Sheets" |
| Toast de sucesso | "Salvo com sucesso — [N] registros atualizados" |
| Toast de erro duplicata | "Conflito: [valor] já existe" |
| Toast de geração | "Códigos gerados automaticamente: [lista]" |
| Campo utm_source vazio | "Deixe em branco para gerar automaticamente" |

### Estados das Tabelas

| Estado | Aparência | Texto |
|--------|-----------|-------|
| Loading | Skeleton rows | — |
| Vazio | Ícone + CTA | "Nenhum registro ainda. Cole do Sheets ou adicione manualmente." |
| Erro | Ícone vermelho | "Erro ao carregar dados. Tente novamente." |
| Sucesso ao salvar | Toast verde | "Salvo com sucesso" |

### Alertas de Inconsistência

- Slugs sem origem → banner amarelo no topo da aba ORIGEM
- Campanhas sem processo → banner na aba PROCESSO DE VENDAS
- Campanhas sem funil → banner na aba FUNIS

---

## 13. Dados e Modelo

### Tabelas de Dados — Módulo Traqueamento

| Tabela | Propósito | Chave única |
|--------|-----------|-------------|
| `utm_slugs` | Slugs base para geração de códigos | `(workspace_id, slug)` |
| `utm_sources` | Canais pagos com public_code | `(workspace_id, utm_source)` |
| `utm_sources_plain` | Canais orgânicos sem public_code | `(workspace_id, utm_source)` |
| `utm_campaigns` | Campanhas com page_code e funis | `(workspace_id, utm_campaign)` |
| `utm_mediums` | Meios de veiculação | `(workspace_id, utm_medium)` |
| `utm_terms` | Identificadores de criativos | `(workspace_id, utm_term)` |
| `utm_objectives` | Objetivos de campanha | `(workspace_id, objective_code)` |
| `utm_origins` | Nomes de origens agrupadas | `(workspace_id, name)` |
| `utm_source_origin_assignments` | Mapeamento slug → origem | `(workspace_id, utm_source)` |
| `sales_processes` | Nomes dos processos de vendas | `(workspace_id, name)` |
| `sales_process_assignments` | Mapeamento campanha → processo | `(workspace_id, utm_campaign_id)` |
| `ads_campaigns` | Campanhas de anúncios com código | `(workspace_id, code)` |
| `ads_catalog` | Catálogo completo de anúncios pagos | `id` |
| `organic_catalog` | Catálogo de conteúdo orgânico | `id` |
| `notion_creatives` | Criativos sincronizados do Notion | `notion_page_id` |
| `notion_sync_runs` | Histórico de sincronizações Notion | `id` |
| `funnels` | Definições dos funis | `(workspace_id, name)` |

### Tabelas de Controle de Acesso

| Tabela | Propósito |
|--------|-----------|
| `workspaces` | Contas principais do sistema |
| `workspace_members` | Membros de cada workspace |
| `dashboard_user_permissions` | Permissões por chave de módulo |
| `dashboard_user_lead_filters` | Regras de filtro de leads por usuário |

### Tabelas de Dados Existentes (leitura)

| Tabela | Propósito |
|--------|-----------|
| `contatos` | Leads/contatos do GHL (70+ campos) |
| `oportunidades` | Oportunidades do pipeline GHL (35+ campos) |
| `meta_ads_insights` | Métricas processadas do Meta Ads |

### Campos PII (dados pessoais)

| Campo | Tabela | Justificativa |
|-------|--------|---------------|
| email | contatos | Comunicação e identificação |
| telefone | contatos | Comunicação |
| nome | contatos | Identificação |
| cpf_cnpj | vendas_fechamento | Contrato |
| endereço | vendas_fechamento | Contrato |

---

## 14. Integrações e APIs

| API | Categoria | Uso | Status |
|-----|-----------|-----|--------|
| Supabase | Backend/DB | Todas as queries e autenticação | ✅ Ativo |
| Notion API | Sync de criativos | Leitura de databases de criativos | 📋 A configurar |
| Switchy API | Encurtamento de URL | Gerar shortened_url | 📋 A configurar |
| Meta Marketing API | Dados de anúncios | Já integrado via meta_ads_insights | ✅ Ativo |

### Endpoints da API Interna

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/modules/tree` | Árvore de módulos com permissões do usuário |
| POST | `/api/auth/invite` | Convidar membro ao workspace |
| PUT | `/api/auth/permissions` | Atualizar permissões de um membro |
| POST | `/api/leads/filter` | Validar regras de filtro de leads |

### Edge Functions

| Função | Trigger | Descrição |
|--------|---------|-----------|
| `notion-creatives-sync` | Manual + CRON (2x/dia) | Sync de criativos pagos e orgânicos |
| `switchy-shorten` | Ao salvar catálogo | Encurtar URL UTM |
| `webhook-ghl` | POST do GHL | Receber webhooks (já existe) |
| `sync-meta-ads` | CRON (1x/hora) | Sync Meta Ads (já existe) |

---

## 15. Segurança e Compliance

### Vetores de Ataque

| Vetor | Mitigação |
|-------|-----------|
| Acesso a dados de outro workspace | RLS no Supabase garante isolamento por `workspace_id` |
| Usuário ver módulos sem permissão | Check de permissão no frontend E na API |
| Manipulação de filtros de leads | Filtros aplicados via RLS/query do servidor, não confiando no cliente |
| Injeção SQL | Sempre usar query builder do Supabase (parametrized queries) |
| Exposição de chaves API (Notion, Switchy) | Apenas em variáveis de ambiente do servidor |

### Auditoria

- [x] Log de convite de membros
- [x] Log de alteração de permissões
- [x] Log de execuções Notion (`notion_sync_runs`)
- [x] Supabase Logs para todas as queries

---

## 16. Critérios de Aceitação

### AC-001: Geração de utm_source sem conflito

```gherkin
Dado que existem utm_sources "iorg-1" e "iorg-2" no banco
Quando o usuário salva um novo UTM-SOURCE ADS com slug "iorg" e utm_source em branco
Então o sistema gera "iorg-3" automaticamente
E "iorg-3" não existe em utm_sources_plain
```

### AC-002: Isolamento de workspace

```gherkin
Dado que o usuário A e o usuário B pertencem a workspaces diferentes
Quando o usuário A faz login e acessa a lista de utm_sources
Então ele vê apenas seus próprios registros
E não vê nenhum registro do usuário B
```

### AC-003: Permissão de módulo

```gherkin
Dado que o membro João tem permissão apenas para "traqueamento.funis"
Quando João faz login no Dashboard Empire
Então ele vê apenas a aba Funis no módulo Traqueamento
E as outras abas (CODS UTM, Origem, etc.) não aparecem no menu
```

### AC-004: Filtro de leads por closer

```gherkin
Dado que o membro João tem filtro: oportunidades.vendedor_closer = "João Silva"
Quando João acessa qualquer tela que lista leads
Então ele vê apenas leads onde vendedor_closer é "João Silva"
E não vê leads de outros vendedores
```

### AC-005: Rename de funil em cascata

```gherkin
Dado que o funil "[fn] aplicação" está associado às campanhas 5, 9, 10, 12
Quando o admin renomeia "[fn] aplicação" para "[fn] aplicacao-form"
Então utm_campaigns com id 5, 9, 10, 12 têm seus arrays funnels atualizados
E o nome antigo não aparece mais em nenhum registro
```

### AC-006: Colar do Sheets com detecção de cabeçalho

```gherkin
Dado que o usuário copia do Sheets: "Nome\tSlug\nodavilouback\tDavi Louback"
Quando ele cola no campo de importação da sub-aba Slug UTM
Então a primeira linha é detectada como cabeçalho e ignorada
E apenas o registro "Davi Louback / odavilouback" é inserido
```

### AC-007: utm_term composto gerado corretamente

```gherkin
Dado que um anúncio tem: mês=10, objective_code=O1, public_code=P5, creative_id=CR-188, page_code=PG6
Quando o usuário salva o anúncio no Catálogo de Criativos
Então o utm_term gerado é "M10_O1_P5_CR-188_PG6"
E a URL final é "[url]?utm_source=...&utm_term=M10_O1_P5_CR-188_PG6"
```

---

## 17. Roadmap

### Fase 1 — Fundação (MVP)

| Entregável | Prioridade | Estimativa |
|-----------|-----------|------------|
| Setup Next.js + Supabase Auth | Bloqueante | S |
| Sistema de workspaces e RLS | Bloqueante | M |
| Tabelas do módulo Traqueamento | Bloqueante | L |
| Módulo TRAQUEAMENTO — CODS UTM (7 sub-abas) | MUST | XL |
| Módulo TRAQUEAMENTO — ORIGEM | MUST | M |
| Módulo TRAQUEAMENTO — PROCESSO DE VENDAS | MUST | M |
| Módulo TRAQUEAMENTO — ANÚNCIOS (5 sub-abas) | MUST | XL |
| Módulo TRAQUEAMENTO — ORGÂNICO (2 sub-abas) | MUST | L |
| Módulo TRAQUEAMENTO — FUNIS | MUST | M |
| Sistema de permissões por módulo | MUST | L |
| Filtro de leads por parâmetros | MUST | L |
| Integração Notion (Edge Function) | MUST | M |
| Integração Switchy (encurtamento) | MUST | S |

### Fase 2 — Gestão de Acesso (UI)

| Entregável | Prioridade | Estimativa |
|-----------|-----------|------------|
| Painel de administração de membros | SHOULD | L |
| UI para configurar permissões por módulo | SHOULD | L |
| UI para configurar filtros de leads | SHOULD | L |
| UI de configuração do Notion | SHOULD | M |

### Fase 3 — Módulos Futuros

| Módulo | Descrição | Prioridade |
|--------|-----------|-----------|
| CRM | Visualização de leads e pipeline | Alta |
| Meta Ads | Dashboard de performance de anúncios | Alta |
| Vendas | Relatórios de fechamento e receita | Média |
| Analytics | Gráficos e KPIs consolidados | Baixa |

### T-Shirt Sizing

| Tamanho | Estimativa |
|---------|------------|
| XS | < 2 horas |
| S | 2–4 horas |
| M | 4–8 horas |
| L | 1–2 dias |
| XL | 3–5 dias |
| XXL | > 1 semana (quebrar!) |

---

## 18. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação | Dono |
|-------|---------------|---------|-----------|------|
| Notion muda estrutura da API | Baixa | Alto | Mapear campos por nome exato; alertar no log de sync em caso de campo ausente | Dev |
| Switchy URL encurtada expira | Média | Médio | Re-gerar ao detectar link inativo; manter URL original como fallback | Dev |
| Conflito de namespace utm_source entre ADS e Orgânico | Alta | Alto | Validação dupla no frontend E na Edge Function antes de salvar | Dev |
| Usuário deleta utm_source em uso nos leads | Média | Alto | Alerta "Este código está em uso por [N] leads — excluir quebrará atribuição" + confirmação obrigatória | Dev |
| Performance com muitos registros em tabelas | Média | Médio | Paginação server-side; índices nas colunas de filtro/sort; lazy loading | Dev |
| Membro vê leads além do permitido (bug de permissão) | Baixa | Crítico | Filtro aplicado no servidor (não apenas no frontend); teste de isolamento obrigatório | Dev/QA |

---

## 19. Próximos Passos

1. [ ] Aprovar este PRD com o time
2. [ ] Criar banco de dados das tabelas UTM no Supabase (migrations)
3. [ ] Criar tabelas de controle de acesso (`workspaces`, `workspace_members`, `dashboard_user_permissions`, `dashboard_user_lead_filters`)
4. [ ] Configurar RLS em todas as tabelas novas
5. [ ] Setup do projeto Next.js com Supabase Auth
6. [ ] Implementar módulo TRAQUEAMENTO — começar pela sub-aba Slug UTM como template
7. [ ] Configurar integração Notion (criar integration + definir Database IDs)
8. [ ] Configurar integração Switchy (obter API key)
9. [ ] Implementar sistema de permissões
10. [ ] Testes de isolamento de workspace (AC-002 obrigatório antes de qualquer deploy)

---

## Documentos Relacionados

| Documento | Descrição |
|-----------|-----------|
| [DESIGN_TOKENS.md](DESIGN_TOKENS.md) | **Design System OMNX — tokens de cores, tipografia, sombras e glassmorfismo** |
| [DASHBOARD-CONTROLE-ACESSO.md](DASHBOARD-CONTROLE-ACESSO.md) | Especificação completa do sistema de acesso multi-usuário |
| [DASHBOARD-MODULOS.md](DASHBOARD-MODULOS.md) | Guia para adicionar novos módulos, sub-módulos e sub-sub-módulos |
| [TABELAS-DADOS.md](TABELAS-DADOS.md) | Padrão obrigatório para implementação de tabelas de dados |
| [CORRELACAO-META-CRM.md](CORRELACAO-META-CRM.md) | P-Code System e hierarquia de atribuição UTM |
| [ARQUITETURA.md](ARQUITETURA.md) | Arquitetura geral do sistema GHL-Supabase |
| [Document_GHL.md](Document_GHL.md) | Mapeamento completo de campos do GHL |
