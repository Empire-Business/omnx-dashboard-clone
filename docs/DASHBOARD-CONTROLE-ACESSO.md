# Dashboard Empire — Controle de Acesso Multi-Usuário

| Campo | Valor |
|-------|-------|
| **Versão** | 1.4 |
| **Data** | 2026-07-09 |
| **Status** | Ativo |
| **Relacionado** | PRD-DASHBOARD-EMPIRE.md |

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Modelo de Workspace](#2-modelo-de-workspace)
3. [Modelo de Permissões de Módulo](#3-modelo-de-permissões-de-módulo)
4. [Sistema de Filtro de Leads](#4-sistema-de-filtro-de-leads)
5. [Modelo de Dados](#5-modelo-de-dados)
6. [Fluxo de Implementação](#6-fluxo-de-implementação)
7. [Exemplos Práticos](#7-exemplos-práticos)
8. [Considerações de Segurança](#8-considerações-de-segurança)

---

## 1. Visão Geral

O Dashboard Empire opera com **três camadas independentes de controle de acesso**, empilhadas sobre o sistema de autenticação do Supabase:

```
┌─────────────────────────────────────────────────────────────────┐
│  CAMADA 1: WORKSPACE (Isolamento de conta/empresa)              │
│  → Garante que usuário A nunca vê dados do usuário B            │
│  → Implementada via RLS no Supabase                             │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA 2: PERMISSÕES DE MÓDULO (O que o usuário pode acessar)  │
│  → Define quais módulos, abas e sub-abas são visíveis           │
│  → Granularidade: módulo / aba / sub-aba                        │
├─────────────────────────────────────────────────────────────────┤
│  CAMADA 3: FILTRO DE LEADS (Quais leads o usuário vê)           │
│  → Define regras de filtragem baseadas em campos do lead        │
│  → Aplica-se a todas as telas que exibem leads                  │
└─────────────────────────────────────────────────────────────────┘
```

### Quem controla cada camada

| Camada | Quem define | Onde se configura |
|--------|-------------|-------------------|
| Workspace | Automático (por login) | Supabase Auth |
| Permissões de Módulo | Admin/Owner do workspace | Painel de administração do dashboard (`/admin`) |
| Filtro de Leads | Admin/Owner do workspace | Painel de administração do dashboard (`/admin`) |

---

## 2. Modelo de Workspace

### Conceito

Um **workspace** representa uma conta ou empresa no sistema. Todo dado no banco está associado a um workspace. Usuários de workspaces diferentes nunca conseguem ver os dados uns dos outros — isso é garantido pelo Supabase RLS, não pelo código da aplicação.

### Papéis dentro do Workspace

| Papel | Descrição | Pode convidar membros? | Pode editar permissões? |
|-------|-----------|----------------------|------------------------|
| `owner` | Criador do workspace, controle total | Sim | Sim |
| `admin` | Administrador delegado | Sim | Sim |
| `member` | Usuário comum com permissões configuráveis | Não | Não |

### Fluxo de Convite

```
1. Admin acessa Administração → Usuários (`/admin/users`)
2. Admin insere e-mail do novo membro
3. Sistema envia convite por e-mail (link com token)
4. Novo membro clica no link e cria sua senha
5. Conta é criada como `member` com zero permissões por padrão
6. Admin configura permissões de módulo e filtros de leads para o novo membro
```

### Estrutura de Dados do Workspace

```
workspaces
├── id (UUID)
├── name (text) — Ex: "OMNX"
├── owner_id (UUID) — FK para auth.users
├── created_at
└── settings (JSONB) — configurações do workspace

workspace_members
├── id (UUID)
├── workspace_id (UUID) — FK para workspaces
├── user_id (UUID) — FK para auth.users
├── role (text) — 'owner' | 'admin' | 'member'
├── invited_by (UUID) — FK para auth.users
├── joined_at (TIMESTAMPTZ)
└── is_active (boolean)
```

### RLS — Row Level Security

Todas as tabelas de dados incluem um campo `workspace_id`. As políticas RLS do Supabase garantem:

```sql
-- Exemplo de política (apenas para documentação — não implementar aqui)
-- Usuário só vê registros do seu próprio workspace
USING (workspace_id IN (
  SELECT workspace_id FROM workspace_members
  WHERE user_id = auth.uid() AND is_active = true
))
```

Isso acontece automaticamente no banco — o código da aplicação não precisa filtrar manualmente por workspace_id em nenhuma query.

---

## 3. Modelo de Permissões de Módulo

### Chave de Módulo (Module Key)

Cada parte do sistema tem uma **chave única** em notação de pontos que identifica exatamente qual parte do aplicativo é acessível.

**Formato:** `[modulo].[aba].[sub_aba]`

### Árvore Completa de Chaves — V1

```
traqueamento
│
├── traqueamento.cods_utm
│   ├── traqueamento.cods_utm.slug_utm
│   ├── traqueamento.cods_utm.utm_source_ads
│   ├── traqueamento.cods_utm.utm_source_organico
│   ├── traqueamento.cods_utm.utm_campaign
│   ├── traqueamento.cods_utm.utm_medium
│   ├── traqueamento.cods_utm.utm_term
│   └── traqueamento.cods_utm.objetivo_ads
│
├── traqueamento.origem
│
├── traqueamento.processo_vendas
│
├── traqueamento.anuncios
│   ├── traqueamento.anuncios.campanhas
│   ├── traqueamento.anuncios.testes_criativos
│   ├── traqueamento.anuncios.catalogo_criativos
│   ├── traqueamento.anuncios.producao_notion
│   └── traqueamento.anuncios.producao_direta
│
├── traqueamento.organico
│   ├── traqueamento.organico.producao
│   └── traqueamento.organico.catalogo
│
└── traqueamento.funis
```

> **Para adicionar novos módulos:** Ver [DASHBOARD-MODULOS.md](DASHBOARD-MODULOS.md)

### Regras de Herança de Permissão

**Regra 1 — Herança Descendente:**
Ter permissão em um nó pai implica acesso a todos os filhos.

```
traqueamento → acesso a todas as 6 abas e todas as sub-abas
traqueamento.anuncios → acesso a todas as 5 sub-abas de Anúncios
traqueamento.cods_utm.slug_utm → acesso apenas à sub-aba Slug UTM
```

**Regra 2 — Permissão Mínima:**
Para acessar uma sub-aba, o usuário precisa ter permissão em pelo menos UM dos seguintes:
- A sub-aba específica (`traqueamento.cods_utm.slug_utm`)
- A aba pai (`traqueamento.cods_utm`)
- O módulo pai (`traqueamento`)

**Regra 3 — Visibilidade no Menu:**
- Módulos/abas sem permissão são **invisíveis** no menu (não desabilitados)
- Uma aba aparece no menu somente se o usuário tiver acesso a pelo menos uma de suas sub-abas
- Um módulo aparece no menu somente se o usuário tiver acesso a pelo menos uma de suas abas

**Regra 4 — Dois Tipos de Acesso:**

| Tipo | Descrição | can_view | can_edit |
|------|-----------|----------|----------|
| Somente leitura | Vê os dados mas não pode alterar | ✅ | ❌ |
| Leitura e escrita | Pode ver e editar | ✅ | ✅ |

### Algoritmo de Verificação de Permissão

```
função podeAcessar(user_id, module_key):

  // 1. Verificar se tem permissão exata
  se existe permissão para (user_id, module_key):
    retornar can_view da permissão

  // 2. Verificar se tem permissão no pai (herança)
  partes = module_key.split('.')
  para i de (len(partes)-1) até 1:
    chave_pai = partes[0..i].join('.')
    se existe permissão para (user_id, chave_pai):
      retornar can_view da permissão do pai

  // 3. Sem permissão
  retornar false
```

### Estrutura de Dados de Permissões

```
dashboard_user_permissions
├── id (UUID)
├── workspace_id (UUID) — FK para workspaces
├── user_id (UUID) — FK para auth.users (o membro)
├── module_key (text) — Ex: "traqueamento.cods_utm.slug_utm"
├── can_view (boolean) — padrão: true
├── can_edit (boolean) — padrão: false
├── granted_by (UUID) — FK para auth.users (quem concedeu)
├── created_at (TIMESTAMPTZ)
└── UNIQUE(workspace_id, user_id, module_key)
```

### Exemplos de Configuração de Permissão

**Vendedor (vê apenas Funis e Processo de Vendas):**
```
module_key: "traqueamento.funis"       → can_view: true, can_edit: false
module_key: "traqueamento.processo_vendas" → can_view: true, can_edit: false
```

**Analista de UTMs (vê e edita CODS UTM, vê tudo mais):**
```
module_key: "traqueamento"             → can_view: true, can_edit: false
module_key: "traqueamento.cods_utm"    → can_view: true, can_edit: true
```

**Gestor de Criativos (vê e edita apenas Anúncios e Orgânico):**
```
module_key: "traqueamento.anuncios"    → can_view: true, can_edit: true
module_key: "traqueamento.organico"    → can_view: true, can_edit: true
```

### ⚠️ Implementação Atual (2026-07-05): can_edit por Feature de Sub-App

O modelo `dashboard_user_permissions` (module_key hierárquico) acima descreve o desenho original e permanece como **fallback legado** para áreas ainda não migradas. Ele **não alimenta o AppHub**: marcar permissões na tela `/admin/users` > "Permissões" não faz apps aparecerem no hub de apps.

A fonte de verdade atual para apps modulares (Leads, Criativos, Traqueamento, Disparos etc.) é o par de tabelas:

- `app_feature_role_permissions(workspace_id, app_slug, feature_key, role, can_view, can_edit)`
- `app_feature_user_overrides(workspace_id, app_slug, feature_key, user_id, can_view, can_edit)`

Coluna `can_edit` adicionada em `supabase/migrations/20260705000008_app_feature_can_edit.sql`. Resolução em `eb-dash2/src/contexts/PermissionsContext.tsx`:

1. Owner/admin do workspace: sempre `can_view` e `can_edit` = `true`.
2. Override de usuário (`app_feature_user_overrides`) tem prioridade sobre permissão de papel.
3. Permissão de papel (`app_feature_role_permissions`) tem prioridade sobre o catálogo.
4. Fallback: `FEATURES_CATALOG[appSlug].find(f => f.key === featureKey).defaultEditRoles` (`eb-dash2/src/lib/apps/features.ts`).

`PermissionRoute` (App.tsx) nega acesso à rota inteira via `?tab=` quando a feature associada não passa em `hasFeaturePermission`; cada página (Leads, Criativos, Traqueamento) também filtra suas próprias abas por `hasFeaturePermission` e usa `hasFeatureEditPermission` para esconder/desabilitar botões de criar/editar/excluir.

### Correção 2026-07-09: UI de features passa a escrever `can_edit`

**Sintoma:** admin liberava uma feature editável (ex.: `traqueamento.cods-utm`) para um `member` em `/workspace/users/:id`, a aba aparecia, mas os botões de criar/editar ficavam desabilitados.

**Causa-raiz:** a UI de features (`FeatureRow` em `WorkspaceUserDetailPage.tsx`) e o hook `useAppFeaturePermissions.ts` liam e escreviam **apenas `can_view`**, nunca `can_edit`. Como a coluna `can_edit` tem `DEFAULT false`, todo override de feature criado pela UI nascia sem edição. Diagnóstico em produção confirmou: havia 9 overrides (todos de 1 usuário) e **zero** registros com `can_edit = true` em todo o sistema.

**Correção aplicada:**

1. `eb-dash2/src/hooks/useAppFeaturePermissions.ts` — queries e mutations passam a ler/escrever `can_edit` (tipo `FeaturePermissionValue = { canView; canEdit }`); adicionado `useDeleteAppFeatureUserOverride`.
2. `eb-dash2/src/pages/workspace/WorkspaceUserDetailPage.tsx` (`FeatureRow`) — cada feature agora tem dois toggles: **Ver** e **Editar**. O toggle **Editar** só aparece para features com `defaultEditRoles` no catálogo. Invariante garantida na UI: editar implica ver (ligar Editar força Ver; desligar Ver desliga Editar). Reset remove o override (volta ao papel/catálogo).
3. Resolução de precedência permanece: override de usuário → permissão de papel → `defaultRoles`/`defaultEditRoles` do catálogo. Owner/admin continuam sempre com `can_view` e `can_edit` = `true`.

**Dívida técnica resolvida em 2026-07-09:** os triggers de auditoria (`audit_app_feature_user_overrides` e similares, em `supabase/migrations/20260706160000_add_permission_audit_triggers.sql`) usam `COALESCE(granted_by, auth.uid())` e fazem fallback para `'00000000-0000-0000-0000-000000000000'` quando a operação não tem usuário autenticado (CLI/service role). Como a FK `permission_audit_log_performed_by_fkey` aponta para `auth.users(id)`, antes esse UUID inexistente quebrava qualquer escrita fora da UI. A correção (`supabase/migrations/20260709230000_seed_system_audit_user.sql`) criou um usuário técnico "sistema" com esse UUID (`system@empire.local`, sem senha, e-mail não confirmado, fora de qualquer workspace) — ele existe apenas como ator de auditoria. Resultado: operações pela UI continuam registradas com o autor humano; operações via CLI/service role passam a ser registradas como "sistema", com a FK satisfeita e a auditoria preservada. Validado em produção: UPDATE via CLI sem desabilitar o trigger passou a gerar linha em `permission_audit_log` com `performed_by = 00000000-0000-0000-0000-000000000000`.

---

## 4. Sistema de Filtro de Leads

### O que é

O **Filtro de Leads** define quais leads (contatos + oportunidades) um usuário específico consegue visualizar **em qualquer tela do sistema**. É aplicado automaticamente em todas as queries que retornam dados de leads.

### Quando se aplica

- Listas de contatos
- Listas de oportunidades
- Qualquer dashboard que exibe métricas de leads
- Qualquer módulo que lista leads (presente em módulos futuros como CRM)

O módulo TRAQUEAMENTO em si (configuração de UTMs) **não é afetado** pelo filtro de leads — ele apenas configura os parâmetros. O filtro se aplica quando esses parâmetros são usados para listar/analisar leads.

### Estrutura do Filtro (Schema JSON)

```json
{
  "logic": "AND",
  "rules": [
    {
      "table": "contatos",
      "field": "utm_source",
      "operator": "eq",
      "value": "iorg-2"
    },
    {
      "table": "oportunidades",
      "field": "vendedor_closer",
      "operator": "in",
      "value": ["João Silva", "Maria Santos"]
    }
  ]
}
```

### Campos Disponíveis para Filtro

#### Da tabela `contatos`

| Campo | Tipo | Exemplos de uso |
|-------|------|-----------------|
| `utm_source` | text | Filtrar por canal de origem |
| `utm_medium` | text | Filtrar por meio de veiculação |
| `utm_campaign` | text | Filtrar por campanha específica |
| `utm_term` | text | Filtrar por criativo/term |
| `utm_content` | text | Filtrar por conteúdo |
| `como_nos_conheceu` | text | Filtrar por canal declarado pelo lead |
| `ip` | text | Filtrar por IP de origem |

#### Da tabela `oportunidades`

| Campo | Tipo | Exemplos de uso |
|-------|------|-----------------|
| `vendedor_closer` | text | Filtrar leads do closer específico |
| `status` | text | Filtrar por status da oportunidade |
| `pipeline_id` | text | Filtrar por pipeline |
| `pipeline_stage_id` | text | Filtrar por etapa do pipeline |

### Operadores Disponíveis

| Operador | Símbolo SQL | Descrição | Exemplo |
|----------|-------------|-----------|---------|
| `eq` | `=` | Igual | `utm_source = "iorg-2"` |
| `neq` | `!=` | Diferente | `status != "perdida"` |
| `in` | `IN (...)` | Em lista | `utm_source IN ["iorg-1", "iorg-2"]` |
| `nin` | `NOT IN (...)` | Não em lista | `status NOT IN ["cancelada"]` |
| `contains` | `ILIKE '%x%'` | Contém texto (case-insensitive) | `nome CONTAINS "silva"` |
| `starts_with` | `ILIKE 'x%'` | Começa com | `email STARTS WITH "joao"` |
| `is_null` | `IS NULL` | Campo vazio/nulo | `utm_source IS NULL` |
| `is_not_null` | `IS NOT NULL` | Campo preenchido | `utm_source IS NOT NULL` |

### Lógica Composta

| Valor de `logic` | Comportamento |
|-----------------|---------------|
| `"AND"` | Todas as regras devem ser satisfeitas |
| `"OR"` | Pelo menos uma regra deve ser satisfeita |

### Estrutura de Dados de Filtros

```
dashboard_user_lead_filters
├── id (UUID)
├── workspace_id (UUID) — FK para workspaces
├── user_id (UUID) — FK para auth.users (o membro)
├── filter_name (text) — label opcional (ex: "Apenas leads do João")
├── logic (text) — 'AND' | 'OR'
├── rules (JSONB) — array de regras conforme schema acima
├── is_active (boolean) — se false, nenhum filtro é aplicado (usuário vê tudo)
├── created_by (UUID) — FK para auth.users (quem configurou)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)
```

**Nota:** Um usuário sem nenhum filtro configurado (`is_active = false` ou sem registro) vê todos os leads do workspace.

### Como o Filtro é Aplicado

O filtro **nunca é aplicado no frontend**. Ele é convertido em condições SQL e aplicado na query do servidor:

```
1. Frontend solicita lista de leads
2. API verifica se o usuário tem filtro ativo em dashboard_user_lead_filters
3. Se sim: converte rules JSON em cláusulas WHERE parametrizadas
4. Query executa com as condições combinadas ao RLS do workspace
5. Resultado retornado ao frontend — já filtrado
```

**Importante:** A conversão de JSON para SQL deve ser feita em uma função segura que:
- Apenas aceita campos pré-definidos no schema (whitelist de `table.field`)
- Nunca interpola valores diretamente na string SQL (usa parametrized queries)
- Valida o operador contra a lista permitida

---

## 5. Modelo de Dados Completo

### Diagrama de Relacionamentos

```
auth.users (Supabase)
    │
    ├─── workspaces (via owner_id)
    │       │
    │       └─── workspace_members (via workspace_id)
    │               │
    │               ├─── dashboard_user_permissions (via user_id + workspace_id)
    │               │
    │               └─── dashboard_user_lead_filters (via user_id + workspace_id)
    │
    └─── workspace_members (via user_id)
```

### Tabela: `workspaces`

| Campo | Tipo | Constraint | Descrição |
|-------|------|-----------|-----------|
| id | UUID | PK | Identificador único |
| name | text | NOT NULL | Nome do workspace |
| owner_id | UUID | FK auth.users | Dono do workspace |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Data de criação |
| settings | JSONB | DEFAULT '{}' | Configurações gerais |

### Tabela: `workspace_members`

| Campo | Tipo | Constraint | Descrição |
|-------|------|-----------|-----------|
| id | UUID | PK | Identificador único |
| workspace_id | UUID | FK workspaces | Workspace ao qual pertence |
| user_id | UUID | FK auth.users | Usuário membro |
| role | text | CHECK ('owner','admin','member') | Papel no workspace |
| invited_by | UUID | FK auth.users | Quem convidou |
| joined_at | TIMESTAMPTZ | | Data de adesão |
| is_active | boolean | DEFAULT true | Se o acesso está ativo |
| UNIQUE | | (workspace_id, user_id) | Um usuário por workspace |

### Tabela: `dashboard_user_permissions`

| Campo | Tipo | Constraint | Descrição |
|-------|------|-----------|-----------|
| id | UUID | PK | Identificador único |
| workspace_id | UUID | FK workspaces | Contexto do workspace |
| user_id | UUID | FK auth.users | Membro alvo |
| module_key | text | NOT NULL | Chave de módulo (ex: "traqueamento.funis") |
| can_view | boolean | DEFAULT true | Pode visualizar |
| can_edit | boolean | DEFAULT false | Pode editar |
| granted_by | UUID | FK auth.users | Quem concedeu a permissão |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| UNIQUE | | (workspace_id, user_id, module_key) | Uma permissão por chave por usuário |

### Tabela: `dashboard_user_lead_filters`

| Campo | Tipo | Constraint | Descrição |
|-------|------|-----------|-----------|
| id | UUID | PK | Identificador único |
| workspace_id | UUID | FK workspaces | Contexto do workspace |
| user_id | UUID | FK auth.users | Membro alvo |
| filter_name | text | | Label descritivo (opcional) |
| logic | text | CHECK ('AND','OR') | Operador lógico entre regras |
| rules | JSONB | NOT NULL | Array de regras de filtro |
| is_active | boolean | DEFAULT true | Se o filtro está ativo |
| created_by | UUID | FK auth.users | Quem configurou |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

---

## 6. Fluxo de Implementação

### Passo 1: Supabase Auth

Usar Supabase Auth nativo com:
- Login por e-mail + senha
- Magic link (opcional)
- Convite por e-mail

### Passo 2: RLS por Workspace

Todas as tabelas de dados devem ter:
1. Campo `workspace_id UUID NOT NULL`
2. Política RLS de leitura: `workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = true)`
3. Política RLS de escrita: mesma condição + verificar role (`admin` ou `owner`)

### Passo 3: Middleware de Permissão de Módulo

No Next.js, criar middleware que:
1. Lê o token JWT do usuário
2. Busca suas permissões em `dashboard_user_permissions`
3. Disponibiliza a árvore de permissões via Context (React)
4. Cada rota/componente consulta o context antes de renderizar

### Passo 4: Hook de Filtro de Leads

Criar hook `useLeadFilter()` que:
1. Busca as regras de filtro do usuário em `dashboard_user_lead_filters`
2. Exporta uma função `applyFilter(query)` que adiciona as cláusulas WHERE à query do Supabase
3. Qualquer query que lista leads chama `applyFilter()` antes de executar

### Passo 5: Componente de Verificação de Permissão

```
<PermissionGate moduleKey="traqueamento.cods_utm">
  <CodsUtmTab />
</PermissionGate>
```

O `PermissionGate` exibe `null` (invisível) se o usuário não tiver permissão. Nunca exibir mensagem "Acesso negado" — o item simplesmente não existe.

---

## 7. Exemplos Práticos

### Exemplo A: Configurar Vendedor (João)

**Cenário:** João é um closer que só precisa ver seus próprios leads.

**Configuração de Permissão:**
```
Módulos: nenhum (João não precisa configurar UTMs)
```

**Filtro de Leads:**
```json
{
  "filter_name": "Apenas leads do João",
  "logic": "AND",
  "rules": [
    {
      "table": "oportunidades",
      "field": "vendedor_closer",
      "operator": "eq",
      "value": "João Silva"
    }
  ]
}
```

**Resultado:** João entra no dashboard e vê apenas leads onde ele é o closer. Ele não vê nenhuma aba do módulo Traqueamento.

---

### Exemplo B: Configurar Analista de Tráfego (Carla)

**Cenário:** Carla gerencia as campanhas pagas e precisa ver e editar UTMs de anúncios.

**Configuração de Permissão:**
```
traqueamento.cods_utm → can_view: true, can_edit: true
traqueamento.anuncios → can_view: true, can_edit: true
traqueamento.origem   → can_view: true, can_edit: false
traqueamento.funis    → can_view: true, can_edit: false
```

**Filtro de Leads:** Nenhum (Carla vê todos os leads do workspace).

**Resultado:** Carla vê CODS UTM e Anúncios com botões de editar ativos. Vê Origem e Funis em modo leitura. Não vê as abas Processo de Vendas e Orgânico.

---

### Exemplo C: Configurar SDR (Ana) — Leads de Canal Específico

**Cenário:** Ana é responsável por leads do Instagram Orgânico.

**Configuração de Permissão:** Nenhuma (Ana não precisa configurar UTMs).

**Filtro de Leads:**
```json
{
  "filter_name": "Leads Instagram Orgânico",
  "logic": "AND",
  "rules": [
    {
      "table": "contatos",
      "field": "utm_source",
      "operator": "in",
      "value": ["iorg-1", "iorg-2", "iorg-3"]
    }
  ]
}
```

**Resultado:** Ana vê apenas leads cujo `utm_source` é um dos canais orgânicos do Instagram.

---

### Exemplo D: Admin com Acesso Total

**Cenário:** O owner do workspace tem acesso irrestrito.

**Configuração:** Owners e admins com role `owner` ou `admin` automaticamente têm `can_view: true` e `can_edit: true` em todos os módulos, sem precisar de registros em `dashboard_user_permissions`.

**Filtro de Leads:** Nenhum (vê todos os leads).

---

## 8. Considerações de Segurança

### Regra de Ouro: Nunca Confiar no Frontend

O frontend exibe ou oculta elementos com base nas permissões, mas **toda validação de permissão deve acontecer no servidor**:

1. **Permissões de módulo:** Verificar o JWT na API route antes de retornar dados de um módulo
2. **Filtro de leads:** Aplicar as condições no servidor (Supabase query), nunca no JavaScript do cliente
3. **RLS:** Configurado no Supabase, executa independentemente de qualquer código da aplicação

### Prevenção de SQL Injection no Filtro de Leads

O filtro de leads converte JSON em SQL dinamicamente. Para prevenir injeção:

1. **Whitelist de campos:** Manter lista estrita dos campos permitidos (`contatos.utm_source`, `oportunidades.vendedor_closer`, etc.). Qualquer campo não listado causa erro.
2. **Whitelist de operadores:** Apenas os 8 operadores definidos são aceitos.
3. **Parametrized queries:** Os valores sempre vão como parâmetros separados, nunca interpolados na string SQL.
4. **Validação de tipo:** Verificar que o valor é do tipo correto para o operador (string para `eq`, array para `in`, etc.)

### Auditoria de Permissões

Toda alteração de permissão deve ser logada:

```
permission_audit_log
├── id (UUID)
├── workspace_id (UUID)
├── action (text) — 'granted' | 'revoked' | 'updated'
├── target_user_id (UUID) — quem foi afetado
├── performed_by (UUID) — quem fez a mudança
├── module_key (text) — qual chave foi alterada
├── old_value (JSONB) — estado anterior
├── new_value (JSONB) — estado novo
└── created_at (TIMESTAMPTZ)
```

### Tokens e Sessões

- Tokens JWT do Supabase Auth com expiração padrão (1 hora com refresh automático)
- Refresh tokens com validade de 7 dias
- Logout revoga o refresh token no servidor
- Convites têm expiração de 48 horas — após isso, devem ser re-enviados

---

## Checklist de Implementação

### Antes do primeiro deploy

- [ ] Tabelas de controle criadas (`workspaces`, `workspace_members`, `dashboard_user_permissions`, `dashboard_user_lead_filters`)
- [ ] RLS configurado em todas as tabelas de dados com `workspace_id`
- [ ] Middleware de permissão de módulo implementado
- [ ] Hook `useLeadFilter()` implementado
- [ ] Componente `<PermissionGate>` implementado
- [ ] Função de whitelist de campos para filtro de leads documentada e testada
- [ ] Testes de isolamento de workspace (usuário A não vê dados do B)
- [ ] Testes de permissão (usuário sem permissão não consegue chamar endpoints protegidos)
- [ ] Teste de filtro de leads (filtro por vendedor retorna apenas leads corretos)

### Para cada novo módulo adicionado

- [ ] Chave de módulo registrada no catálogo em [DASHBOARD-MODULOS.md](DASHBOARD-MODULOS.md)
- [ ] Componente `<PermissionGate>` envolve o módulo/aba/sub-aba
- [ ] Queries de dados do módulo passam pelo `useLeadFilter()` se listarem leads
- [ ] Endpoint da API verifica permissão antes de retornar dados


---

## Módulo Usuários — Fluxo de Acesso GHL → Sistema

### Visão Geral

O módulo `/admin/users` (AdminUsersPage) é o ponto central para:
1. Definir **papéis no negócio** dos usuários GHL (multi-papel)
2. **Conceder acesso ao dashboard** via convite por email
3. Controlar **permissões de módulo** de cada membro

### Tabelas Envolvidas

```
ghl_users
  ├── papeis TEXT[]        — papéis no negócio (multi-valor)
  └── auth_user_id UUID    — FK → auth.users (null se sem acesso)

auth.users
  └── (gerenciado pelo Supabase Auth)

workspace_members
  ├── user_id UUID         — FK → auth.users
  ├── workspace_id UUID    — FK → workspaces
  ├── role TEXT            — 'owner' | 'admin' | 'member'
  └── is_active BOOLEAN

dashboard_user_permissions
  ├── user_id UUID
  ├── module_key TEXT      — ex: 'pre_vendas', 'traqueamento.organico'
  ├── can_view BOOLEAN
  └── can_edit BOOLEAN
```

### Fluxo: Convidar usuário GHL para o sistema

1. Admin abre aba "GHL — Time" em `/admin/users`
2. Seleciona papéis inline (PapelSelector, debounce 800ms → UPDATE ghl_users.papeis)
3. Clica "Conceder acesso" no dropdown → InviteUserDialog abre com email pré-preenchido
4. Dialog exibe permissões padrão baseadas em `PAPEL_CONFIG[papel].defaultPermissions`
5. Admin ajusta e clica "Enviar convite" → POST `/functions/v1/invite-user`
6. Edge function:
   - `inviteUserByEmail(email)` → cria auth.users (estado pendente)
   - Upsert em `workspace_members` com role escolhida
   - Insert em `dashboard_user_permissions` para módulos com can_view=true
   - UPDATE `ghl_users SET auth_user_id = new_user.id` WHERE id = ghlUserId
7. Usuário recebe email → clica link → define senha → acessa dashboard

### Fluxo: Revogar acesso

1. Admin clica "Revogar acesso" no dropdown do usuário GHL
2. Frontend: UPDATE workspace_members SET is_active = false + UPDATE ghl_users SET auth_user_id = null
3. Usuário perde acesso imediatamente (RLS usa is_active)

### Papéis e permissões padrão (PAPEL_CONFIG)

| Papel | defaultPermissions |
|-------|-------------------|
| `sdr` | `pre_vendas` |
| `closer` | `leads`, `dashboard.trafego` |
| `social_seller` | `traqueamento.organico` |
| `gestor` | `dashboard`, `leads`, `pre_vendas`, `traqueamento` |
| `sistema` | (nenhuma — acesso manual) |

> As defaultPermissions são apenas sugestão inicial. O admin pode sobrescrever qualquer checkbox no InviteUserDialog.

---

## 9. Unificação de Permissões e Workspace Isolation (Fase 2 — 2026-07-04)

### 9.1 Objetivo

Eliminar vazamentos cross-workspace no frontend e unificar o sistema de permissões legado (`dashboard_user_permissions.module_key`) com o novo modelo de sub-apps (`app_features` + `app_user_overrides`).

### 9.2 O que mudou

1. **Catálogo de features (`src/lib/apps/features.ts`)**
   - Cada sub-app/aba agora tem `featureKey`, `appSlug`, `defaultEditRoles` e `requiresEdit`.
   - Mapeamento legado (`leads`, `pre_vendas`, `traqueamento`, etc.) converte automaticamente para o novo modelo.

2. **Navegação (`src/lib/apps/navigation.ts`)**
   - Todos os itens de menu possuem `featureKey`.
   - Função `resolveModuleKey(moduleKey)` traduz chaves legadas (`dashboard.trafego`) para `appSlug/featureKey`.

3. **Contexto de permissões (`src/contexts/PermissionsContext.tsx`)**
   - `hasPermission(moduleKey)` usa `hasFeaturePermission(appSlug, featureKey)` quando há mapeamento.
   - Fallback legado mantido para áreas ainda não migradas.

4. **Sidebar (`src/components/layout/Sidebar.tsx`)**
   - Filtra itens pelo app ativo/permitido e pela feature permission.
   - Esconde apps inteiros quando o usuário não tem nenhuma feature permitida.

5. **Workspace isolation em queries frontend**
   - Todas as queries em tabelas de dados (`contatos`, `oportunidades`, `comunicacoes`, `vendas_fechamento`) e tabelas de configuração (`utm_sources`, `utm_sources_plain`, `utm_campaigns`, `utm_mediums`, `funnels`) agora filtram por `workspace_id`.
   - Para tabelas sem `workspace_id` direto (`oportunidades`, `comunicacoes`, `vendas_fechamento`), usa-se inner join com `contatos!inner(workspace_id)`.
   - Hooks revisados:
     - `useLeads`, `useAquisicao`, `useTrafego`, `usePreVendas`, `usePreVendasProducao`
     - `useProducao`, `useDiscagem`, `useLeadAtividades`
     - `useSDRProdutividade`, `useCloserProdutividade`, `useAuditoriaIA`
     - `LimpezaTab`

### 9.3 Regra de ouro

> **RLS protege no banco, mas o frontend também deve filtrar.** Nunca confie apenas no RLS para queries em massa — o frontend deve passar `workspace_id` explicitamente para evitar buscar dados de outros workspaces (performance + defesa em profundidade).

### 9.4 Padrão de query

```ts
const wid = await getWorkspaceId()
if (!wid) return // ou throw

// Tabela com workspace_id direto
supabase.from('contatos').select('...').eq('workspace_id', wid)

// Tabela relacionada a contatos (sem workspace_id próprio)
supabase
  .from('oportunidades')
  .select('..., contatos!inner(workspace_id)')
  .eq('contatos.workspace_id', wid)

// vendas_fechamento
supabase
  .from('vendas_fechamento')
  .select('..., oportunidades!inner(contato_id, contatos!inner(workspace_id))')
  .eq('oportunidades.contatos.workspace_id', wid)
```

### 9.5 Seletor de Workspace (Fase 2.3 — 2026-07-05)

Implementado em:
- `eb-dash2/src/lib/workspace.ts`
- `eb-dash2/src/components/layout/WorkspaceSelector.tsx`
- `eb-dash2/src/components/layout/DashboardLayout.tsx`

#### Como funciona

1. O workspace selecionado é persistido em `localStorage` (`eb:selected_workspace_id`).
2. `getWorkspaceId()` valida se o workspace selecionado ainda é um workspace ativo do usuário.
   - Se for, usa ele.
   - Se não for, limpa a seleção e cai no fallback do primeiro workspace ativo (ordem `joined_at`).
3. O componente `WorkspaceSelector` aparece no header quando o usuário pertence a **2 ou mais workspaces** — mas com o Single-Tenant Lock (`SINGLE_WORKSPACE_MODE=true`, ver `docs/SINGLE-TENANT-LOCK.md`) ligado, isso só vale para quem `resolveTenancyMode()` classifica como `'multi-tenant'` (owner/admin de agência, via `agency_members`, ou 2+ `workspace_members` ativos). O cliente comum (1 workspace, 0 agências) nunca vê o seletor, mesmo que tecnicamente pertença a 1 único workspace. **2026-07-14 (burn-in do 1º tenant):** antes desta correção, o lock escondia o seletor incondicionalmente mesmo para admin de agência — não havia caminho de UI para trocar de sub-conta.
4. Ao trocar de workspace, a página é recarregada (`window.location.href = '/'`) para garantir que todos os hooks e contextos reflitam o novo workspace.

#### APIs

```ts
// Lê/Grava a seleção no localStorage
getSelectedWorkspaceId(): string | null
setSelectedWorkspaceId(id: string | null): void
clearSelectedWorkspaceId(): void

// Lista workspaces ativos do usuário
listUserWorkspaces(): Promise<UserWorkspace[]>

// Valida se o usuário ainda é membro de um workspace
isWorkspaceMember(workspaceId: string): Promise<boolean>

// Resolve o workspace a ser usado (seleção → fallback)
getWorkspaceId(): Promise<string | null>
```

### 9.6 Pendências

- Fase 2.5: auditoria de permissões (`permission_audit_log` + middleware de log).
- Hooks restantes ainda não revisados individualmente devem seguir o mesmo padrão ao serem alterados.
