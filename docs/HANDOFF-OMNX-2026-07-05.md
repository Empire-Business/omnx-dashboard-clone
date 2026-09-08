# Handoff — Revisão Completa do App OMNX

> **Data:** 2026-07-05  
> **Branch de trabalho:** `fix/security-hardening-omnx`  
> **Responsável que iniciou:** Kimi Code CLI  
> **Destinatário:** próxima IA / equipe de engenharia  

---

## 1. Contexto do Pedido Original

O usuário pediu uma revisão completa do app para torná-lo "primeiro mundo, extremamente funcional e bem documentado", com foco em:

1. **Discador de pré-vendas** — priorização pobre, critérios fracos.
2. **App de criativos** — falta de confiança na integração e documentação.
3. **Design geral** — pode ficar mais profissional.
4. **Sistema de acessos** — não confiável por app/função.
5. **Segurança do app** — revisão completa.

Além disso, foi solicitado e aprovado um **módulo de Disparos** (campanhas baseadas em tags configuráveis: trigger, respondeu, parou, erro, nao_respondeu, comprou).

---

## 2. O que Já Foi Entregue (Waves Concluídas)

### Wave 0 — Auditoria paralela
- 5 agentes de auditoria inspecionaram: Discador, Criativos, Design/UI, Acessos, Segurança.
- Todos os relatórios estão preservos nas mensagens do agente (agent-7 a agent-11).

### Wave 1 — Correções críticas de build, segurança e integridade
Commits na branch `fix/security-hardening-omnx`:

| Hash | Mensagem | Status |
|------|----------|--------|
| `f3b25ad` | `fix(navigation): adiciona ícones LayoutGrid e FlaskConical ao menu Criativos` | ✅ Aprovado |
| `1f1f26b` | `feat(security): activate RLS on admin tables` | ✅ Aprovado |
| `4af01a3` | `fix(criativos): corrige integridade do fluxo de testes` | ✅ Aprovado (com ressalvas) |
| `502a7fd` | `fix(disparos): reforça controle de acesso do módulo Disparos` | ✅ Aprovado |
| `8332b99` | `fix(security): resolve type errors in edge functions for workspace isolation` | ✅ Aprovado (com ressalvas) |
| `a685acf` | `fix: adiciona workspace_id nos UPDATEs de criativos e unifica permissão em ConfiguracaoTab` | ✅ Aprovado |
| `f54bf92` | `fix(compute-weekly-reports): isola snapshots e queries por workspace` | ✅ Aprovado (com ressalvas) |
| `3e460ff` | `fix(cron): recreate weekly reports cron jobs per workspace` | ✅ Aprovado (com ressalvas) |
| `fa2ec4d` | `fix: isolamento de workspace na fila de reprocessamento cohort` | ✅ Aprovado (com ressalvas) |
| `77da6a7` | `fix(weekly-reports): corrige tipagem de ComputePayload e crons por workspace ativo` | ✅ Aprovado (com ressalvas) |
| `9a7db11` | `feat: add workspace_id to ghl_users and filter frontend hooks by workspace` | ✅ Entregue |
| `7b917a5` | `fix(db): trigger e backfill de apps/permissões para novos workspaces` | ✅ Entregue |

### Módulo de Disparos (entregue antes das waves)
| Hash | Mensagem |
|------|----------|
| `3b73791` | `feat: implementa módulo de Disparos com tags configuráveis` |
| `7803aad` | `docs: atualiza documentação do módulo Disparos` |

### Seletor de Workspace (entregue antes das waves)
| Hash | Mensagem |
|------|----------|
| `3280114` | `feat: adiciona seletor explícito de workspace no header` |

---

## 3. Estado Atual do Working Tree (NÃO COMMITADO)

**Arquivos modificados:**
- `eb-dash2/src/App.tsx`
- `eb-dash2/src/contexts/PermissionsContext.tsx`
- `eb-dash2/src/pages/criativos/CriativosPage.tsx`
- `eb-dash2/src/pages/criativos/components/KanbanBoard.tsx`
- `eb-dash2/src/pages/criativos/components/KanbanColumn.tsx`
- `eb-dash2/src/pages/criativos/tabs/BibliotecaTab.tsx`
- `eb-dash2/src/pages/criativos/tabs/KanbanTab.tsx`
- `eb-dash2/src/pages/leads/LeadsPage.tsx`
- `eb-dash2/src/pages/traqueamento/TraqueamentoPage.tsx`

**Arquivo novo não rastreado:**
- `supabase/migrations/20260705000008_app_feature_can_edit.sql`

