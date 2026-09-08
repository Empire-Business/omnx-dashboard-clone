# Dashboard Empire — Guia de Módulos

| Campo | Valor |
|-------|-------|
| **Versão** | 1.0 |
| **Data** | 2026-02-25 |
| **Status** | Draft |
| **Relacionado** | PRD-DASHBOARD-EMPIRE.md, DASHBOARD-CONTROLE-ACESSO.md |

---

## Índice

1. [Hierarquia de Módulos](#1-hierarquia-de-módulos)
2. [Catálogo de Módulos Registrados](#2-catálogo-de-módulos-registrados)
3. [Como Adicionar um Novo Módulo](#3-como-adicionar-um-novo-módulo)
4. [Como Adicionar uma Nova Aba (Sub-módulo)](#4-como-adicionar-uma-nova-aba-sub-módulo)
5. [Como Adicionar uma Nova Sub-aba (Sub-sub-módulo)](#5-como-adicionar-uma-nova-sub-aba-sub-sub-módulo)
6. [Convenções e Regras](#6-convenções-e-regras)
7. [Checklist por Nível de Adição](#7-checklist-por-nível-de-adição)
8. [Templates de Estrutura](#8-templates-de-estrutura)

---

## 1. Hierarquia de Módulos

O Dashboard Empire organiza todas as suas funcionalidades em três níveis:

```
Nível 1: MÓDULO
  └── Nível 2: ABA (Tab)
        └── Nível 3: SUB-ABA (Sub-tab)
              └── Nível 4: SUB-SUB-ABA (se necessário)
```

Cada nível é identificado por uma **chave de módulo** em notação de pontos.

### Regra transversal: Cohort vs Produtividade

- `Cohort` agrupa por geração do lead (`data_lead_recebido`) e pode exibir funil.
- `Produtividade` agrupa por data do próprio evento e as etapas devem ser independentes.
- Em qualquer módulo com toggle `Cohort/Produtividade`, o modo produtividade não deve exibir taxas ou funis encadeados entre `Leads`, `MQLs`, `Conectados`, `Agendados`, `Reuniões` e `Fechados`.

### Exemplo com o módulo Traqueamento

```
traqueamento                                   ← Nível 1: Módulo
│
├── traqueamento.cods_utm                      ← Nível 2: Aba
│   ├── traqueamento.cods_utm.slug_utm         ← Nível 3: Sub-aba
│   ├── traqueamento.cods_utm.utm_source_ads   ← Nível 3: Sub-aba
│   └── traqueamento.cods_utm.utm_campaign     ← Nível 3: Sub-aba
│
├── traqueamento.anuncios                      ← Nível 2: Aba
│   ├── traqueamento.anuncios.campanhas        ← Nível 3: Sub-aba
│   └── traqueamento.anuncios.catalogo_criativos ← Nível 3: Sub-aba
│
└── traqueamento.funis                         ← Nível 2: Aba (sem sub-abas)
```

### Notação de Chaves

| Nível | Formato | Exemplo |
|-------|---------|---------|
| Módulo | `[modulo]` | `traqueamento` |
| Aba | `[modulo].[aba]` | `traqueamento.cods_utm` |
| Sub-aba | `[modulo].[aba].[sub_aba]` | `traqueamento.cods_utm.slug_utm` |
| Sub-sub-aba | `[modulo].[aba].[sub_aba].[sub_sub]` | `traqueamento.anuncios.catalogo_criativos.config` |

### Regras de Nomenclatura de Chaves

1. Sempre em **snake_case** (letras minúsculas, separadas por `_`)
2. Sem caracteres especiais, acentos ou espaços
3. Sem números no início do segmento
4. Máximo de **4 níveis** de profundidade — se precisar de mais, repensar a estrutura
5. Cada segmento deve ter entre 3 e 30 caracteres

**Exemplos válidos:**
```
crm
crm.leads
crm.leads.lista
crm.leads.lista.filtros

meta_ads
meta_ads.campanhas
meta_ads.insights.breakdown_idade
```

**Exemplos inválidos:**
```
CRM           → deve ser minúsculo
crm.Leads     → deve ser minúsculo
crm-leads     → usar _ não -
crm.a         → muito curto
crm.leads.detalhes.historico.notas  → mais de 4 níveis
```

---

## 2. Catálogo de Módulos Registrados

Este catálogo é a fonte da verdade para todos os módulos do sistema. Mantenha-o atualizado sempre que adicionar ou remover um módulo, aba ou sub-aba.

### Módulos Ativos

| Chave | Nome | Status | PRD |
|-------|------|--------|-----|
| `vendas` | Vendas | ✅ V1 | — |
| `aquisicao` | Aquisição | ✅ V1 | — |
| `traqueamento` | Traqueamento | ✅ V1 | [PRD-DASHBOARD-EMPIRE.md](PRD-DASHBOARD-EMPIRE.md) |
| `pre_vendas` | Pré-Vendas | ✅ V1 | [PRD-DASHBOARD-EMPIRE.md](PRD-DASHBOARD-EMPIRE.md) |
| `metas` | Metas | ✅ V1 | [MODULO-METAS.md](MODULO-METAS.md) |
| `leads` | Leads | ✅ V1 | [PRD-DASHBOARD-EMPIRE.md](PRD-DASHBOARD-EMPIRE.md) |

### Abas do Módulo Vendas

| Chave | Nome | Status |
|-------|------|--------|
| `vendas.geral` | Visão Geral | ✅ V1 |
| `vendas.matriz` | Matriz | ✅ V1 |
| `vendas.closers` | Closers | ✅ V1 |
| `vendas.reunioes` | Reuniões | ✅ V1 — ver `docs/ABA-REUNIOES-VENDAS.md` |

### Abas do Módulo Aquisição

| Chave | Nome | Status |
|-------|------|--------|
| `aquisicao.visao_geral` | Visão Geral | ✅ V1 |
| `aquisicao.matriz` | Matriz | ✅ V1 |
| `aquisicao.leads` | Leads | ✅ V1 |

### Abas do Módulo Traqueamento

| Chave | Nome | Status |
|-------|------|--------|
| `traqueamento.cods_utm` | CODS UTM | ✅ V1 |
| `traqueamento.origem` | Origem | ✅ V1 |
| `traqueamento.processo_vendas` | Processo de Vendas | ✅ V1 |
| `traqueamento.anuncios` | Anúncios | ✅ V1 |
| `traqueamento.organico` | Orgânico | ✅ V1 |
| `traqueamento.funis` | Funis | ✅ V1 |

### Sub-abas do Módulo Traqueamento

| Chave | Nome | Status |
|-------|------|--------|
| `traqueamento.cods_utm.slug_utm` | Slug UTM | ✅ V1 |
| `traqueamento.cods_utm.utm_source_ads` | UTM-SOURCE ADS | ✅ V1 |
| `traqueamento.cods_utm.utm_source_organico` | UTM-SOURCE Orgânico | ✅ V1 |
| `traqueamento.cods_utm.utm_campaign` | UTM-CAMPAIGN | ✅ V1 |
| `traqueamento.cods_utm.utm_medium` | UTM-MEDIUM | ✅ V1 |
| `traqueamento.cods_utm.utm_term` | UTM-TERM | ✅ V1 |
| `traqueamento.cods_utm.objetivo_ads` | Objetivo ADS | ✅ V1 |
| `traqueamento.anuncios.campanhas` | Campanhas de Anúncios | ✅ V1 |
| `traqueamento.anuncios.testes_criativos` | Testes de Criativos | ✅ V1 (placeholder) |
| `traqueamento.anuncios.catalogo_criativos` | Catálogo de Criativos | ✅ V1 |
| `traqueamento.anuncios.producao_notion` | Produção (Notion) | ✅ V1 — sync do Notion + controle manual de teste (`Testado` / `Início do Teste`) |
| `traqueamento.anuncios.producao_direta` | Produção (Direta) | ✅ V1 |
| `traqueamento.organico.producao` | Produção Orgânico | ✅ V1 |
| `traqueamento.organico.catalogo` | Catálogo Orgânico | ✅ V1 |

### Abas do Módulo Pré-Vendas

| Chave | Nome | Status |
|-------|------|--------|
| `pre_vendas.atividades` | Atividades | ✅ V1 — ver `docs/ABA-ATIVIDADES-PRE-VENDAS.md` |
| `pre_vendas.mqls` | MQLs | ✅ V1 |
| `pre_vendas.sdrs` | SDRs | ✅ V1 |
| `pre_vendas.auto_agendados` | Auto Agendados | ✅ V1 |
| `pre_vendas.leads_parados` | Leads Parados | ✅ V1 |
| `pre_vendas.auditoria_ia` | Auditoria IA | ✅ V1 — ver `docs/ABA-AUDITORIA-IA.md` |

### Abas do Módulo Metas

| Chave | Nome | Status |
|-------|------|--------|
| `metas.overview` | Visão Geral | ✅ V1 |
| `metas.tracking` | Acompanhamento | ✅ V1 |
| `metas.registry` | Metas | ✅ V1 |
| `metas.history` | Histórico | ✅ V1 |

### Abas do Módulo Leads

| Chave | Nome | Status |
|-------|------|--------|
| `leads.lista` | Lista | ✅ V1 |
| `leads.limpeza` | Limpeza | ✅ V1 |

### Drilldown operacional de conexão (2026-04-13)

Nos módulos `Aquisição`, `Tráfego` e `Orgânico`, o card `Não conectados` deve seguir o mesmo padrão de `Conectados`.

- `Conectados` e `Não conectados` aparecem lado a lado na Visão Geral
- ambos abrem `LeadListModal`
- o clique na linha abre `LeadCard`
- a aba `Leads` continua existindo como lista ampla, não como fluxo primário desse atalho

### Abas do Módulo Tráfego Pago

O módulo Tráfego Pago está dentro do painel principal. Exibe os dados de aquisição paga (Meta Ads + CRM).

| Chave | Nome | Status | Descrição |
|-------|------|--------|-----------|
| `trafego.visao_geral` | Visão Geral | ✅ V1 | KPIs, MetaTrackingCard, gráficos de segmentação (MQLs/Vendas por funil/público) |
| `trafego.matriz` | Matriz | ✅ V1 | Aba separada com toggle Cohort/Produtividade, filtros próprios e tabelas |
| `trafego.cohort` | Cohort (modo) | ✅ V1 | Leads agrupados por **data de geração** (`data_lead_recebido`). Disponível na aba Matriz. |
| `trafego.produtividade` | Produtividade (modo) | ✅ V1 | Mesma base de leads do Cohort (`data_lead_recebido`), mas eventos agrupados pelo **mês em que ocorreram**. Pode gerar funis incompletos. Disponível na aba Matriz. |
| `trafego.criativos` | Ranking de Criativos | ✅ V1 | Tabela fullscreen com métricas por criativo (Investimento, Faturamento, Caixa, MQL, CPMQL, Vendas, CPV), colunas configuráveis e expansão de públicos em cada linha. O criativo mostra o total e, abaixo dele, pode exibir várias linhas de públicos por `public_code`. |

**Toggle UI:** botões "Cohort" / "Produtividade" na aba Matriz (primeiro elemento interativo).

**Hook de dados:**
- Cohort → `useTrafego` (filtra por `data_lead_recebido`) + `useCohort` (compute)
- Produtividade → `useProducao` (filtra por `data_lead_recebido`, igual ao Cohort) + `computeProducao` (agrupa eventos pelo mês de ocorrência)

**Lazy loading:** `useProducao` só faz a requisição quando o usuário clica em "Produtividade" (parâmetro `enabled`).

**Diferença conceitual (ver `docs/CONCEITOS-NEGOCIO.md`):**
```
COHORT:        "Dos leads gerados em Jan/26, quantos fecharam?" (conta eventos sem filtro de data)
PRODUTIVIDADE: "Dos leads gerados em Jan/26, quantos fecharam EM Jan/26?" (conta só eventos no período)
```

### Módulos Planejados (Futuras Versões)

| Chave | Nome | Status | Estimativa |
|-------|------|--------|-----------|
| `crm` | CRM — Leads e Pipeline | 📋 Planejado | V2 |
| `meta_ads` | Meta Ads Dashboard | 📋 Planejado | V2 |
| `vendas` | Relatórios de Vendas | 📋 Planejado | V3 |
| `analytics` | Analytics Consolidado | 📋 Planejado | V3 |
| `configuracoes` | Configurações do Sistema | 📋 Planejado | V1 (parallel) |

---

## 3. Como Adicionar um Novo Módulo

Um **módulo** é uma funcionalidade principal do sistema, acessível via sidebar. Exemplos: Traqueamento, CRM, Meta Ads, Vendas.

### Passo 1: Definir a Chave e o Nome

Antes de qualquer implementação, defina:

```
Chave: [nome_em_snake_case]
Nome exibido: [Nome Legível para o Usuário]
Rota URL: /[nome_em_snake_case]
Ícone: [ícone do Lucide React ou similar]
Descrição curta: [Uma frase descrevendo para que serve]
```

**Exemplo:**
```
Chave: crm
Nome exibido: CRM
Rota URL: /crm
Ícone: Users
Descrição curta: Gestão de leads, contatos e pipeline de vendas
```

### Passo 2: Registrar no Catálogo

Adicionar o novo módulo na seção [Catálogo de Módulos Registrados](#2-catálogo-de-módulos-registrados) deste arquivo:

```markdown
| `crm` | CRM | 🚧 Em desenvolvimento | [PRD-CRM.md](PRD-CRM.md) |
```

### Passo 3: Criar o PRD do Módulo

Criar `docs/PRD-[NOME-MODULO].md` seguindo a estrutura de `docs/PRD-DASHBOARD-EMPIRE.md`.

O PRD do módulo deve incluir:
- Descrição do módulo e suas abas
- Chaves de cada aba e sub-aba
- Tabelas do banco de dados necessárias
- Requisitos funcionais específicos

### Passo 4: Definir as Abas e Sub-abas

Listar a hierarquia completa de abas antes de implementar:

```
crm                              ← Módulo (você está aqui)
├── crm.leads                    ← Aba: Lista de Leads
│   ├── crm.leads.lista          ← Sub-aba: Tabela de leads
│   ├── crm.leads.kanban         ← Sub-aba: Visão Kanban
│   └── crm.leads.importar       ← Sub-aba: Importar leads
│
├── crm.contatos                 ← Aba: Contatos
│
└── crm.relatorios               ← Aba: Relatórios
```

### Passo 5: Registrar no Catálogo de Módulos

Adicionar todas as chaves do novo módulo (módulo, abas, sub-abas) no catálogo deste arquivo.

### Passo 6: Criar as Migrações do Banco de Dados

Criar migration em `supabase/migrations/` com:
- Tabelas novas necessárias para o módulo
- Campo `workspace_id UUID NOT NULL` em todas as tabelas
- Políticas RLS para isolamento por workspace
- Índices nas colunas de filtro/sort

### Passo 7: Implementar a Estrutura do Módulo (Frontend)

**Estrutura de pastas no Next.js:**

```
app/
└── [modulo]/                    ← Pasta raiz do módulo
    ├── page.tsx                 ← Página principal (redireciona para aba padrão)
    ├── layout.tsx               ← Layout do módulo (sidebar interno, header)
    └── [aba]/                   ← Pasta de cada aba
        ├── page.tsx             ← Página da aba
        └── [sub-aba]/           ← Pasta de cada sub-aba (se houver)
            └── page.tsx
```

**Exemplo para CRM:**
```
app/
└── crm/
    ├── page.tsx                 ← Redireciona para /crm/leads
    ├── layout.tsx
    └── leads/
        ├── page.tsx             ← Redireciona para /crm/leads?sub=lista
        ├── Lista.tsx
        ├── Kanban.tsx
        └── Importar.tsx
```

### Passo 8: Registrar no Arquivo de Módulos do Sistema

Criar ou atualizar `src/config/modules.ts` com a definição do novo módulo:

```
// ATENÇÃO: Este é um template de estrutura, não código final.
// O desenvolvedor deve adaptar conforme o framework e convenções do projeto.

Definir objeto de módulo com:
- key: "crm"
- label: "CRM"
- icon: <ícone>
- href: "/crm"
- tabs: [array de abas com suas sub-abas]
- requiredPermission: "crm"
```

### Passo 9: Envolver com PermissionGate

Toda página de módulo deve estar envolvida com o componente `<PermissionGate>`:

```
// Na page.tsx do módulo:
<PermissionGate moduleKey="crm">
  <CrmModulePage />
</PermissionGate>

// Na page.tsx de uma aba:
<PermissionGate moduleKey="crm.leads">
  <CrmLeadsTab />
</PermissionGate>
```

### Passo 10: Atualizar a Documentação

Após implementar:
- [ ] Atualizar catálogo neste arquivo com status "✅ V[número]"
- [ ] Atualizar `docs/MUDANCAS.md` com a adição do módulo
- [ ] Se houver decisão técnica relevante, registrar em `docs/DECISOES.md`
- [ ] Se alterar a arquitetura, atualizar `docs/ARQUITETURA.md`

---

## 4. Como Adicionar uma Nova Aba (Sub-módulo)

Uma **aba** é uma seção dentro de um módulo existente. Exemplos: "CODS UTM", "ORIGEM" dentro de Traqueamento.

### Passo 1: Definir a Chave

```
Chave: [modulo_existente].[nova_aba]
Nome exibido: [Nome Legível]
```

**Exemplo:** Adicionar aba "Públicos" ao módulo Traqueamento:
```
Chave: traqueamento.publicos
Nome exibido: Públicos
```

### Passo 2: Verificar Compatibilidade

Antes de adicionar, verificar:
- A chave não existe no catálogo
- O nome não conflita com abas existentes no mesmo módulo
- O conteúdo da aba faz sentido dentro do módulo pai

### Passo 3: Registrar no Catálogo

Adicionar na tabela de abas do módulo correspondente neste arquivo.

### Passo 4: Criar as Tabelas Necessárias

Se a nova aba precisar de tabelas de banco:
1. Criar migration em `supabase/migrations/`
2. Incluir `workspace_id` em todas as tabelas
3. Configurar RLS
4. Documentar as tabelas no PRD do módulo

### Passo 5: Implementar o Componente da Aba

**Estrutura mínima de uma aba:**

```
Arquivo: app/traqueamento/publicos/page.tsx (ou componente separado)

Contém:
- Header da aba (título, descrição, botões de ação)
- Componente de tabela seguindo docs/TABELAS-DADOS.md
- Se tiver sub-abas: navegação por sub-abas via ?sub= na URL
- PermissionGate envolvendo o conteúdo
```

### Passo 6: Adicionar ao Menu do Módulo

Atualizar a configuração do módulo pai para incluir a nova aba na navegação interna.

### Passo 7: Atualizar Documentação

- [ ] Atualizar catálogo neste arquivo
- [ ] Atualizar PRD do módulo com a nova aba e seus requisitos
- [ ] Atualizar `docs/MUDANCAS.md`

---

## 5. Como Adicionar uma Nova Sub-aba (Sub-sub-módulo)

Uma **sub-aba** é uma seção dentro de uma aba. Exemplos: "Slug UTM", "UTM-SOURCE ADS" dentro de "CODS UTM".

### Passo 1: Definir a Chave

```
Chave: [modulo].[aba].[nova_sub_aba]
Nome exibido: [Nome Legível]
```

**Exemplo:** Adicionar sub-aba "UTM-DEVICE" ao CODS UTM:
```
Chave: traqueamento.cods_utm.utm_device
Nome exibido: UTM-DEVICE
```

### Passo 2: Verificar Profundidade

- Se a aba já tem sub-abas, adicionar mais uma sub-aba ao mesmo nível
- Se precisar criar um nível a mais (sub-sub-aba), verificar se o design ainda faz sentido
- **Regra:** Máximo de 4 níveis. Se precisar de mais, refatorar a estrutura.

### Passo 3: Registrar no Catálogo

Adicionar na tabela de sub-abas do módulo correspondente neste arquivo.

### Passo 4: Implementar

**Padrão de navegação por sub-aba:**

A URL usa o parâmetro `?sub=[sub_aba]`. Ao trocar de sub-aba, o valor é substituído (não empilhado):

```
/traqueamento?tab=cods_utm&sub=slug_utm
/traqueamento?tab=cods_utm&sub=utm_device   ← substituiu slug_utm
```

**Estrutura mínima de uma sub-aba com tabela:**

O componente da sub-aba deve seguir os padrões de `docs/TABELAS-DADOS.md`:
- Sticky header
- Ordenação por coluna
- Paginação
- Fullscreen
- Visibilidade de colunas
- Footer com totalizadores

### Passo 5: Atualizar Documentação

- [ ] Atualizar catálogo neste arquivo
- [ ] Atualizar PRD do módulo descrevendo a nova sub-aba
- [ ] Atualizar `docs/MUDANCAS.md`

---

## 6. Convenções e Regras

### Regras de Chave de Módulo

| Regra | Correto | Errado |
|-------|---------|--------|
| snake_case | `utm_source_ads` | `utmSourceAds`, `UTM-SOURCE-ADS` |
| Minúsculas | `traqueamento` | `Traqueamento` |
| Separador de nível | `.` (ponto) | `/`, `-`, `_` entre níveis |
| Máx. 4 níveis | `a.b.c.d` | `a.b.c.d.e` |
| Sem números no início | `campanha_1` | `1_campanha` |

### Regras de Navegação

| Regra | Descrição |
|-------|-----------|
| Aba padrão | Todo módulo deve ter uma aba padrão (primeira aba) para redirect |
| **Sidebar ↔ TABS sincronizados** | **Toda aba definida no array `TABS` de um módulo DEVE ter um child correspondente no array `navigation` do `Sidebar.tsx`**. Ao criar nova aba, adicionar na Sidebar imediatamente |
| URL limpa | Ao navegar entre sub-abas, usar replace na URL (não push) para evitar histórico sujo |
| Deep link | Todo estado de navegação (módulo/aba/sub-aba) deve ser bookmarkável via URL |
| Sem modal | Não usar modais para navegação principal — apenas para detalhes de registros |

### Regras de Permissão

| Regra | Descrição |
|-------|-----------|
| Invisível, não desabilitado | Módulos sem permissão não aparecem no menu |
| Dupla verificação | Frontend oculta; servidor valida antes de retornar dados |
| Herança descendente | Permissão no pai implica acesso a todos os filhos |
| Admin vê tudo | Usuários com role `owner` ou `admin` não precisam de permissões explícitas |

### Regras do Toggle Cohort / Produtividade

Painéis que suportam os dois modos (Cohort e Produtividade) devem seguir este padrão obrigatório:

| Regra | Descrição |
|-------|-----------|
| Posição | SEMPRE o primeiro elemento interativo do painel, ACIMA dos filtros de data |
| Container | Card `rounded-xl p-4` com `border 1.5px var(--ghost)` e `bg var(--mist)` |
| Botões | `px-4 py-2 text-sm font-semibold`; ativo: `border-[var(--gold)] bg-[rgba(201,162,64,0.15)] text-[var(--gold)] shadow-sm` |
| Explicação | `text-xs leading-relaxed text-[var(--steel)]` abaixo dos botões, muda conforme modo selecionado |
| Texto Cohort | "Cohort: agrupa leads pela data em que foram gerados. Responde 'o que aconteceu com os leads que entraram neste período?' — ideal para avaliar qualidade de aquisição e ROI." |
| Texto Produtividade (Tráfego/Aquisição) | "Produtividade: conta o que aconteceu no período selecionado. Cada métrica usa a data do próprio evento e respeita apenas os filtros ativos. Leads e MQLs não podem limitar números operacionais." |
| Texto Produtividade (Pré-Vendas/Recuperação) | "Produtividade: mostra a atividade real dos SDRs — ligações, mensagens e pessoas contatadas por dia. Responde 'quanto cada SDR trabalhou neste período?'" |
| Impacto | TODOS os dados do painel variam com o modo |

**Painéis que usam este padrão:** Tráfego (`TrafegoTab.tsx`), Aquisição (`AquisicaoTab.tsx`), Pré-Vendas (`PreVendasPage.tsx`), Recuperação (`RecuperacaoPage.tsx`)

**Hook de dados (Pré-Vendas / Recuperação):**
- Cohort → `usePreVendas` (filtra por `data_lead_recebido`) + `useCohort` (compute)
- Produtividade → `useSDRAtividade` (busca comunicações outbound humanas, agrupa por SDR + dia) + `AtividadeSDRPanel` (render)
  - Dados: `comunicacoes` (direction='outbound', ghl_source='app', channel in call/whatsapp/sms)
  - Métricas: ligações, mensagens, pessoas únicas contatadas — total + média/dia
  - Interação: clique no SDR expande detalhamento diário
- Ambos respeitam `pipelineMode`: `exclude_recuperacao` (Pré-Vendas) ou `only_recuperacao` (Recuperação)

### Regras de Tabelas de Dados

Toda tabela de dados em qualquer módulo deve seguir o padrão em `docs/TABELAS-DADOS.md`:

- [ ] Estrutura HTML semântica
- [ ] Sticky header + sticky primeira coluna
- [ ] Ordenação por clique no header
- [ ] Paginação com seletor de tamanho de página
- [ ] Botão de fullscreen
- [ ] Menu de visibilidade de colunas
- [ ] Footer com totalizadores
- [ ] Estados: loading (skeleton), vazio, erro
- [ ] Células clicáveis com modal de detalhes (quando aplicável)

### Regras de Banco de Dados

Toda tabela nova deve ter:

```
id               UUID DEFAULT gen_random_uuid() PRIMARY KEY
workspace_id     UUID NOT NULL REFERENCES workspaces(id)
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()
```

E política RLS:
```
-- Leitura: apenas membros do workspace
-- Escrita: apenas membros com can_edit na permissão do módulo
```

### Regras de Documentação

Ao adicionar qualquer nível de módulo:

| O que fazer | Quando |
|-------------|--------|
| Atualizar catálogo neste arquivo | Sempre |
| Atualizar PRD do módulo | Sempre |
| Criar novo PRD | Ao adicionar novo módulo principal |
| Atualizar `docs/MUDANCAS.md` | Sempre |
| Atualizar `docs/DECISOES.md` | Se houver decisão técnica |
| Atualizar `docs/ARQUITETURA.md` | Se alterar a arquitetura |

---

## 7. Checklist por Nível de Adição

### Checklist: Novo Módulo (Nível 1)

```
[ ] Definir chave (snake_case, única)
[ ] Definir nome exibido
[ ] Definir rota URL
[ ] Definir ícone
[ ] Criar PRD-[NOME].md
[ ] Registrar no catálogo deste arquivo
[ ] Criar migrations do banco (workspace_id + RLS)
[ ] Criar estrutura de pastas no Next.js
[ ] Implementar layout do módulo
[ ] Implementar PermissionGate no nível do módulo
[ ] Registrar em src/config/modules.ts
[ ] Testar isolamento de workspace
[ ] Testar verificação de permissão
[ ] Atualizar docs/MUDANCAS.md
```

### Checklist: Nova Aba (Nível 2)

```
[ ] Verificar que módulo pai existe
[ ] Definir chave (modulo.aba)
[ ] Verificar que chave não existe no catálogo
[ ] Registrar no catálogo deste arquivo
[ ] Criar migrations necessárias (se precisar de tabelas novas)
[ ] Implementar componente da aba
[ ] Implementar PermissionGate no nível da aba
[ ] Adicionar ao menu do módulo pai
[ ] Implementar navegação via ?tab= na URL
[ ] Definir aba padrão se for a primeira
[ ] Seguir padrão de TABELAS-DADOS.md se tiver tabela
[ ] Atualizar PRD do módulo
[ ] Atualizar docs/MUDANCAS.md
```

### Checklist: Nova Sub-aba (Nível 3)

```
[ ] Verificar que módulo e aba pai existem
[ ] Definir chave (modulo.aba.sub_aba)
[ ] Verificar que chave não existe no catálogo
[ ] Registrar no catálogo deste arquivo
[ ] Criar migrations necessárias (se precisar de tabelas novas)
[ ] Implementar componente da sub-aba
[ ] Implementar PermissionGate no nível da sub-aba
[ ] Implementar navegação via ?sub= na URL (replace, não push)
[ ] Seguir padrão de TABELAS-DADOS.md se tiver tabela
[ ] Implementar persistência de colunas no localStorage (se tabela configurável)
[ ] Chave localStorage: [modulo].[aba].[sub_aba].columns.visible
[ ] Atualizar PRD do módulo
[ ] Atualizar docs/MUDANCAS.md
```

### Checklist: Nova Sub-sub-aba (Nível 4 — use com cautela)

```
[ ] Verificar que usar nível 4 é realmente necessário
[ ] Verificar que não ultrapassará 4 níveis
[ ] Definir chave (modulo.aba.sub_aba.sub_sub)
[ ] Mesmo checklist da sub-aba, adaptado para o nível 4
[ ] Adicionar nota no PRD justificando a necessidade do nível 4
```

---

## 8. Templates de Estrutura

### Template: Definição de Módulo

Use este template ao registrar um novo módulo no catálogo (copie e preencha):

```markdown
### Módulo: [Nome do Módulo]

| Campo | Valor |
|-------|-------|
| **Chave** | `[chave]` |
| **Rota** | `/[chave]` |
| **Status** | 🚧 Em desenvolvimento / ✅ V[N] |
| **PRD** | [PRD-[NOME].md](PRD-[NOME].md) |
| **Aba padrão** | `[chave].[aba_padrao]` |

#### Abas

| Chave | Nome | Status |
|-------|------|--------|
| `[chave].[aba1]` | [Nome da Aba 1] | 🚧 / ✅ |
| `[chave].[aba2]` | [Nome da Aba 2] | 🚧 / ✅ |

#### Sub-abas

| Chave | Nome | Status |
|-------|------|--------|
| `[chave].[aba1].[sub1]` | [Nome da Sub-aba 1] | 🚧 / ✅ |
| `[chave].[aba1].[sub2]` | [Nome da Sub-aba 2] | 🚧 / ✅ |
```

---

### Template: Descrição de Sub-aba no PRD

Use este template ao documentar uma nova sub-aba no PRD do módulo:

```markdown
#### Sub-aba [N.N]: [Nome da Sub-aba]

**Chave:** `[modulo].[aba].[sub_aba]`
**Tabela:** `[nome_da_tabela]`

[Descrição de uma linha do que essa sub-aba faz]

**Campos:**
| Campo | Tipo | Obrigatório | Validação |
|-------|------|-------------|-----------|
| [campo] | text/integer/boolean/JSONB | Sim/Não | [Regra] |

**Regras de negócio:**
- RN1: [Regra mais importante]
- RN2: [Segunda regra]

**Comportamentos:**
- Colar do Sheets: [N] colunas ([lista de colunas])
- Detecção automática de cabeçalho: [palavras-chave]
- Geração automática: [campos e formato]

**Personalização de colunas:** [N] colunas configuráveis. Chave localStorage: `[modulo].[aba].[sub_aba].columns.visible`
```

---

### Template: Regras de Filtro de Leads para Novo Módulo

Ao adicionar um módulo que exibe leads, documentar os campos disponíveis para filtro:

```markdown
### Campos de Filtro de Leads — Módulo [Nome]

Os seguintes campos deste módulo estão disponíveis para uso no sistema de filtro de leads
(ver [DASHBOARD-CONTROLE-ACESSO.md](DASHBOARD-CONTROLE-ACESSO.md)):

| Tabela | Campo | Tipo | Exemplo de uso |
|--------|-------|------|----------------|
| contatos | utm_source | text | Filtrar por canal de origem |
| oportunidades | vendedor_closer | text | Filtrar por closer |
| [nova_tabela] | [novo_campo] | [tipo] | [uso] |

Para adicionar novos campos ao whitelist de filtros:
1. Adicionar na lista de campos permitidos em `src/lib/leadFilterWhitelist.ts`
2. Documentar nesta tabela
3. Testar que o filtro por este campo retorna resultados corretos
```

---

### Template: Estrutura de Pastas para Novo Módulo

```
app/
└── [modulo]/
    ├── page.tsx                     ← Redirect para aba padrão
    ├── layout.tsx                   ← Layout com sidebar/tabs interno
    │
    ├── [aba1]/
    │   ├── page.tsx                 ← Página da aba (tabs se houver sub-abas)
    │   ├── [Sub-aba1].tsx           ← Componente da sub-aba
    │   ├── [Sub-aba2].tsx
    │   └── hooks/
    │       └── use[Aba1]Data.ts     ← Hook de dados da aba
    │
    └── [aba2]/
        ├── page.tsx
        └── [Aba2Component].tsx

src/
├── components/
│   └── [modulo]/
│       ├── [Modulo]Layout.tsx       ← Layout reutilizável do módulo
│       └── [Modulo]Sidebar.tsx      ← Sidebar interna do módulo
│
└── lib/
    └── [modulo]/
        ├── types.ts                 ← Tipos TypeScript do módulo
        └── queries.ts               ← Queries Supabase do módulo
```

---

## Histórico de Módulos

| Data | Ação | Módulo/Aba | Responsável |
|------|------|-----------|-------------|
| 2026-02-25 | Criado | `traqueamento` (V1 completo) | Empire Business |

> Atualizar esta tabela sempre que um módulo for adicionado, alterado ou removido.
