# Plano de Ação — Visibilidade do Admin no Acelerador de Audiência

**Presidente:** Steve Jobs
**Data:** 2026-06-27
**Tema:** Tornar o painel de administração de apps descobrível em < 5 segundos por qualquer admin

---

## 1. Visão da Decisão

A decisão do presidente Jobs foi cirúrgica: dois pontos de entrada, nada mais. Um ícone de engrenagem com label "Admin" no header global (visível em qualquer tela para admins/owners), e um card de configuração no AppHub para o primeiro acesso. A sidebar permanece operacional e limpa — sem contaminação de links de governança no espaço de trabalho dos SDRs.

A causa raiz do problema era arrogância de produto: a funcionalidade foi construída e assumiu-se que o usuário descobriria. O `AdminMenu` existente usa ícone de usuário sem label — um ícone ambíguo que não comunica administração. A correção é mínima em código e máxima em impacto de usabilidade.

A regra de ouro: contextos separados não se misturam. Header = governança global. Sidebar = contexto operacional do app. AppHub = ponto de entrada neutro. Cada elemento tem sua responsabilidade. Essa separação é o que Jobs chama de "integridade do produto."

---

## 2. Objetivos

**Macro:** Qualquer admin/owner encontra o painel de controle de apps em < 5 segundos a partir de qualquer tela, sem instrução prévia.

| Horizonte | Objetivo | Métrica |
|-----------|----------|---------|
| **7 dias** | Ícone de engrenagem + label "Admin" no header substituindo ícone de usuário | 100% dos admins encontram /admin/apps em 1 clique sem ajuda |
| **30 dias** | Card "Configurar Workspace" no AppHub com estado de apps ativos/inativos | Tempo médio de configuração de primeiro workspace < 2 minutos |
| **60 dias** | Validação com 3 admins reais medindo cliques até /admin/apps | Taxa de erro de navegação admin = 0 |

---

## 3. Pilares de Ação

### Pilar 1 — Header: ícone de engrenagem com label "Admin"
**Urgência:** Crítica. Este é o ponto de entrada global — presente em qualquer tela autenticada.

### Pilar 2 — AppHub: card de configuração de workspace
**Urgência:** Alta. Primeiro ponto de contato para admins novos.

### Pilar 3 — AdminMenu: limpeza e clareza
**Urgência:** Alta. O dropdown atual tem itens apontando para rotas antigas.

### Pilar 4 — Validação: testar com admin real
**Urgência:** Média. Confirmar que a solução resolve antes de iterar.

---

## 4. Ações Detalhadas

### Pilar 1 — Header com label "Admin"

**Ação 1.1 — Trocar ícone de usuário por engrenagem + label em AdminMenu.tsx**
- O que fazer: No componente `AdminMenu` (`eb-dash2/src/components/layout/AdminMenu.tsx`), trocar o ícone `Users` por `Settings` do lucide-react. Adicionar label "Admin" ao lado do ícone, visível em telas `md:` e maiores. Manter o botão compacto em mobile (só ícone). Mudar o `title` para "Painel de Administração".
- Por que importa: ícone de usuário comunica "perfil", não "administração". Engrenagem é linguagem universal de configuração. (Jobs: "O ícone ambíguo é uma mentira silenciosa para o usuário.")
- Responsável: dev frontend
- Prazo: Dia 1
- Métrica: Admin novo clica no ícone correto sem hesitação no primeiro acesso

**Ação 1.2 — Verificar que os links do dropdown apontam para /admin/***
- O que fazer: Confirmar que `ADMIN_ITEMS` aponta para `/admin/users` e `/admin/apps` (já corrigido). Adicionar terceiro item "Permissões" → `/admin/permissions`.
- Por que importa: menu incompleto = funcionalidade oculta.
- Responsável: dev frontend
- Prazo: Dia 1
- Métrica: Todos os 3 itens de admin acessíveis pelo dropdown

---

### Pilar 2 — AppHub com card de configuração

**Ação 2.1 — Adicionar card/banner "Configurar Workspace" no AppHubPage.tsx**
- O que fazer: Em `AppHubPage.tsx`, para usuários com role `admin` ou `owner`, renderizar um card fixo no topo da grade (antes dos cards de apps) com: ícone de engrenagem, título "Gerenciar Workspace", subtítulo "Configure apps, usuários e permissões", botão "Abrir Admin" → `/admin/apps`. Estilo: border `border-empire-primary/30`, background `bg-empire-primary/5`.
- Por que importa: AppHub é o ponto de entrada neutro — o contexto perfeito para o primeiro acesso de um admin novo. (Hormozi: "Ativo de retenção escondido é ativo desperdiçado.")
- Responsável: dev frontend
- Prazo: Dia 2
- Métrica: Admin novo encontra configuração de apps a partir do AppHub sem instrução

**Ação 2.2 — Estado visual de apps não configurados**
- O que fazer: Se o workspace tem 0 apps ativos (`apps.filter(a => a.is_active).length === 0`), mostrar banner de alerta suave no AppHub: "Nenhum app ativo neste workspace. Configure em Admin → Apps." com link direto.
- Por que importa: estado vazio sem instrução é desorientador para admin novo.
- Responsável: dev frontend
- Prazo: Dia 3
- Métrica: Zero admins novos com workspace sem apps configurados por mais de 10 minutos

---

### Pilar 3 — AdminMenu: limpeza

**Ação 3.1 — Adicionar "Permissões" ao dropdown**
- O que fazer: Acrescentar `{ label: 'Permissões', href: '/admin/permissions', icon: ShieldCheck }` ao `ADMIN_ITEMS` no `AdminMenu.tsx`.
- Responsável: dev frontend
- Prazo: Dia 1
- Métrica: Acesso a permissões disponível em 1 clique pelo header

---

### Pilar 4 — Validação

**Ação 4.1 — Teste com admin real**
- O que fazer: Pedir a 1-2 admins do workspace para abrir o sistema e encontrar "onde ativar um app" sem instrução. Medir cliques e tempo.
- Responsável: produto/gestor
- Prazo: Dia 7
- Métrica: < 5 segundos e < 2 cliques. Se falhar, iterar.

---

## 5. Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Admin mobile não vê label "Admin" (apenas ícone) | Média | Testar em viewport 375px. Se ícone for insuficiente, adicionar tooltip no mobile |
| Card do AppHub poluí visual para admins que já configuraram | Baixa | Manter card em modo secundário (menor, sem destaque) após configuração concluída |
| SDRs/closers veem algum elemento de admin por bug de role | Baixa | Testar com conta de SDR após cada alteração. `isAdminOrOwner` já implementado |

---

## 6. Próximo Passo Imediato (24-48h)

**Agora:** Editar `AdminMenu.tsx` — trocar `Users` por `Settings`, adicionar label "Admin" ao lado do ícone em `md:` screens, adicionar "Permissões" ao dropdown.

```tsx
// AdminMenu.tsx — mudanças
import { Settings, Users, LayoutGrid, ShieldCheck, LogOut } from 'lucide-react'

const ADMIN_ITEMS = [
  { label: 'Pessoas', href: '/admin/users', icon: Users },
  { label: 'Apps', href: '/admin/apps', icon: LayoutGrid },
  { label: 'Permissões', href: '/admin/permissions', icon: ShieldCheck },
]

// No botão trigger:
<Settings className="h-4 w-4" />
<span className="hidden md:inline text-sm font-medium">Admin</span>
```

**Amanhã:** Adicionar card "Gerenciar Workspace" no `AppHubPage.tsx` para admins.
