# Níveis de Acesso — Matriz de Papéis × Permissões

| Campo | Valor |
|-------|-------|
| **Status** | Síntese da matriz real de papéis do sistema (existentes, não introduz nenhum novo). |
| **Fonte detalhada** | [`docs/DASHBOARD-CONTROLE-ACESSO.md`](DASHBOARD-CONTROLE-ACESSO.md) — modelo completo de workspace + sub-apps. |
| **Criado em** | 2026-07-11, junto com a Fase 8 (LGPD/expurgo) — ver [`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`](FASE-8-LGPD-EXPURGO-OFFBOARDING.md). |
| **Atualizado em** | 2026-07-17 BRT — Clara exige membership ativa na conta e a permissão `clara_habilitado`; owner/admin cadastra, testa, revoga, lê telemetria e configura a Clara da própria conta. Hardening P0/P2: 8 vazamentos cross-tenant fechados e brecha `workspace_id IS NULL OR` eliminada (ver seção 3). |

Este documento existe para dar uma resposta rápida a "quem pode fazer o quê" sem precisar ler código — a matriz completa por feature/sub-app já vive em `DASHBOARD-CONTROLE-ACESSO.md`; aqui ficam **todos os papéis do sistema** e as ações de alto risco (destrutivas/irreversíveis) que cada um controla.

---

## 1. Papéis por camada

### 1.1 Workspace (`workspace_members.role`)

| Papel | Pode | Não pode |
|---|---|---|
| `owner` | Tudo que `admin` pode + alterar `role`, `workspace_id` ou `user_id` de memberships; convidar/remover admins; pedir exclusão do workspace (`request_workspace_deletion`) | Remover ou desativar o último owner ativo |
| `admin` | Gerenciar campos operacionais de membros não-owner, configurar integrações GHL/Meta/OpenRouter (BYOK), gerenciar permissões de sub-app, configurar regras, limites, catálogo e auditoria da Clara da própria conta, pedir exclusão do workspace se também for admin da agência dona | Promover-se, alterar papéis/vínculos, mover membership entre workspaces, rebaixar ou desativar owner, liberar modelo fora da política global |
| `member` | Ver/editar dados dos módulos liberados via `dashboard_user_permissions`/`app_feature_*` (`can_view`/`can_edit`); usar a Clara quando `clara_habilitado=true` na própria conta | Gerenciar membros, configurar integrações ou Clara, pedir exclusão do workspace, usar conversas/dados da Clara de outra conta |

Funções RLS: `is_workspace_owner(workspace_id)`, `is_workspace_admin(workspace_id)`, `is_workspace_member(workspace_id)` (SECURITY DEFINER, `public` schema).

### 1.2 Agência (`agency_members.role`) — Fase 1/5, multi-tenant

| Papel | Pode | Não pode |
|---|---|---|
| `owner`/`admin` da agência | Ver/suspender/reativar sub-contas da própria agência (`suspend_agency_workspace`/`reactivate_agency_workspace`), acessar dados de sub-conta `active` via `can_access_workspace_via_agency`, incluindo os totais de `meta_ads_account_daily`, pedir exclusão de sub-conta da própria agência | Acessar sub-conta de outra agência, incluindo totais Meta Ads, reativar sem confirmação explícita (`p_confirmed=true`) |
| `staff` da agência | — (papel reservado, hoje sem ação própria além de leitura de metadados da agência) | Suspender/reativar sub-contas, acessar dados de sub-conta |

Funções RLS: `is_agency_member(agency_id)`, `is_agency_admin(agency_id)`, `can_access_workspace_via_agency(workspace_id)`.

### 1.3 Sub-apps e módulos (`dashboard_user_permissions` / `app_feature_role_permissions` / `app_feature_user_overrides`)

Ver árvore completa de `module_key` e regras de herança em `docs/DASHBOARD-CONTROLE-ACESSO.md` seção 3. Resumo: `can_view`/`can_edit` por usuário e por feature, com override de usuário vencendo sobre permissão de papel.

### 1.4 Sistema (auditoria)

Usuário "sistema" (ver `docs/DASHBOARD-CONTROLE-ACESSO.md`) usado para atribuir operações via `service_role`/CLI (cron, scripts de operador) em colunas de auditoria (`created_by`, `granted_by`) — não é um papel de login real.

---

## 2. Ações de alto risco (destrutivas/irreversíveis) — quem autoriza

