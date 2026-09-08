# Sub-apps Modulares

> Fundação de backend e reorganização frontend para ativação de sub-apps por workspace.
> Branch: `feat/sub-apps-modulares`
> Criado em: 2026-06-26 12:13 BRT
> Atualizado em: 2026-07-08 15:30 BRT

---

## Visão geral

O dashboard Empire está sendo refactorado para expor funcionalidades como **sub-apps independentes** que podem ser ativados/desativados por workspace. Cada app tem:

- Controle de ativação no workspace (`workspace_apps.is_active`).
- Permissões por role (`app_role_permissions.can_view`).
- Overrides por usuário (`app_user_overrides.can_view`), que vencem as permissões de role.

A camada de backend foi criada na Fase 1. A integração com o frontend (sidebar dinâmica, rotas guardadas, etc.) foi feita na Fase 2. A reorganização das funcionalidades existentes para os sub-apps foi feita na Fase 3.

---

## Tabelas

### `workspace_apps`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `workspace_id` | uuid FK → workspaces(id) | Workspace dono do app |
| `app_slug` | text | Slug canônico do app |
| `is_active` | boolean | App está ativo no workspace |
| `settings` | jsonb | Configurações específicas do app |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Última atualização |

Índice: `idx_workspace_apps_workspace_slug` em `(workspace_id, app_slug)`.

### `app_role_permissions`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `workspace_id` | uuid FK → workspaces(id) | Workspace |
| `app_slug` | text | Slug do app |
| `role` | text | Role do workspace (`owner`, `admin`, `member`, etc.) |
| `can_view` | boolean | Pode visualizar o app |
| `created_at` | timestamptz | Criação |

Índice: `idx_app_role_permissions_lookup` em `(workspace_id, app_slug, role)`.

### `app_user_overrides`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | Identificador único |
| `workspace_id` | uuid FK → workspaces(id) | Workspace |
| `app_slug` | text | Slug do app |
| `user_id` | uuid FK → auth.users(id) | Usuário |
| `can_view` | boolean | Override explícito |
| `granted_by` | uuid FK → auth.users(id) | Quem concedeu o override |
| `created_at` | timestamptz | Criação |
| `updated_at` | timestamptz | Última atualização |

Índice: `idx_app_user_overrides_lookup` em `(workspace_id, app_slug, user_id)`.

---

## Segurança

- RLS ativado em todas as tabelas.
- Apenas membros autenticados do workspace podem ler.
- Apenas `owner`/`admin` podem inserir, atualizar ou deletar.
- `service_role` mantém acesso total para scripts e edge functions internas.

---

## Apps catalogados

| Slug | Label | Ícone | Categoria | Badge |
|------|-------|-------|-----------|-------|
| `aquisicao-vendas` | Aquisição & Vendas | `shopping-cart` | Vendas | popular |
| `traqueamento` | Traqueamento | `radar` | Marketing | — |
| `trafego` | Tráfego | `trending-up` | Marketing | — |
| `pre-vendas` | Pré-Vendas | `message-circle` | Operação | — |
| `recuperacao` | Recuperação | `rotate-ccw` | Operação | — |
| `relatorios` | Relatórios | `bar-chart-2` | Inteligência | — |
| `sdr-ia` | SDR IA | `bot` | Inteligência | beta |
| `metas` | Metas | `target` | Inteligência | — |
| `leads` | Leads | `users` | Operação | — |
| `criativos` | Criativos | `palette` | Marketing | novo |
| `disparos` | Disparos | `send` | Comunicação | — |

---

## Edge Function: `workspace-apps`

- **Caminho:** `supabase/functions/workspace-apps/index.ts`
- **Config:** `verify_jwt = false` no `config.toml` (a validação é feita dentro da função).
- **Método:** `POST`
- **Headers:**
  - `Authorization: Bearer <jwt>`
  - `x-workspace-id` (obrigatório)

### Resposta

```ts
{
  apps: Array<{
    slug: string
    label: string
    icon: string
    is_active: boolean
    allowed: boolean
  }>
}
```

### Lógica de permissão