**O que aconteceu:** um agente começou a implementar o **controle de feature nas rotas + can_edit** (Wave 2, subtarefa 2), mas foi interrompido por limite de uso da API. As mudanças estão no working tree, **não commitadas**.

**Ação necessária imediata:** revisar essas mudanças, completar o que falta, rodar `npx tsc --noEmit` e commitar — OU descartar e refazer de forma mais controlada.

---

## 4. Tarefas Pendentes (Handoff para Próxima IA)

### 🔴 PRIORIDADE 1 — Finalizar Wave 2 (está pela metade)

#### 4.1 Comitar ou refazer o controle de feature/can_edit
- **Contexto:** existe trabalho não commitado no working tree.
- **Objetivo:** implementar `hasFeatureEditPermission(appSlug, featureKey)` e proteger rotas/tabs por feature.
- **Decisão de design a tomar:**
  - Adicionar `can_edit` em `app_feature_role_permissions` e `app_feature_user_overrides`?
  - Ou usar `defaultEditRoles` do `FEATURES_CATALOG` como fonte única?
- **Arquivos envolvidos:**
  - `eb-dash2/src/contexts/PermissionsContext.tsx`
  - `eb-dash2/src/lib/apps/features.ts`
  - `eb-dash2/src/App.tsx`
  - `eb-dash2/src/pages/leads/LeadsPage.tsx`
  - `eb-dash2/src/pages/criativos/CriativosPage.tsx`
  - `eb-dash2/src/pages/traqueamento/TraqueamentoPage.tsx`
  - `eb-dash2/src/pages/disparos/DisparosPage.tsx`
  - `supabase/migrations/20260705000008_app_feature_can_edit.sql`
- **Critério de pronto:**
  - Rotas diretas como `/leads?tab=limpeza` são negadas sem a feature `leads.limpeza`.
  - `/criativos?tab=biblioteca` e `/criativos?tab=kanban` são negados sem as features.
  - `/traqueamento?tab=cods_utm` etc. são negados sem as features.
  - Botões de edição/criação/exclusão respeitam `can_edit`.
  - `npx tsc --noEmit` passa.
  - Tudo commitado.

#### 4.2 QA da Wave 2
- Revisar as migrations `20260705000007_ghl_users_workspace_id.sql`, `20260705000008_app_feature_can_edit.sql` e `20260705000009_seed_new_workspaces.sql`.
- Validar isolamento de `ghl_users`.
- Validar seed de novos workspaces.
- Validar controle de feature nas rotas.

---

### 🟠 PRIORIDADE 2 — Wave 3: Refatoração do Discador de Pré-Vendas

**Diagnóstico do agente auditor:** o discador tem duas implementações paralelas (`useDiscagem.ts` legado e `useDiscagemScore.ts` ativo), falta isolamento de workspace em `discagem_scores`, critérios de priorização não consideram qualificação do lead (MQL, ICP, valor, canal respondido), e a UX é passiva.

#### 4.3 Isolamento de workspace no discador
- Adicionar `workspace_id` em `discagem_scores`.
- Atualizar `recalcular_discagem_scores()` para popular `workspace_id`.
- Reescrever RLS por workspace.
- Filtrar `workspace_id` em `useDiscagemScore.ts`.

#### 4.4 Unificar/remover código morto
- Decidir se `useDiscagem.ts` legado será removido ou renomeado/deprecado.
- Atualizar `docs/DISCADOR-PRE-VENDAS.md` para refletir a migration ativa (`20260628050000_discagem_score_escala_1000.sql`).

#### 4.5 Refatorar critérios de priorização
- Proposta de score composto (0–1000):
  - Sinal de resposta: 30%
  - Qualificação MQL/ICP: 25%
  - Recência/urgência: 20%
  - Disponibilidade para contato: 10%
  - Engajamento histórico: 10%
  - Tentativas/fadiga: 5%
- Criar tabela `discagem_config` por workspace (pesos, horário comercial, tags MQL, max tentativas).
- Reescrever `recalcular_discagem_scores()` com score composto.
- Corrigir auto-remoção por call outbound (não remover se call falhou/não atendida).

#### 4.6 Melhorias de UX
- Extrair `DiscagemCard` da `DiscagemTab.tsx`.
- Reintroduzir ação "Marcar retorno".
- Adicionar badges de qualificação (MQL, ICP, canal preferido).
- Melhorar KPIs (leads na fila, tempo médio de resposta, taxa de conversão do dia).
- Paginação/limit na carga da fila (top 50).