| Ação | RPC/mecanismo | Quem autoriza | Guard |
|---|---|---|---|
| Suspender sub-conta | `suspend_agency_workspace` | admin/owner da agência dona | `is_agency_admin`, só `status='active'` |
| Reativar sub-conta | `reactivate_agency_workspace` | admin/owner da agência dona | `is_agency_admin` + `p_confirmed=true` obrigatório (nunca automático) |
| Pedir exclusão de workspace (LGPD) | `request_workspace_deletion` | owner do workspace OU admin da agência dona | `is_workspace_owner` OR `is_agency_admin` da agência dona; 1 pedido em aberto por vez |
| **Expurgo definitivo (hard-delete) de workspace** | `purge_workspace_data` | **Só operador via `service_role`** (nunca exposto a `authenticated`) | Confirmação por nome exato (`p_confirmation_name = workspaces.name`, fail-closed) + `p_dry_run` default `true` |
| Cadastrar/rotacionar credencial (GHL/Meta) | `save_workspace_credential` | admin/owner do workspace | `is_workspace_admin` |
| Testar/revogar credencial OpenRouter | `test-workspace-credential` / `revoke_workspace_credential` | admin/owner do workspace | membership ativa + `is_workspace_admin`; chave nunca volta ao cliente |
| Ler consumo/falhas de IA | `workspace_ai_usage_events` | admin/owner do workspace | RLS por `is_workspace_admin(workspace_id)`; sem prompt, resposta ou segredo |
| Configurar Clara e consultar catálogo | `clara_workspace_settings` / `clara-settings` | admin/owner do workspace | membership ativa + `is_workspace_admin`; leitura/escrita por `workspace_id`, catálogo resolvido server-side e modelo preso à allowlist/política |
| Cutover de credencial via seed (operador) | `seed_workspace_ghl_credential_service_role` | Só operador via `service_role` | RPC restrita a `service_role` |
| Adotar/desvincular workspace legado | `adopt_existing_workspace_service_role` / `detach_adopted_workspace_service_role` | Só operador via `service_role` | Confirmação do nome; cria/remove somente `agency_workspaces` |
| Rotear venda omnx-desk por secret (digest→workspace) | `resolve_workspace_by_omnx_desk_secret_digest` | Só edge function via `service_role` (a ponte `crm-registrar-venda`) | `SECURITY DEFINER` + `search_path=''` + `REVOKE` de PUBLIC/anon/authenticated; devolve o workspace dono do secret (ou NULL). A venda só grava se a oportunidade pertence a esse workspace (403 cross-tenant) |

**Regra geral:** toda ação que apaga dado real ou muda o raio de acesso de um workspace inteiro é restrita a `service_role` (nunca a `authenticated` direto) — o cliente/admin só pode **pedir**, o operador **executa** com uma confirmação explícita adicional (nome digitado, `p_confirmed=true`, ou equivalente). Esse padrão se repete em `reactivate_agency_workspace`, `purge_workspace_data` e `seed_workspace_ghl_credential_service_role`.

---

## 3. Onde isso é aplicado (RLS)

Toda tabela com `workspace_id` tem RLS habilitado e filtra por `is_workspace_member`/`is_workspace_admin`/`is_workspace_owner` (retrofit de agência via `can_access_workspace_via_agency`, incluindo `meta_ads_account_daily` desde `20260721120000_fix_agency_rls_meta_ads_account_daily.sql`). Desde o hardening de 2026-07-17 (migrations `20260927000000`/`20260928000000`), **todas** as tabelas de negócio carregam `workspace_id` — inclusive `ghl_tasks`, `webhooks_ghl`, `maquina_de_conteudo`, `reunioes`, `bot_context` e as 12 `weekly_*` — e as exceções globais são uma whitelist explícita (`app_config` com leitura anon restrita a `supabase_anon_key`, catálogos e infra `service_role`-only). Cobertura provada pela suite `__tests__/integration/workspace-isolation.test.ts` (139 testes) + `agency-data-access.test.ts` (4 testes) + `p0-cross-tenant-rls-fix.test.ts` (30 testes).

### 3.1 Preferências por usuário — `user_dashboard_prefs` (migration `20261001000000`)

Tabela de preferência **por usuário + workspace** (PK `(user_id, workspace_id)`), não é dado de negócio. Guarda escolhas de UI persistentes por conta (hoje: `recuperacao_mode` do filtro de Recuperação em Vendas/Aquisição). Isolamento **por usuário** (mais estrito que "membro do workspace"):

| Ação | Política RLS |
|---|---|
| SELECT / UPDATE / DELETE | `user_id = auth.uid()` — cada usuário só a **própria** linha |
| INSERT / UPDATE (WITH CHECK) | `user_id = auth.uid()` **e** `is_workspace_member(workspace_id)` — não grava preferência sob workspace alheio |
| service_role | acesso total (CLI/admin) |

Nenhum usuário lê a preferência de outro, mesmo no mesmo workspace. Ver [`docs/INTEGRACAO-OMNX-DESK-VENDAS.md`](INTEGRACAO-OMNX-DESK-VENDAS.md) §9.
