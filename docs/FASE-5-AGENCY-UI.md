# Fase 5 — MVP da área `/agency/*` (gestão Agency)

| Campo | Valor |
|-------|-------|
| **Status** | 🟡 em andamento — MVP entregue no banco de **teste** (`fgjbmdsucruvtpywyhhf`); produção não foi tocada |
| **Atualizado em** | 2026-07-10 BRT |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) — seções 3.6 (reativação nunca automática) e 8 (gestão de usuários por sub-conta) |
| **Roadmap** | [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — Fase 5 na tabela de fases (seção 3) e log de execução (seção 6) |

---

## 1. O que foi construído

O MVP entrega o mínimo para o **dono/admin de uma agência** suspender e reativar uma sub-conta (`agency_workspaces`) sem tocar no banco, com confirmação humana explícita antes de qualquer reativação.

### 1.1 Backend — migration `20260801000000_fase5_agency_admin_rpcs.sql`

Duas RPCs `SECURITY DEFINER`, com `GRANT EXECUTE` para `authenticated` (a segurança real é a guarda interna, não o GRANT):

- **`suspend_agency_workspace(p_agency_workspace_id UUID)`**
  - Verifica que quem chama é admin/owner da agência dona daquela sub-conta via `is_agency_admin(v_agency_id)` — quem não é recebe `42501` (forbidden).
  - Guard de estado: só suspende sub-conta com `status = 'active'`. Tentar suspender uma já `suspended`/`pending` retorna erro (`22023`).
  - Efeito: `UPDATE agency_workspaces SET status = 'suspended'`.

- **`reactivate_agency_workspace(p_agency_workspace_id UUID, p_confirmed BOOLEAN)`**
  - Mesma guarda de papel (`is_agency_admin`).
  - Guard de estado: só reativa sub-conta com `status = 'suspended'`.
  - **Guard de confirmação:** se `p_confirmed IS NOT TRUE`, a RPC recusa com erro explícito citando a seção 3.6 do plano-mãe. Não existe reativação silenciosa — o parâmetro precisa ser `true` de propósito, vindo de uma ação humana explícita.

Ambas são pensadas para chamada **direta do frontend autenticado** (JWT do usuário logado via `supabase-js` do browser), não de dentro de uma edge function com client `service_role` — nesse contexto `auth.uid()` é `NULL` e as RPCs sempre falhariam/retornariam `false`. Essa armadilha já está documentada em `docs/HANDOFF-FASE-4-BYOK.md` e foi respeitada aqui.

### 1.2 Backend — `invite-user` aceita admin de agência

`supabase/functions/invite-user/index.ts` ganhou um fallback de autorização: além do caminho existente (`workspace_members.role IN ('admin','owner')`), agora também autoriza quem é admin/owner de uma **agência** dona da sub-conta (`agency_workspaces.status = 'active'`) para a qual o convite está sendo feito. Isso cobre o cenário do primeiro admin de um workspace novo, provisionado por uma agência, que ainda não tem linha própria em `workspace_members`.

A checagem é feita com duas consultas diretas (`agency_workspaces` → `agency_members`) usando o client `service_role` da própria edge function — não chama as RPCs de RLS `is_agency_admin`/`can_access_workspace_via_agency`, exatamente pela armadilha de `auth.uid()` NULL citada acima.

### 1.3 Frontend

- **`eb-dash2/src/hooks/useAgency.ts`** (novo) — hooks React Query: `useMyAgencies()` (lista as agências onde o usuário logado tem linha ativa em `agency_members`), `useAgencyWorkspaces(agencyId)` (lista as sub-contas de uma agência), `useSuspendAgencyWorkspace()` e `useReactivateAgencyWorkspace()` (mutations que chamam as RPCs acima).
- **`eb-dash2/src/pages/agency/AgencyRoute.tsx`** (novo) — guard de rota: enquanto `useMyAgencies()` está carregando, **não desmonta** `children` (mesmo padrão do `AdminRoute` já existente); quando termina de carregar e `data` está vazio, redireciona para `/`. Só libera a área para quem tem **pelo menos 1 linha ativa** em `agency_members`.
- **`eb-dash2/src/components/layout/AgencyLayout.tsx`** (novo) — casca visual da área de agência.
- **`eb-dash2/src/pages/agency/AgencyWorkspacesPage.tsx`** (novo) — página única do MVP:
  - Lista as sub-contas (`agency_workspaces`) da agência selecionada (seletor de agência só aparece se o usuário pertence a mais de uma), com badge de status (Ativa/Suspensa/Pendente).
  - Botão **Suspender** (só aparece em sub-conta `active`): abre diálogo de confirmação simples (`SuspendDialog`) e chama a mutation.
  - Botão **Reativar** (só aparece em sub-conta `suspended`): abre diálogo (`ReactivateDialog`) que **exige digitar o nome exato da sub-conta** em um campo de texto antes de habilitar o botão — é a materialização na UI do `p_confirmed=true` da RPC. Sem o nome batendo caractere por caractere, o botão fica desabilitado.
- **`eb-dash2/src/App.tsx`** (modificado) — duas rotas novas, ambas protegidas por `AgencyRoute`: `/agency` (redireciona para `/agency/workspaces`) e `/agency/workspaces` (renderiza `AgencyWorkspacesPage` dentro de `AgencyLayout`).

---

## 2. A regra de ouro respeitada: single-tenant nunca vê nada disso

O cliente atual do Empire opera em `SINGLE_WORKSPACE_MODE = true` (ver [`docs/SINGLE-TENANT-LOCK.md`](SINGLE-TENANT-LOCK.md)) e **não tem nenhuma linha em `agency_members`** — não é membro de nenhuma agência, só de um workspace comum.

O guard `AgencyRoute` depende inteiramente de `useMyAgencies()`. Para esse cliente, a consulta sempre retorna lista vazia, então:

- Navegar para `/agency` ou `/agency/workspaces` redireciona imediatamente para `/`.
- Não existe link nem item de menu apontando para `/agency/*` na navegação normal do dashboard — a rota só é alcançável por URL direta, e mesmo assim o guard barra.
- Esse comportamento já era garantido estruturalmente **antes** da Fase 5 existir, pelo teste `eb-dash2/src/App.no-agency-routes.test.ts` (Fase 1, item 0.3 do roadmap), que originalmente provava que `App.tsx` **não registrava nenhuma rota `/agency`**. Com a Fase 5, esse teste foi atualizado para provar o próximo estado: as rotas existem, mas **atrás do guard** `AgencyRoute` — nunca abertas para quem não tem agência.

Ou seja: a regra "single-tenant não vê nada de multi-tenant" não é uma promessa de UI (esconder um botão) — é reforçada por um guard de dados (`agency_members` vazio) que existiria de qualquer forma, com ou sem essa tela.

---

## 3. Reativação NUNCA automática (seção 3.6 do plano-mãe)

A decisão de produto registrada na seção 3.6 do `PLANO-MULTI-TENANT-AGENCY.md` é: uma sub-conta suspensa **nunca** volta a ficar ativa sozinha, por cron, webhook ou qualquer efeito colateral de outro processo. Reativar é sempre um ato humano deliberado.

Essa regra é aplicada em duas camadas independentes (defesa em profundidade):

1. **Banco** — `reactivate_agency_workspace` recebe `p_confirmed BOOLEAN` como parâmetro obrigatório e falha com erro explícito se não vier `true`. Não existe um "default" que reative sem essa flag.
2. **UI** — o diálogo de reativação não tem um botão "Reativar" simplesmente clicável: o usuário precisa digitar o nome exato da sub-conta (`row.workspace?.name`) num campo de texto antes do botão sair do estado desabilitado. Isso evita reativação por clique acidental/duplo-clique e força quem está operando a **ler e confirmar qual sub-conta** está prestes a voltar a ficar ativa (evita confundir sub-contas com nomes parecidos numa lista longa).

Suspender, por contraste, é uma ação de contenção — tem um diálogo de confirmação mais simples (não exige digitar o nome), porque o custo de suspender por engano é menor e reversível pela própria tela (basta reativar).

---

## 4. O que fica de fora do MVP

Itens listados na Fase 5 do plano-mãe/roadmap mas **não implementados** nesta fatia, porque dependem de dados ou fases que ainda não existem:

- **Painel de custo** — depende de dados de billing/consumo por sub-conta que ainda não são coletados em nenhuma tabela (a Fase 5 não introduziu telemetria de custo).
- **Alerta de saúde de integração** — depende de sinais de saúde (última sincronização, erros de webhook, status de credencial) que hoje existem de forma fragmentada em tabelas técnicas (`ghl_api_jobs`, `webhook_unresolved`, etc.), mas não foram consolidados em uma visão por sub-conta.
- **Aprovação de admins auto-descobertos** — depende da Fase 3 (auto-descoberta GHL, `docs/ROADMAP-MULTI-TENANT.md` seção 3), que está formalmente **adiada (🚫 pós-MVP)** até haver POC da Agency API do GHL e demanda real (5+ sub-contas). Sem descoberta automática, não há candidatos a admin para aprovar.

Essas três lacunas são as mesmas já registradas na tabela de fases do roadmap (seção 3) na descrição da Fase 5 — este documento apenas explica o "porquê" de cada uma.

---

## 5. Verificação (números confirmados nesta sessão)

- Suite de integração (`vitest -c eb-dash2/vitest.integration.config.ts run`): **22 arquivos passed, 1 skipped (23 total)** · **308 testes passed, 10 todo (318 total)**. Inclui o teste novo `__tests__/integration/agency-admin-rpcs.test.ts` (**7/7**) e nenhuma regressão nos 301 testes anteriores.
- `tsc -b`: zero erros.
- `npm run build`: zero erros (só o warning pré-existente de chunk >500kB).
- `npx vitest run` (unitário/componente): **6 arquivos, 22 passed**, incluindo `App.no-agency-routes.test.ts` atualizado para o novo estado (rotas existem, protegidas por guard).
- `deno check supabase/functions/invite-user/index.ts`: zero erros.

Nenhuma correção de código foi necessária na verificação — a implementação já estava correta.

---

## 6. Arquivos relevantes

- `supabase/migrations/20260801000000_fase5_agency_admin_rpcs.sql` (novo)
- `supabase/functions/invite-user/index.ts` (modificado)
- `__tests__/integration/agency-admin-rpcs.test.ts` (novo)
- `eb-dash2/src/hooks/useAgency.ts` (novo)
- `eb-dash2/src/pages/agency/AgencyRoute.tsx` (novo)
- `eb-dash2/src/pages/agency/AgencyWorkspacesPage.tsx` (novo)
- `eb-dash2/src/components/layout/AgencyLayout.tsx` (novo)
- `eb-dash2/src/App.tsx` (modificado)
- `eb-dash2/src/App.no-agency-routes.test.ts` (modificado)