#### 4.7 Documentar e testar
- Atualizar `docs/DISCADOR-PRE-VENDAS.md`.
- Adicionar testes para ordenação da fila.

---

### 🟡 PRIORIDADE 3 — Wave 4: Correções do App de Criativos

**Diagnóstico do agente auditor:** build corrigido, mas ainda há falhas críticas de isolamento, integridade e funcionalidade.

#### 4.8 Isolamento de workspace em queries de criativos
- `useCreativeRankingData.ts`: filtrar `oportunidades` por `contatos.workspace_id`, `meta_ads_insights` e `vendas_fechamento` por workspace.
- `useCriativosFilters.ts`: restringir filtros ao workspace.
- RPC `get_creative_metrics`: receber lista de contas Meta do workspace e filtrar.
- Edge function `notion-creatives-sync`: validar JWT e usar `x-workspace-id`.

#### 4.9 Corrigir filtros coerentes no Ranking
- Aplicar filtros de campanha/adset/ad também nas oportunidades (via `utm_campaign`/`utm_term`) ou documentar claramente o comportamento.

#### 4.10 Corrigir threshold de early_stop
- Normalizar `early_stop_threshold` para multiplicador (1.5) em workspaces antigos.

#### 4.11 Funcionalidade de aprovação de roteiro
- Definir quando a tag `roteiro-em-aprovacao` é adicionada para que os botões do Kanban apareçam.

#### 4.12 Melhorias no Ranking e Testes
- Janela de métricas de testes desde `test.started_at`, não 30 dias fixos.
- `computeSuggestion` retornar `'scale'` corretamente.
- Remover controles redundantes de MQL no Ranking.

#### 4.13 Documentação
- Reescrever `docs/SUB-APP-CRIATIVOS.md` para refletir estado real.
- Criar `docs/CRIATIVOS-SEGURANCA.md`.

---

### 🟢 PRIORIDADE 4 — Wave 5: Padronização de Design/UI

**Diagnóstico do agente auditor:** fragmentação visual crescente; módulos novos reinventam componentes e usam cores Tailwind puras.

#### 4.14 Consolidação de tokens
- Alinhar `index.css`, `tailwind.config.js` e `docs/design-system.md`.
- Documentar versão oficial do DS (v2.0 ou v3.0).

#### 4.15 Criar componentes reutilizáveis
- `StatusBadge` (usando apenas tokens do DS).
- `Callout` para alertas.
- `ProgressBar`.
- `ErrorState` padronizado.
- `DateFilterPanel` (presets + mês + data).
- `DataTable` (loading, empty, error, sticky).

#### 4.16 Aplicar nos módulos mais críticos
- **Disparos:** usar `KpiCard`, `FunnelViz`, `EmptyState`, `StatusBadge`.
- **Criativos Dashboard:** reduzir paleta, trocar fundos pastel por bordas ghost.
- **Traqueamento:** criar `IconHeaderCard`, usar `PageTabs`.
- **Relatórios/Automações/Auditoria IA:** substituir badges pastel por `StatusBadge`.

#### 4.17 Estados vazio/loading/erro
- Padronizar todos os estados vazios para `<EmptyState>`.
- Padronizar estados de erro com `ErrorState`.

#### 4.18 Acessibilidade e responsividade
- Indicador de scroll em `PageTabs`.
- Foco visível em todos os botões interativos.
- CohortProdToggle acessível.

---

### 🔵 PRIORIDADE 5 — Wave 6: Auditoria de Permissões (Fase 2.5)

#### 4.19 Implementar logging de alterações de permissões
- A tabela `permission_audit_log` já existe (`supabase/migrations/20260225100400_create_permission_audit_log.sql`).
- Criar triggers para capturar alterações em:
  - `workspace_members` (role, is_active)
  - `workspace_apps` (is_active)
  - `app_role_permissions` e `app_feature_role_permissions`
  - `app_user_overrides` e `app_feature_user_overrides`
  - `dashboard_user_permissions` (enquanto existir)

#### 4.20 Tela de auditoria
- Criar página `/workspace/audit` ou `/admin/audit`.
- Exibir: quem alterou, quem foi afetado, app/feature/módulo, old/new value, timestamp.
- Restringir a owner/admin.

#### 4.21 Retenção
- Considerar política de purge após 12 meses.

---

### ⚫ PRIORIDADE 6 — Wave 7: QA Final e Segurança

