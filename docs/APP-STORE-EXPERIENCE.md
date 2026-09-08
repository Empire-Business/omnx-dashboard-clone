# App Store Experience — Instalação de Apps

> Experiência de descoberta, instalação e primeiro acesso dos sub-apps do Empire.
> Atualizado em: 2026-07-08 15:30 BRT

---

## Visão geral

Os sub-apps do Empire passaram a ter uma experiência próxima de uma **App Store**. O usuário vê cards ricos com descrição, categoria, tags e badges, e pode "instalar" ou "remover" apps do seu workspace.

Na primeira vez que um owner/admin acessa o sistema e **nenhum app está ativo**, ele é conduzido por um onboarding visual para escolher os apps iniciais.

---

## Arquitetura

### Fonte de verdade

O catálogo de apps continua sendo `APP_CATALOG` em `eb-dash2/src/types/apps.ts`. Cada app agora carrega metadata:

```ts
export interface AppCatalogItem {
  slug: string
  label: string
  icon: string
  description: string
  category: 'vendas' | 'marketing' | 'operacao' | 'inteligencia' | 'comunicacao'
  badge?: 'novo' | 'beta' | 'popular' | null
  tags?: string[]
}
```

**Vantagem:** ao adicionar um novo app no `APP_CATALOG`, ele aparece automaticamente na App Store, no hub e no onboarding — sem alterar componentes.

---

## Fluxos de UX

### 1. Primeiro acesso — Onboarding de instalação

**Quando aparece:**
- Usuário é `owner` ou `admin`.
- Os apps já foram carregados (`loadingApps === false`).
- Nenhum app permitido está ativo (`activeApps.length === 0`).

**Comportamento:**
- A tela `FirstTimeAppSetup` substitui o `AppHubPage`.
- Mostra cards de todos os apps permitidos.
- Owner/admin clica em "Instalar" para ativar.
- Botão "Continuar" leva o usuário para o hub.

**Arquivo:** `eb-dash2/src/components/apps/FirstTimeAppSetup.tsx`

### 2. Hub de apps (`/`)

**Quando aparece:**
- Pelo menos um app está ativo.

**Comportamento:**
- Mostra apenas os apps ativos (`activeApps`).
- Card de "Configurações" leva para `/admin/apps` quando há apps não instalados.
- Se só existe um app ativo, redireciona automaticamente para ele.

**Arquivo:** `eb-dash2/src/pages/AppHubPage.tsx`

### 3. App Store (`/admin/apps`)

**Quando aparece:**
- Acesso restrito a owners e admins.

**Comportamento:**
- Mostra todos os apps do catálogo.
- Busca por nome, descrição, slug e tags.
- Botão "Instalar" / "Instalado".
- Switch para ativar/desativar rapidamente.
- Contador de apps instalados.

**Arquivo:** `eb-dash2/src/pages/admin/AdminAppsPage.tsx`

---

## Componentes

### `AppStoreCard`

Card reutilizável usado tanto na App Store quanto no onboarding.

**Props:**
- `app: AppCatalogItem`
- `isInstalled: boolean`
- `isAdmin: boolean`
- `isPending: boolean`
- `onToggle: (slug, next) => void`
- `variant: 'store' | 'launcher'`

**Recursos visuais:**
- Ícone com hover animado.
- Badge (`novo`, `beta`, `popular`).
- Categoria.
- Tags.
- Barra de destaque gradiente no hover.

**Arquivo:** `eb-dash2/src/components/apps/AppStoreCard.tsx`

---

## Como adicionar um novo app

1. **Adicione o app no catálogo:**

   ```ts
   // eb-dash2/src/types/apps.ts
   {
     slug: 'meu-novo-app',
     label: 'Meu Novo App',
     icon: 'star',
     description: 'O que esse app faz em uma linha.',
     category: 'operacao',
     badge: 'novo',
     tags: ['tag1', 'tag2'],
   }
   ```

2. **Adicione o ícone em `ICON_MAP`:**

   ```ts
   // eb-dash2/src/lib/apps/constants.ts
   import { Star } from 'lucide-react'

   export const ICON_MAP: Record<string, LucideIcon> = {
     // ...
     star: Star,
   }
   ```

3. **Adicione a rota padrão em `APP_ROUTE`:**

   ```ts
   // eb-dash2/src/lib/apps/constants.ts
   export const APP_ROUTE: Record<string, string> = {
     // ...
     'meu-novo-app': '/meu-novo-app',
   }
   ```

4. **Registre a rota no `App.tsx`** (se necessário) e adicione permissões/features no `FEATURES_CATALOG`.

5. **Pronto.** O app aparece automaticamente na App Store, no onboarding e no hub.

---

## Segurança e permissões

- A ativação física dos apps continua em `workspace_apps.is_active`.
- Apenas `owner`/`admin` pode instalar/remover apps.
- A permissão de visualização continua sendo controlada por `app_role_permissions` e `app_user_overrides`.
- O onboarding só aparece para quem tem poder de instalar apps.

---

## Arquivos alterados/criados

- `eb-dash2/src/types/apps.ts` — metadata no catálogo.
- `eb-dash2/src/components/apps/AppStoreCard.tsx` — novo componente.
- `eb-dash2/src/components/apps/FirstTimeAppSetup.tsx` — novo componente.
- `eb-dash2/src/pages/AppHubPage.tsx` — hub com novo visual e onboarding.
- `eb-dash2/src/pages/admin/AdminAppsPage.tsx` — App Store.
- `docs/APP-STORE-EXPERIENCE.md` — este documento.
- `docs/SUB-APPS-MODULARES.md` — atualizado.
- `CLAUDE.md` — índice atualizado.

---

*Última atualização: 2026-07-08 15:30 BRT.*