1. Valida o JWT e extrai `user_id`.
2. `x-workspace-id` é obrigatório; verifica se o usuário é membro ativo do workspace.
3. Busca a role do usuário em `workspace_members`.
4. Se role for `owner` ou `admin`: todos os apps ativos são `allowed = true`.
5. Para outros roles:
   - Busca permissão default da role em `app_role_permissions`.
   - Busca override do usuário em `app_user_overrides`.
   - Override vence.
6. Retorna todos os apps do catálogo com `is_active` e `allowed`.

---

## Seed

A migration inclui um seed que, para cada workspace existente:

1. Ativa todos os apps do catálogo.
2. Concede `can_view = true` para roles `owner`, `admin` e `member` em cada app.

Novos workspaces recebem o seed automaticamente via trigger `trg_new_workspace_setup_apps`.

### ⚠️ Corrigido: workspaces antigos sem permissão `member`

**Problema:** a migration original (`20260626151259_sub_apps_foundation.sql`) só criou permissões para `owner` e `admin`. A migration `20260705000009_seed_new_workspaces.sql` passou a incluir `member`, mas o backfill só rodou para workspaces que ainda não tinham nenhum `workspace_apps` configurado. Workspaces criados entre essas duas datas ficaram sem `app_role_permissions.role = 'member'`.

**Sintoma:** usuários `member` desses workspaces viam a mensagem **"Nenhum app disponível"** no AppHub, mesmo quando o admin já tinha "liberado apps" por outras telas.

**Correção:** migration `20260709160000_backfill_member_app_permissions.sql` insere `can_view = true` para `member` em todos os apps ativos dos workspaces antigos. É idempotente e pode ser reaplicada sem risco.

```sql
INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
SELECT DISTINCT wa.workspace_id, wa.app_slug, 'member', true
FROM workspace_apps wa
WHERE wa.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM app_role_permissions arp
    WHERE arp.workspace_id = wa.workspace_id
      AND arp.app_slug = wa.app_slug
      AND arp.role = 'member'
  )
ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;
```

## Como liberar apps para um usuário

O AppHub considera apenas as tabelas do modelo de sub-apps. **A tela `/admin/users` > "Permissões" (que grava em `dashboard_user_permissions`) não afeta a lista de apps do AppHub** — ela controla permissões legadas de módulos e será descontinuada.

Para liberar ou restringir apps por usuário, use as telas corretas:

| Ação | Tela | Tabela afetada |
|------|------|----------------|
| Ativar/desativar um app para o workspace inteiro | `/admin/apps` | `workspace_apps.is_active` |
| Definir permissão default por papel (ex: todos os `member` veem X) | `/admin/permissions` > aba "Papéis" | `app_role_permissions` |
| Liberar/restringir apps para um usuário específico | `/admin/permissions` > aba "Usuários" (ou `/workspace/users/:userId`) | `app_user_overrides` |

### Regra de resolução

Para um usuário `member`:

1. O app precisa estar ativo no workspace (`workspace_apps.is_active = true`).
2. Se existir um override pessoal (`app_user_overrides.can_view`), ele vence.
3. Se não houver override, vale a permissão do papel (`app_role_permissions.can_view`).
4. Se não houver permissão de papel, o app não aparece.

Para `owner` e `admin`, todos os apps ativos são permitidos automaticamente.

---

## Arquivos