#### 4.22 Testes de isolamento cross-workspace
- Criar scripts SQL/Playwright que validam:
  - Usuário A do workspace 1 não vê dados do workspace 2.
  - `meta_ads_insights`, `weekly_*`, `ghl_users` isolados por workspace.
  - RLS efetivo em todas as tabelas.

#### 4.23 Scanner de secrets no histórico
- Instalar/rodar `gitleaks` ou `truffleHog` no repositório.
- Documentar secrets expostos no histórico.

#### 4.24 Ações fora do código (dependem do usuário)
- Rotacionar no Supabase Dashboard:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_ACCESS_TOKEN`
- Rotacionar no GoHighLevel:
  - `GHL_API_KEY` (foi exposta no histórico — verificar no GitHub/Git log)
- Atualizar secrets das edge functions:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`
  - `GHL_API_KEY`
  - `CRON_SECRET`
  - `WEBHOOK_SECRET`
- Atualizar `app.settings.supabase_anon_key` no banco.
- Aplicar todas as migrations em produção.

#### 4.25 Verificação de edge functions
- `bot-chat`, `bot-chat-data`, `bot-chat-synthesis`, `prevendas-ai`, `workspace-apps` devem ter `verify_jwt = true` (ou validação manual robusta).
- `sync-meta-ads`, `sync-contact-attribution`, `webhook-ghl` podem permanecer com `verify_jwt = false` (cron/webhook externo), mas devem validar secrets.

---

## 5. Débitos Técnicos Conhecidos (não bloqueantes, mas devem ser tratados)

1. **Weekly reports — dados legados `workspace_id IS NULL`**: as policies atuais permitem leitura de registros legados por qualquer usuário autenticado. Backfill manual é necessário antes de remover essa cláusula.
2. **`ghl_opp_reconcile_runs`**: permite leitura global entre workspaces até que `workspace_id` seja populado.
3. **`meta_ads_insights`**: mapeamento conta Meta ↔ workspace ainda não existe. O sync é single-tenant por env var.
4. **Atomicidade do histórico de testes**: `useCreateCreativeTest` e `useDecideCreativeTest` fazem múltiplos inserts/updates no frontend. Idealmente deveriam ser uma RPC/edge function atômica.
5. **`approved` vs `scale`**: ambos mapeiam para `aprovado` em `notion_creativos.test_result`. Decidir se `scale` precisa de valor distinto.
6. **`CORS '*'`** em `compute-weekly-reports`: restringir para origens permitidas.
7. **Testes automatizados**: cobertura muito baixa para segurança e isolamento.

---

## 6. Comandos Importantes para a Próxima IA

```bash
# Verificar estado
cd /Users/bguzela/Desenvolvimento/GHL-SUPABASE
git status --short
git log --oneline -20

# TypeScript
cd eb-dash2 && npx tsc --noEmit

# Segurança (working tree)
./scripts/security-check.sh

# Verificar crons agendados (após aplicar migrations)
# SELECT * FROM cron.job;
```

---

## 7. Documentos de Referência

- `docs/DISCADOR-PRE-VENDAS.md`
- `docs/SUB-APP-CRIATIVOS.md`
- `docs/DASHBOARD-CONTROLE-ACESSO.md`
- `docs/SEGURANCA-HARDENING.md`
- `docs/PLANO-MODULO-DISPAROS.md`
- `docs/design-system.md`
- `docs/FRONTEND-EB-DASH2.md`

---

## 8. Decisões que Precisam de Validação do Usuário

1. **Modelo de permissões `can_edit`:** usar colunas novas no banco ou apenas `defaultEditRoles` do catálogo?
2. **Score do discador:** a proposta de pesos (30% sinal de resposta, 25% qualificação, 20% recência, etc.) atende à operação?
3. **Criativos — Ranking:** os filtros de campanha/adset/ad devem afetar leads/MQL/vendas também, ou apenas métricas Meta?
4. **Prazo:** as Waves 5 (design) e 6 (auditoria de permissões) podem ser feitas em paralelo ou devem esperar a finalização das Waves 2–4?

---

## 9. Resumo Executivo para o Usuário

> Foram entregues o **módulo de Disparos**, o **seletor de workspace** e uma **Wave 1 extensa de correções críticas** (build, RLS, integridade de dados, isolamento de weekly-reports/meta-ads, workspace_id em ghl_users, seed para novos workspaces). A **Wave 2 foi iniciada mas não concluída** — existe trabalho não commitado no working tree. As **Waves 3 a 7 ainda estão pendentes**. Este handoff foi criado para que outra IA ou equipe possa continuar de onde paramos.
