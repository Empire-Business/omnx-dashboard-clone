# Single-Tenant Lock — Uma Instância, Uma Empresa

> **Data:** 2026-07-08 15:14 BRT  
> **Status:** Implementado  
> **Decisão arquitetural:** cada instância Empire (Supabase + Vercel) atende **apenas um cliente/empresa**. A estrutura multitenancy continua existindo por baixo, mas é invisível para o usuário final.

---

## 1. Por que mantivemos a estrutura multitenancy

A base de dados e as edge functions ainda usam `workspaces`, `workspace_members`, `workspace_id` e RLS por workspace porque:

1. **Não precisamos refatorar o banco inteiro** — remover `workspace_id` de dezenas de tabelas, triggers, funções e edge functions seria arriscado e demorado.
2. **A RLS por workspace é uma proteção gratuita** — mesmo com um único workspace, o isolamento por `workspace_id` continua válido e seguro.
3. **Facilita a replicação** — o script `scripts/provision-new-client.ts` cria um novo projeto Supabase/Vercel com **um único workspace**; cada cliente fica isolado em sua própria instância.
4. **Porta de saída aberta** — se no futuro quisermos voltar a oferecer multi-workspace, a infraestrutura já está pronta.

---

## 2. O que mudou no frontend

### 2.1 Constante central

`eb-dash2/src/lib/workspace.ts`:

```ts
export const SINGLE_WORKSPACE_MODE = true
```

Quando `true`, o frontend assume que existe apenas um workspace por instância.

### 2.2 Componentes e textos ajustados

| Onde | Antes | Depois |
|------|-------|--------|
| `WorkspaceSelector.tsx` | Dropdown "Selecionar workspace" | **Não renderiza** no modo single-tenant |
| `WorkspaceLayout.tsx` sidebar | "Workspace / Administração" | "Empire / Administração" |
| `WorkspaceLayout.tsx` breadcrumb | "Workspace" | "Administração" |
| `AdminLayout.tsx` sidebar | "Workspace / Administração" | "Empire / Administração" |
| `AppHubPage.tsx` | "Apps do workspace", "configure seu workspace" | "Apps", "configure sua conta" |
| `WorkspaceAppsPage.tsx` | "Apps do Workspace", "neste workspace" | "Apps", frases genéricas |
| `WorkspaceUsersPage.tsx` | "Nenhum membro no workspace" | "Nenhum membro cadastrado" |
| `WorkspaceUserDetailPage.tsx` | "App desativado no workspace" | "App desativado" |
| `AdminPage.tsx` | "Central de gestão soberana do workspace" | "Central de gestão soberana da conta" |
| `AdminAppsPage.tsx` | "Apps do Workspace", "no workspace" | "Apps", frases genéricas |
| `AdminPermissionsPage.tsx` | "Acesso total ao workspace", "cada app do workspace" | "Acesso total ao sistema", "cada app" |
| `AdminUsersPage.tsx` | "Remover este membro do workspace?" | "Remover este membro?" |
| Mensagens de erro em hooks/páginas | "Workspace não encontrado" | "Conta não encontrada" |
| `LimpezaTab.tsx` | "no workspace atual" | "na conta atual" |
| `ConfiguracaoTab.tsx` (SDR IA) | "contatos do workspace" | "contatos" |

> **Nomes internos** (`workspace_id`, `WorkspaceApp`, `getWorkspaceId`, hooks `useWorkspace*`) foram preservados para não quebrar a tipagem e a lógica.

### 2.3 Rotas

As rotas `/workspace/*` e `/admin/*` continuam funcionando internamente. Não renomeamos as URLs para evitar um refactor grande no `App.tsx` e nos links. O importante é que **os textos visíveis não falam mais em workspace**.

---

## 3. O que não mudou

- **Banco de dados:** tabelas `workspaces`, `workspace_members`, `workspace_apps`, `app_feature_role_permissions`, `app_feature_user_overrides`, `ghl_integration_settings` e todas as tabelas com `workspace_id` permanecem iguais.
- **RLS:** todas as políticas por workspace continuam ativas.
- **Edge functions:** `workspace-apps`, `invite-user`, `setup-ghl-integration`, `discover-ghl-config`, `sync-ghl-users` continuam recebendo/resolvendo `workspace_id`.
- **Script de provisionamento:** `scripts/provision-new-client.ts` continua criando um workspace inicial via `create_workspace_with_owner`.

---

## 4. Como replicar para um novo cliente

A replicação segue o mesmo fluxo documentado em [`docs/REPLICACAO-TECNICA.md`](REPLICACAO-TECNICA.md) e [`docs/ONBOARDING-NOVO-CLIENTE.md`](ONBOARDING-NOVO-CLIENTE.md), com a mentalidade de **uma instância = uma empresa**:

1. Criar novo projeto Supabase.
2. Rodar `scripts/provision-new-client.ts` — ele cria **um único workspace**.
3. Deployar o mesmo frontend em um novo projeto Vercel.
4. Configurar `GHL_API_KEY`, `GHL_LOCATION_ID` e `WEBHOOK_SECRET` nas edge functions.
5. O usuário do cliente nunca vê a palavra "workspace" — para ele é só "sua conta Empire".

---

## 5. Cuidados e regras

1. **Nunca crie um segundo workspace na mesma instância** sem uma decisão explícita — o frontend não está preparado para mostrar seleção nem diferenciar tenants.
2. **Se precisar reverter para multi-workspace**, basta:
   - Voltar `SINGLE_WORKSPACE_MODE` para `false`.
   - Garantir que `WorkspaceSelector` renderize corretamente.
   - Revisar os textos que foram simplificados.
3. **Convites de usuários** continuam funcionando normalmente: todo usuário convidado é associado ao único workspace existente.
4. **Mensagens de erro** devem sempre usar "Conta" em vez de "Workspace" quando forem visíveis ao usuário.

---

## 6. Arquivos relacionados

- `eb-dash2/src/lib/workspace.ts` — constante `SINGLE_WORKSPACE_MODE` e helpers.
- `eb-dash2/src/components/layout/WorkspaceSelector.tsx` — esconde o seletor.
- `eb-dash2/src/components/layout/WorkspaceLayout.tsx` — labels do portal admin.
- `eb-dash2/src/components/layout/AdminLayout.tsx` — labels do admin legado.
- `eb-dash2/src/pages/AppHubPage.tsx` — textos do hub de apps.
- `eb-dash2/src/pages/workspace/*` — páginas de administração.
- `eb-dash2/src/pages/admin/*` — páginas de admin legado.
- `eb-dash2/src/hooks/useWorkspace*.ts` — hooks com mensagens de erro atualizadas.
- `docs/REPLICACAO-TECNICA.md` — arquitetura de replicação.
- `docs/ONBOARDING-NOVO-CLIENTE.md` — passo a passo de onboarding.

---

*Última atualização: 2026-07-08 15:14 BRT*
