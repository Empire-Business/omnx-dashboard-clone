# Arquitetura de Navegação do Empire

> Decisão do Conselho dos Mestres — 26 de junho de 2026
> Aplicação: `eb-dash2`

---

## Regra de ouro

**Se uma configuração afeta mais de um app, ela não mora dentro de nenhum app.**

Configurações globais — usuários, apps, permissões, conta/tenant — vivem em uma camada de administração soberana, acessível de qualquer ponto do dashboard pelo header. Cada app cuida apenas do seu próprio território operacional.

---

## Hierarquia visual

```
┌─────────────────────────────────────────┐
│  CAMADA 1: CONTA / ADMINISTRAÇÃO        │
│  → Ícone de engrenagem no header        │
│  → /admin, /admin/users, /admin/apps,   │
│    /admin/permissions                   │
├─────────────────────────────────────────┤
│  CAMADA 2: APPHUB / SELETOR DE APPS     │
│  → Logo Empire (link para /)            │
│  → AppHub na raiz                       │
│  → Seletor de apps no header            │
├─────────────────────────────────────────┤
│  CAMADA 3: CONTEXTO OPERACIONAL DO APP  │
│  → Sidebar com módulos do app atual     │
│  → Configurações contextuais (filtros,  │
│    colunas, pipeline, regras)           │
└─────────────────────────────────────────┘
```

---

## O que mudou

### Antes

- Configurações globais ficavam em `/settings`, dentro de um app específico.
- A sidebar tinha um grupo "Sistema" com "Configurações" → Usuários, Apps, Permissões.
- Usuários precisavam lembrar que gerenciar apps era "lá embaixo" no menu.

### Depois

- Configurações globais foram para `/admin`.
- Ícone de engrenagem fixo no header, visível em qualquer app para admin/owner.
- A sidebar contém apenas navegação operacional do app selecionado.
- Rotas antigas `/settings*` redirecionam para `/admin*` com aviso.

---

## Rotas

| Rota | Descrição | Proteção |
|------|-----------|----------|
| `/admin` | Hub de administração | `AdminRoute` (owner/admin) |
| `/admin/users` | Membros e convites | `AdminRoute` |
| `/admin/apps` | Ativar/desativar apps | `AdminRoute` |
| `/admin/permissions` | Permissões por papel e usuário | `AdminRoute` |
| `/settings` | Redirect → `/admin` | — |
| `/settings/users` | Redirect → `/admin/users` | — |
| `/settings/apps` | Redirect → `/admin/apps` | — |
| `/settings/apps/permissions` | Redirect → `/admin/permissions` | — |

---

## Componentes envolvidos

- `src/components/layout/AdminMenu.tsx` — dropdown do header.
- `src/components/layout/DashboardLayout.tsx` — header com ícone de engrenagem.
- `src/components/layout/Sidebar.tsx` — navegação operacional do app.
- `src/pages/admin/AdminPage.tsx` — hub.
- `src/pages/admin/AdminUsersPage.tsx` — usuários.
- `src/pages/admin/AdminAppsPage.tsx` — apps.
- `src/pages/admin/AdminPermissionsPage.tsx` — permissões.
- `src/pages/admin/AdminRoute.tsx` — proteção de rota.
- `src/pages/admin/AdminRedirect.tsx` — redirecionamento com toast.

---

## Testes

- `tests/admin-nav.spec.ts` — testes Playwright de navegação admin e redirects.
- Build, testes unitários e lint devem passar sem introduzir novos erros.

---

## Próximos passos

- Adicionar testes para usuário non-admin sendo redirecionado de `/admin`.
- Medir tempo e cliques até as telas de admin com usuários reais.
- Documentar novos módulos seguindo esta hierarquia.
