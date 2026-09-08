# Frontend — eb-dash2

> Design System: [`design-system.md`](design-system.md)
> Módulos/Tabs: [`DASHBOARD-MODULOS.md`](DASHBOARD-MODULOS.md)
> Controle de Acesso: [`DASHBOARD-CONTROLE-ACESSO.md`](DASHBOARD-CONTROLE-ACESSO.md)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Framework | Vite + React 18 + TypeScript (strict, verbatimModuleSyntax) |
| Roteamento | React Router v7 |
| Dados | TanStack Query v5 + Supabase JS client |
| Estilo | Tailwind v3 + DS1 Silver Empire v2.0 |
| Componentes | shadcn-compatible em `src/components/ui/` (sem radix-ui — custom) |
| Toasts | Sonner |
| Porta dev | 3222 (`npm run dev`) |

---

## DS1 Silver Empire v2.0

Filosofia **light mode editorial**: bone (#F2EFE8) no conteúdo, empire (#0D1829) na sidebar, branco nos cards, dark no login.

### Tokens CSS

| Token | Valor | Uso |
|-------|-------|-----|
| `--bone` | `#F2EFE8` | Fundo do conteúdo principal |
| `--empire` | `#0D1829` | Sidebar, botões primários |
| `--gold` | `#C9A240` | Acentos, `.section-label`, destaques |
| `--ink` | `#1A1F2E` | Texto principal |
| `--ghost` | `#E4E2DC` | Bordas, separadores |
| `--mist` | `#F7F6F2` | Fundos secundários |
| `--steel` | `#243B55` | Elementos intermediários |
| `--platinum` | `#BFC5CC` | Texto secundário |
| `--danger` | `#8B2E2E` | Erros, alertas críticos |

**Radius:** radius-sm/md/lg = 3/6/12px
**Shadow:** shadow-sm/md/lg/xl (ink-tinted)

### Shadcn HSL

```css
--background: 47 37% 93%;    /* bone */
--primary: 218 52% 11%;      /* empire */
--border: 40 17% 90%;        /* ghost */
--sidebar-background: 218 52% 11%; /* empire */
```

### Tipografia

| Fonte | Uso |
|-------|-----|
| Cormorant Garamond | Display, títulos |
| DM Sans | Body, textos corridos |
| IBM Plex Mono | Labels mono, `.section-label` |

### Classes especiais

**`.section-label`:** font-mono 11px gold uppercase tracking-[0.18em], linha gold 24px antes

**Login:** dark-context class, empire bg, dark-glass card, inputs rgba white

**Film grain:** `body::before` fractalNoise SVG 128px tile, opacity 0.025

---

## Padrões de código

- Usar `import type { X }` para tipos (verbatimModuleSyntax)
- Tab navigation via URL search params `?tab=nome&sub=subtab` (replace, não push)
- Auth: Supabase email+password, `useAuth()` de `AuthContext`
- `DropdownMenuItem` não suporta `disabled` prop nem `asChild` — usar div customizada
- Sem radix-ui — componentes shadcn são implementações custom pure-React

### Padrão: Acordeão (Dropdown colapsável)

Usado em seções com múltiplas categorias que podem estar recolhidas para melhor UX (ex: `LeadsParadosTab`).

**Estrutura:**
```tsx
const [open, setOpen] = useState(true) // começa expandido

// Cabeçalho clicável com ChevronDown rotacionado
<div onClick={() => setOpen(o => !o)} className="cursor-pointer select-none hover:bg-[var(--mist)]">
  <ChevronDown className={cn('h-4 w-4 transition-transform', !open && '-rotate-90')} />
  <h3>Título</h3>
  <Badge>{count}</Badge>
</div>

// Conteúdo condicional
{open && (
  <>
    {/* tabela, lista ou outro conteúdo */}
  </>
)}
```

**Pontos-chave:**
- ChevronDown sempre à esquerda (à menos que haja botão IA — então ChevronDown vem antes)
- `ml-auto` no chevron se à direita (com `justify-between` ou `flex-row-reverse`)
- Estados de loading (Skeletons) só aparecem se `open`
- Hover no cabeçalho: `hover:bg-[var(--mist)] transition-colors`
- Rotação: `-rotate-90` quando recolhido

### Padrão: Componentes Portalizados (Drawers, Modals)

Usado em drawers laterais e modals que precisam escapar de stacking contexts (quando `fixed` positioning é quebrado por ancestrais com `transform`, `filter`, etc.).

**Por que usar `createPortal`:**
- `fixed` positioning é relativo ao **primeiro ancestral com transform/filter/will-change**, não ao viewport
- Se o drawer renderiza dentro de um componente com `transform`, fica "preso" a esse ancestral
- Solução: renderizar **diretamente no `document.body`** via `createPortal`

**Estrutura (LeadCard exemplo):**
```tsx
import { createPortal } from 'react-dom'

export function LeadCard({ oppId, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ... resto do código

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 backdrop-blur-sm ..."
        onClick={onClose}
      />

      {/* Drawer com width dinâmica */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 h-screen flex flex-col',
          'transition-[transform,width] ease-out',
          isFullscreen ? 'w-screen' : 'w-[520px] max-w-full',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header com botão fullscreen */}
        <button
          onClick={() => setIsFullscreen(f => !f)}
          title={isFullscreen ? 'Reduzir' : 'Tela cheia'}
        >
          {isFullscreen ? <Minimize2 /> : <Maximize2 />}
        </button>

        {/* Content */}
      </aside>
    </>,
    document.body // Renderiza diretamente no body, escapando de stacking contexts
  )
}
```

**Pontos-chave:**
- `createPortal(jsx, document.body)` — renderiza fora da árvore do DOM do componente pai
- `fixed` funciona sempre relativo ao viewport (não ao ancestral)
- Width dinâmica: `isFullscreen ? 'w-screen' : 'w-[size]'`
- Transição suave: `transition-[transform,width]` (suporta múltiplas propriedades)
- Resetar estado ao fechar: `setIsFullscreen(false)` no `useEffect` quando `oppId` é `null`
- Z-indexes: backdrop `z-40`, drawer `z-50` (drawer sempre acima)
- Exemplo: `eb-dash2/src/components/leads/LeadCard.tsx`

---

## Estrutura de arquivos

```
src/
├── components/
│   ├── auth/AuthGuard.tsx          -- AuthGuard + GuestGuard
│   ├── layout/
│   │   ├── Sidebar.tsx             -- collapsible sidebar, nav, user menu
│   │   └── DashboardLayout.tsx     -- layout wrapper com breadcrumb
│   └── ui/                         -- button, input, label, card, badge,
│                                       separator, skeleton, avatar, tabs,
│                                       dropdown-menu
├── contexts/AuthContext.tsx         -- Supabase Auth context + useAuth hook
├── pages/
│   ├── LoginPage.tsx
│   ├── dashboard/                  -- tabs do dashboard principal
│   ├── pre-vendas/                 -- tabs de pré-vendas
│   ├── settings/                   -- UsersPage e outras settings
│   └── traqueamento/               -- TraqueamentoPage + tabs
├── types/users.ts                   -- ModulePermission, MODULE_TREE, hasModulePermission
├── hooks/                           -- useTrafego, usePreVendas, useCohort, etc.
└── lib/
    ├── supabase.ts
    └── utils.ts
```

---

## Controle de acesso (3 camadas)

1. **Workspace** — `workspaces` + `workspace_members` (multi-tenancy, RLS)
2. **Permissões por módulo** — `dashboard_user_permissions` (quais tabs o usuário vê)
3. **Filtros de lead** — `dashboard_user_lead_filters` (quais leads o usuário acessa)

Ver detalhes completos em [`DASHBOARD-CONTROLE-ACESSO.md`](DASHBOARD-CONTROLE-ACESSO.md).

---

## Módulos implementados

| Módulo | Rota | Tabs |
|--------|------|------|
| Traqueamento | `/traqueamento` | cods_utm, origem, processo_vendas, anuncios, organico, funis |
| Pré-Vendas | `/pre-vendas` | geral, sdrs, leads_parados |
| Dashboard | `/dashboard` | trafego, (outros) |
| Settings / Usuários | `/settings/users` | ghl, sistema |

Ver catálogo completo em [`DASHBOARD-MODULOS.md`](DASHBOARD-MODULOS.md).

### Pré-Vendas: Visão Geral — Filtro de SDR Oficial

**Comportamento:** A aba "Visão Geral" (`GeralTab`) mostra **apenas leads atribuídos a SDRs oficiais** (`ghl_users.papeis` contém `'sdr'`).

**Consistência:** Visão Geral e aba SDRs filtram pelos mesmos SDRs (ambas consultam `ghl_users`). Garante dados unificados.

**Implementação:**
```typescript
const [sdrNames, setSdrNames] = useState<Set<string>>(new Set())

useEffect(() => {
  supabase.from('ghl_users').select('nome').contains('papeis', ['sdr'])
    .then(({ data }) => {
      setSdrNames(new Set((data ?? []).map((u) => u.nome).filter(Boolean)))
    })
}, [])

const oppsComSdr = useMemo(() =>
  opps.filter((o) => sdrNames.has(o.contatos?.owner_name ?? '')),
  [opps, sdrNames]
)
```

**Arquivo:** `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`