- `supabase/migrations/20260626151259_sub_apps_foundation.sql`
- `supabase/migrations/20260626180000_add_app_slug_to_goal_definitions.sql`
- `supabase/functions/workspace-apps/index.ts`
- `supabase/config.toml` (`[functions.workspace-apps]`)
- `eb-dash2/src/contexts/PermissionsContext.tsx`
- `eb-dash2/src/pages/AppHubPage.tsx`
- `eb-dash2/src/App.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `eb-dash2/src/pages/sdr-ia/SdrIaPage.tsx`
- `eb-dash2/src/pages/sdr-ia/components/AuditoriaIaPanel.tsx`
- `eb-dash2/src/pages/goals/GoalsPage.tsx`
- `eb-dash2/src/components/goals/GoalEditorDialog.tsx`
- `eb-dash2/src/lib/goals/types.ts`
- `eb-dash2/src/lib/goals/catalog.ts`
- `eb-dash2/src/lib/goals/service.ts`
- `docs/SUB-APPS-MODULARES.md`
- `eb-dash2/src/components/ui/switch.tsx`
- `eb-dash2/src/hooks/useWorkspaceApps.ts`
- `eb-dash2/src/hooks/useAppRolePermissions.ts`
- `eb-dash2/src/hooks/useAppUserOverrides.ts`
- `eb-dash2/src/hooks/useWorkspaceMembers.ts`
- `eb-dash2/src/pages/admin/AdminAppsPage.tsx`
- `eb-dash2/src/pages/admin/AdminPermissionsPage.tsx`
- `eb-dash2/src/pages/admin/AdminUsersPage.tsx`
- `eb-dash2/src/pages/admin/AdminPage.tsx`
- `eb-dash2/src/pages/admin/AdminRoute.tsx`
- `eb-dash2/src/components/layout/AdminMenu.tsx`

---

## Fase 4 — Administração Soberana de Apps e Permissões (concluída)

- **Camada `/admin`** — administração global do workspace, acessível por ícone de engrenagem fixo no header.
- **Tela `/admin/apps`** — gestão de ativação dos apps do catálogo por workspace (`workspace_apps.is_active`).
- **Tela `/admin/permissions`** — permissões por papel (`app_role_permissions.can_view`) e overrides por usuário (`app_user_overrides.can_view`).
- **Tela `/admin/users`** — gerenciamento de membros, convites e papéis do workspace.
- **Rotas antigas redirecionadas** — `/settings`, `/settings/users`, `/settings/apps` e `/settings/apps/permissions` redirecionam para `/admin*` com aviso informativo.
- **Rotas e navegação** — adicionadas em `App.tsx` e no header do `DashboardLayout` via `AdminMenu`; removidas da sidebar.
- **Hooks utilitários** — TanStack Query para cache e mutations das três tabelas + lista de membros.
- **Componente `Switch`** — criado em `src/components/ui/switch.tsx` (não existia no projeto).
- **Acesso restrito** — owner/admin acessam; demais são redirecionados para `/`.
- **Integração com catálogo** — `APP_CATALOG` centralizado em `src/types/apps.ts`.

---

## Fase 2 — Integração Frontend (concluída)

- `PermissionsContext` consome a edge function `workspace-apps` e expõe `apps`/`loadingApps`.
- `AppHubPage` exibe cards dos apps permitidos e redireciona automaticamente quando há apenas um app.
- Seletor de apps no header do `DashboardLayout`.
- `Sidebar` linka logo para `/` (hub) e continua listando os módulos.
- `App.tsx` adiciona `PermissionRoute` com verificação de app ativo/permitido.

## Fase 3 — Reorganização de Funcionalidades (concluída)

- App **SDR IA** (`/sdr-ia`) criado com a aba Auditoria IA como página independente.
- Painel `AuditoriaIaPanel` reutilizado em `/sdr-ia` e em `/pre-vendas?tab=auditoria_ia` (compatibilidade).
- App **Metas** ganhou campo opcional `app_slug` em `goal_definitions` para vincular metas a apps.
- Filtro e exibição de app vinculado na página de metas.

---

## Fase 5 — App Store Experience (concluída)

A experiência de ativação de apps foi redesenhada para parecer uma App Store:

- **Catálogo enriquecido** — cada app possui `description`, `category`, `badge` e `tags` em `APP_CATALOG`.
- **App Store** — `/admin/apps` exibe cards ricos com busca, badges e botão "Instalar".
- **Onboarding de primeiro acesso** — quando nenhum app está ativo, owners/admins veem `FirstTimeAppSetup` para escolher os apps iniciais.
- **Hub atualizado** — `/` mostra apenas apps ativos e sugere instalar mais apps quando aplicável.
- **Adição de novos apps simplificada** — basta adicionar o app em `APP_CATALOG`, `ICON_MAP` e `APP_ROUTE`.

Ver documentação completa em [`docs/APP-STORE-EXPERIENCE.md`](APP-STORE-EXPERIENCE.md).

---

## Próximos passos (Fase 6+)

- Persistir app ativo no `workspace_apps.settings` e usar em mais lugares (ex: breadcrumb, relatórios).
- Revisar se outras funcionalidades transversais (ex: Leads) precisam ser expostas como apps separados.
- Adicionar testes unitários para os hooks de admin de apps.
