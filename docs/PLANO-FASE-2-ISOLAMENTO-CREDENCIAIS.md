# Plano de Execução — Fase 2: Isolamento de Credenciais

| Campo | Valor |
|-------|-------|
| **Versão** | 0.1 (rascunho para aval do dono) |
| **Atualizado em** | 2026-07-10 BRT |
| **Status** | 🟡 Planejamento escrito — **aguardando aval do dono** antes de codar |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — seções 3.5, 4.1, 5.1–5.5, 10.2, 10.4, 11 |
| **Decisão de escopo** | **Plano completo (sem corte de MVP da seção 10.3)** — decisão do dono em `docs/ROADMAP-MULTI-TENANT.md` linha 9 |
| **Branch de trabalho** | `feat/multi-tenant-fase-2-credenciais` (criada a partir de `feat/multi-tenant-fase-1-modelo-agency`) |
| **Onde roda** | **Banco de TESTE** (`fgjbmdsucruvtpywyhhf`), via `.env.test`. Produção (`qzesffnkqgelmtfblzkr`) nunca é conectada. |

> Este documento fatia a Fase 2 em passos pequenos, cada um com critério de pronto testável e caminho de reversão. Nada aqui é aplicado em produção fora de `docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`.

---

## 1. Por que é a fase mais crítica

Hoje o RLS protege **leitura** de dados por workspace. Mas as **ações** (chamadas à API do GHL/Meta/OpenRouter) usam **uma única chave global por provedor**, lida como constante de módulo (cold start) em dezenas de edge functions. Um bug de resolução de tenant não vaza só uma leitura — **escreve no CRM do cliente errado**. A Fase 2 transforma "isolamento de leitura" em **isolamento de ação**.

Os 3 pontos mais perigosos do estado atual (confirmados por mapeamento em 2026-07-10):

1. **`ghl-api-worker`** (fila central da API GHL) aplica **uma `GHL_API_KEY` global a jobs de todos os tenants** — e `ghl_api_jobs` não tem coluna de tenant (só `context jsonb`).
2. **`get_workspace_id_by_ghl_location_id`** tem **fallback silencioso para "o workspace mais antigo"** (`ORDER BY created_at LIMIT 1`) e **nenhuma unicidade** em `ghl_location_id` — roteamento deterministicamente errado e silencioso no dia em que houver 2 tenants.
3. **Vault não está configurado** (`pgsodium`/`vault.decrypted_secrets` não encontrados; `[db.vault]` comentado em `config.toml`) — ainda não há onde guardar segredo por tenant com segurança.

---

## 2. Estado real (mapeamento 2026-07-10, somente leitura)

### 2.1 Edge functions: 42 no total

**Leem credencial de tenant/integração (hoje 100% via env GLOBAL):**

| Provedor | Funções | Segredo(s) lido(s) |
|---|---|---|
| **GHL** (escrevem no CRM — prioridade máxima) | `ghl-api-worker`, `sync-contact-tasks`, `sync-contact-opportunities`, `reconcile-contact-opportunities`, `sync-ghl-conversations`, `sync-ghl-users`, `sync-appointment-dates`, `sync-recuperacao-stages`, `recuperacao-prefetch`, `recuperacao-corrigir`, `discover-ghl-config`, `diag-ghl` | `GHL_API_KEY`, `GHL_LOCATION_ID` (com fallback hardcoded `'U8FTcw90CB5QELUnbGUu'` em 3 delas) |
| **Meta** | `sync-meta-ads`, `sync-meta-ads-backfill`, `sync-ad-permalinks` | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_ADS_WORKSPACE_ID` (tenant via env!) |
| **OpenRouter** | `bot-chat`, `bot-chat-synthesis`, `prevendas-ai`, `ai-ghl-mapping` | `OPENROUTER_API_KEY` (+ `BOT_INTERNAL_SECRET`) |
| **Notion** | `notion-creatives-sync` | `NOTION_API_KEY`, `NOTION_DATABASE_ID_*` |
| **Webhook inbound** | `webhook-ghl`, `webhook-compras` | `WEBHOOK_SECRET` (global único) |
| **Email/outbound** | `enviar-email-contrato-assinado`, `send-weekly-report-email`, `invite-user` | `RESEND_API_KEY*`, `INVITE_REDIRECT_URL` |
| **Outros** | `telegram-bot`, `crm-registrar-venda`, `crm-buscar-lead`, `crm-sync-stats` | `TELEGRAM_BOT_TOKEN/_SECRET`, `EMPIREDESK_BRIDGE_SECRET` |

**Só infra** (`SUPABASE_URL`/`SERVICE_ROLE`/`ANON`): `audit-leads-fev`, `generate-creative-code`, `workspace-apps`, `sync-opp-sdr`, `sync-contact-attribution`, `admin-cron-health`, `sync-opp-pipelines`, `sync-contact-tags`, `sync-opp-dates`, `infer-ghl-mappings`, `setup-ghl-integration`, `compute-weekly-reports` (este tem fallback de tenant `WEEKLY_REPORTS_WORKSPACE_ID`).

> O plano v3 fala em "16 edge functions GHL". O mapeamento encontrou **12 que leem `GHL_API_KEY`** + `ghl-api-worker` (fila) = o núcleo GHL; as demais "16" incluem as que só usam infra mas **processam dados GHL** (ex.: `sync-opp-dates`, `sync-contact-tags`, `sync-opp-pipelines`) — estas não leem chave, mas **escrevem via `ghl_api_jobs`**, então herdam o tenant pelo job (fatia 4). A refatoração de credencial propriamente dita cobre as **12 + worker**; as demais são cobertas pelo teste de "job carrega tenant certo".

### 2.2 Tabelas e funções relevantes

| Peça | Estado |
|---|---|
| `ghl_integration_settings` | Existe. `UNIQUE(workspace_id)`, `ghl_location_id NOT NULL` (**sem unique**), `webhook_secret`, `webhook_url`, `is_active`. `ghl_api_key` **removida** (decisão correta). Hoje só mapeia `workspace ↔ location_id` e guarda `webhook_secret/url`; **nenhuma função lê chave daqui**. |
| `ghl_api_jobs` | Fila central. **Sem `workspace_id`/`location_id`** — tenant só via `context jsonb`. RLS service_role-only. |
| `get_workspace_id_by_ghl_location_id(text)` | Resolve por `ghl_integration_settings.ghl_location_id` com **fallback "workspace mais antigo"** (`LIMIT 1`). |
| `webhooks_ghl` | Inbound (payload JSONB) com `location_id` indexado (sem unique). |
| `workspace_integration_credentials` | **Não existe** (a criar — seção 5.1). |
| `outbound_webhooks` | **Não existe** (a criar — seção 5.2); hoje URL/token OpenClaw estão **hardcoded em ~7 migrations** via `net.http_post`. |
| `agency_workspaces` | Existe (Fase 1). `ghl_location_id` (cache, sem unique), `provisioning_mode`, `status`, `UNIQUE(workspace_id)`. |
| **Vault** | **Não usado.** `pgsodium`/`vault.secrets`/`create_secret`/`decrypted_secrets` não encontrados; `[db.vault]` comentado. Migration antiga nota que `vault.decrypted_secrets` "não estava configurado". |
| **Unicidade de `location_id`** | **Nenhuma** em `ghl_location_id`/`location_id` (só índices compostos parciais em `contact_opp_sync_queue` e `ghl_opp_reconcile_items`, que não isolam `location_id`). |

### 2.3 Fallbacks perigosos encontrados (arquivo:linha)

- `ghl-api-worker/index.ts:30,35` — `GHL_API_KEY` global para **toda** a fila; `:256-258` falha se a env global faltar (fila não carrega chave por tenant).
- `get_workspace_id_by_ghl_location_id` — `20260708000001_….sql:146-152` fallback "workspace mais antigo"; `:138-143` `ORDER BY created_at LIMIT 1` (ambíguo sem unicidade).
- `recuperacao-prefetch/index.ts:192-197` — `from('ghl_integration_settings').eq('is_active',true).limit(1)` **sem filtro de workspace** + chave global (`:22`).
- `sync-contact-opportunities/index.ts:15`, `reconcile-contact-opportunities/index.ts:16`, `sync-ghl-users/index.ts:15` — `GHL_LOCATION_ID || 'U8FTcw90CB5QELUnbGUu'`.
- `sync-meta-ads/index.ts:438` — `body.workspace_id || Deno.env.get('META_ADS_WORKSPACE_ID') || null` (tenant via env).
- `compute-weekly-reports/index.ts:3876` — `body.workspace_id || Deno.env.get('WEEKLY_REPORTS_WORKSPACE_ID')`.

---

## 3. Modelo alvo (resumo; detalhe no plano v3)

**Tabela `workspace_integration_credentials`** (seção 5.1): `workspace_id`, `provider` (`ghl|meta|openrouter|notion|outbound_webhook`), `secret_key_id` (ref a `vault.secrets`, nunca plaintext), `metadata jsonb` (não sensível), `rotation_version int`, `updated_at`, `created_at`, `UNIQUE(workspace_id, provider)`. **RLS: só `service_role`** — teste negativo obrigatório (JWT `authenticated`, mesmo owner, **não** faz `SELECT`).

**Segredo via Vault** (`vault.create_secret` → `secret_key_id`; leitura via `vault.decrypted_secrets` apenas por `service_role`).

**Helper compartilhado** `supabase/functions/_shared/resolve-workspace-credentials.ts` (seção 5.3): `resolveGhlCredentials(workspaceId)` → `{ apiKey, locationId }`. Chave de cache `${workspaceId}:${provider}:${rotation_version}`, **relê `rotation_version` a cada request** (read leve de `int`) + **TTL curto (≤10s)**. SLA declarado pós-revogação: **≤10s**.

**Unicidade de `ghl_location_id`** (seção 3.5): `CREATE UNIQUE INDEX ... ON ghl_integration_settings(ghl_location_id) WHERE ghl_location_id IS NOT NULL AND is_active = true` + pré-checagem no fluxo.

**Fallback removido**: `get_workspace_id_by_ghl_location_id` deixa de cair no "mais antigo" → **retorna NULL / falha dura**; eventos não resolvidos vão para **dead-letter `webhook_unresolved`** (seção 10.4), nunca descarte silencioso.

**`webhook-ghl` (manual_byok)** (seção 5.4): extrai `locationId` do payload **antes** da autenticação → busca `webhook_secret` do workspace em `ghl_integration_settings` → **401 + dead-letter** se não houver match.

**`outbound_webhooks`** (seção 5.2): tabela com `workspace_id` + RLS + trigger com filtro explícito de `workspace_id` + **SSRF resolve-then-connect via edge function** (allowlist de destinos por tenant, deny-by-default).

---

## 4. Fatias (ordem de execução)

Cada fatia: **objetivo → mudanças → critério de pronto (teste) → risco → depende de**. Cada uma nasce **com seu teste** e **down-migration ensaiada**; a "suite consolidada" (fatia 9) é a agregação + kill-switch, não o único momento de teste.

### Onda 0 — Fundação (pré-requisitos)

**Fatia 0 — Vault habilitado e fumacento**
- **Objetivo:** ter onde guardar segredo por tenant com segurança.
- **Mudanças:** migration que garante a extensão Vault (`pgsodium`/`supabase_vault`) disponível e `vault.decrypted_secrets` legível por `service_role` (e **não** por `authenticated`); smoke test de `vault.create_secret` + leitura. Confirmar no projeto de **teste** que a extensão está presente (Supabase costuma ter; a migration antiga que dizia "não configurado" precisa ser reavaliada — pode ser só questão de grants).
- **Pronto:** `SELECT vault.create_secret('x')` retorna um id; `service_role` lê `vault.decrypted_secrets`; `authenticated` **não** lê.
- **Risco:** extensão indisponível no projeto de teste → bloqueia tudo. **Mitigação:** verificar logo no início; se indisponível, o plano inteiro é reavaliado (possível kill-switch de infra).
- **Depende de:** —

**Fatia 1 — Tabela `workspace_integration_credentials` + RLS + teste negativo**
- **Objetivo:** base de credencial por tenant.
- **Mudanças:** migration (DDL 5.1 com `rotation_version`/`updated_at`); `ENABLE RLS`; policy **só** para `service_role` (nenhuma para `authenticated`); índice por `(workspace_id, provider)`.
- **Pronto:** teste de integração — `service_role` faz CRUD; JWT `authenticated` (owner do workspace) **não** faz `SELECT` (negativo); `UNIQUE(workspace_id, provider)` rejeita duplicata.
- **Risco:** vazamento via PostgREST se policy errada → coberto pelo teste negativo.
- **Depende de:** Fatia 0.

**Fatia 2 — Helper `resolve-workspace-credentials` + teste unit**
- **Objetivo:** peça única que todas as funções usarão.
- **Mudanças:** `supabase/functions/_shared/resolve-workspace-credentials.ts` (GHL primeiro; Meta/OpenRouter/Notion na onda 3); cache `${workspaceId}:${provider}:${rotation_version}` com releitura de `rotation_version` por request + TTL ≤10s; falha **fechada** (throw) se não houver credencial — **sem** fallback a env global.
- **Pronto:** teste unit do helper (supabase mockado): resolve a chave certa por workspace; troca de `rotation_version` invalida o cache dentro do SLA; ausência de credencial → erro (não chave global).
- **Risco:** cache servir plaintext obsoleto → coberto pelo teste de revogação.
- **Depende de:** Fatia 1.

### Onda 1 — Roteamento correto (fecha o "mais antigo" silencioso)

**Fatia 3 — Unicidade de `ghl_location_id` + fim do fallback "mais antigo"**
- **Objetivo:** impedir roteamento deterministicamente errado.
- **Mudanças:** (a) migration com `CREATE UNIQUE INDEX ... ON ghl_integration_settings(ghl_location_id) WHERE ghl_location_id IS NOT NULL AND is_active = true` (seção 3.5) — **cuidado:** se já houver duplicata no banco de teste, a migration falha → pré-checar e resolver antes; (b) reescrever `get_workspace_id_by_ghl_location_id` para **retornar NULL** (não "mais antigo") quando sem match ou ambíguo; (c) tabela `webhook_unresolved` (dead-letter, seção 10.4) para eventos não resolvidos.
- **Pronto:** teste — inserir 2 workspaces com mesmo `ghl_location_id` ativo → rejeitado (23505); função retorna NULL (não o mais antigo) sem match; evento não resolvido cai em `webhook_unresolved`.
- **Risco:** quebrar o fluxo atual do cliente único se a função passar a retornar NULL onde hoje "sempre achava" → **mitigação:** como hoje há só 1 workspace com match exato, o caminho feliz não muda; o NULL só ocorre onde antes era fallback errado. Ainda assim, dead-letter garante não-perda.
- **Depende de:** Fatia 1 (ordem lógica; pode vir antes da 2 em paralelo se quiser destravar rápido).

### Onda 2 — Núcleo GHL (a parte mais arriscada)

**Fatia 4 — `ghl-api-worker` resolve credencial POR JOB (a mais crítica)**
- **Objetivo:** a fila central parar de usar uma chave global para todos.
- **Mudanças:** (a) migration adiciona `workspace_id` (ou `location_id`) em `ghl_api_jobs` (com backfill a partir de `context jsonb` quando possível; órfãos → quarentena/falha fechada, nunca fallback); (b) worker passa a resolver credencial **por job** via helper (Fatia 2), chaveado pelo tenant do job; (c) **guard fail-closed:** job sem tenant resolvido → erro + dead-letter, **nunca** chave global; (d) remove o `:256-258` que exige a env global.
- **Pronto:** teste — 2 jobs de tenants distintos usam chaves distintas (mock da API GHL captura o `Authorization`); job sem tenant resolvido → erro fechado (não chama a API); cliente atual (1 workspace) continua funcionando.
- **Risco:** **alto** — toca a fila que move tudo. **Mitigação:** fatia isolada, down-migration ensaiada, dead-letter, e teste de "chave certa por job" antes de qualquer deploy; cliente atual segue no caminho feliz.
- **Depende de:** Fatias 2 e 3.

**Fatia 5 — Refatorar funções GHL de sync para o helper (sub-fatiada)**
- **Objetivo:** cada sync parar de ler `GHL_API_KEY`/`GHL_LOCATION_ID` global.
- **Mudanças (em grupos de 2–3 por commit, para review):**
  - **Grupo A (escrevem CRM / caminho de venda):** `sync-contact-opportunities`, `reconcile-contact-opportunities`, `sync-appointment-dates`, `sync-contact-tasks`, `sync-ghl-conversations`, `sync-ghl-users`.
  - **Grupo B (recuperação/descoberta):** `recuperacao-prefetch` (remove o `.limit(1)` sem filtro), `recuperacao-corrigir`, `sync-recuperacao-stages`, `discover-ghl-config` (já recebe `workspace_id` — só troca a fonte da chave), `diag-ghl`.
  - Em cada uma: mover a resolução para **dentro do handler**, chaveada por `workspace_id` do payload/job; remover `GHL_LOCATION_ID || 'U8FTcw90CB5QELUnbGUu'`; falha fechada sem credencial.
- **Pronto (por grupo):** teste — chamada de cada função usa a chave do workspace do payload (mock captura `Authorization`/`locationId`); função recusa (não usa chave global) workspace sem credencial; cliente atual segue funcionando.
- **Risco:** reintroduzir "constante de módulo" por engano → coberto pelo teste de "qual chave foi usada" (seção 11).
- **Depende de:** Fatias 2 e 3 (e 4 para as que enfileiram jobs).

### Onda 3 — Inbound e outbound

**Fatia 6 — `webhook-ghl` por location (manual_byok) sem fallback**
- **Objetivo:** validar por sub-conta e virar falha dura.
- **Mudanças:** extrair `locationId` do payload **antes** da autenticação → buscar `webhook_secret` do workspace em `ghl_integration_settings` → **401 + dead-letter** se sem match (substitui `WEBHOOK_SECRET` global para o caminho GHL); manter `webhook-compras` fora do escopo desta fatia (seguindo prioridade GHL).
- **Pronto:** teste — payload com location conhecido + secret certo passa; secret errado ou location desconhecido → 401 e evento em `webhook_unresolved`; cliente atual segue passando.
- **Risco:** bloquear eventos legítimos numa janela de bug → dead-letter com reprocessamento (seção 10.4).
- **Depende de:** Fatia 3.

**Fatia 7 — `outbound_webhooks` (OpenClaw) com RLS + filtro de tenant + SSRF**
- **Objetivo:** tirar URL/token do SQL hardcoded e isolar por tenant.
- **Mudanças (3 etapas da seção 5.2):** (1) criar tabela `outbound_webhooks` + RLS (select `is_workspace_member`, write `is_workspace_admin`) e **popular** com os valores hoje hardcoded para o cliente atual (sem interrupção); (2) reescrever `processar_notificacao_openclaw_contrato_assinado()` para ler da tabela **com filtro explícito de `workspace_id`** do evento; (3) **SSRF resolve-then-connect via edge function** (allowlist de destinos por tenant, deny-by-default) em vez de `net.http_post` direto.
- **Pronto:** teste — 2 workspaces A/B cada um com seu webhook para `contrato_assinado`; evento em A → **só** o endpoint mock de A recebe (B recebe zero); host com DNS rebinding → destino interno recusado; cliente atual segue disparando.
- **Risco:** trigger `SECURITY DEFINER` roda fora de RLS → a defesa real é o filtro de `workspace_id` na query da trigger (coberto pelo teste).
- **Depende de:** Fatias 1 e 3.

### Onda 4 — Meta / OpenRouter / Notion (prioridade menor)

**Fatia 8 — Mesmo helper para Meta, OpenRouter e Notion**
- **Objetivo:** estender o isolamento além do GHL.
- **Mudanças:** generalizar o helper para `provider ∈ {meta, openrouter, notion}`; refatorar `sync-meta-ads*` (remove `META_ADS_WORKSPACE_ID`), `sync-ad-permalinks`, `bot-chat*`, `prevendas-ai`, `ai-ghl-mapping`, `notion-creatives-sync` para resolver por `workspace_id` (onde houver tenant no payload); falha fechada.
- **Pronto:** teste — chamada usa a chave do workspace certo por provedor; recusa sem credencial.
- **Risco:** menor que GHL (não escreve em CRM financeiro) — mas token de anúncios trocado é custo/compliance real.
- **Depende de:** Fatias 2 e 5 (helper validado no GHL primeiro).

### Onda 5 — Consolidação e critério de abandono

**Fatia 9 — Suite de isolamento de credenciais (seção 4.1) + kill-switch**
- **Objetivo:** agregar as provas e operar o critério de abandono.
- **Mudanças:** `__tests__/integration/credential-isolation.test.ts` (consolida): credencial certa p/ tenant certo (GHL/Meta/OpenRouter); revogação dentro do SLA (≤10s); isolamento de `outbound_webhooks`; teste negativo Vault; fallback "mais antigo" removido; rebinding SSRF; **nenhuma chamada externa real** (mock total — assert contra `net.http_post`/fetch real). Checklist do runbook (rotação no **provider upstream** como passo primário — seção 5.3.3).
- **Pronto:** suite verde; runbook de revogação documentado; **kill-switch (seção 10.2)** operacional: se após 2 ciclos ainda houver (a) vazamento de leitura cross-tenant ou (b) uso de chave de um workspace em chamada de outro → Fase 2 declarada inviável, pausa e mantém modelo de instância isolada.
- **Risco:** o próprio risco da Fase 2 não fechar → o kill-switch é a proteção honesta.
- **Depende de:** Fatias 4–8.

---

## 5. Ordem e justificativa

```
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9
fundação    roteamento  núcleo GHL  in/out  meta/..  suite
```

- **Fundação antes de tudo** (0–2): sem Vault/tabela/helper, nenhuma função pode resolver credencial por tenant.
- **Roteamento correto antes do worker** (3 → 4): o worker depende de saber o tenant do job; a unicidade/fim-do-fallback (3) fecha o vetor de roteamento errado antes de mexer na fila.
- **GHL antes de Meta/OpenRouter/Notion** (5 → 8): GHL escreve no CRM (maior risco); validar o helper no GHL primeiro reduz risco nas demais.
- **Suite consolidada por último** (9), mas **cada fatia já nasce com teste** — a 9 agrega e opera o kill-switch.

---

## 6. Riscos e mitigação (específicos desta execução)

| Risco | Mitigação |
|---|---|
| **Vault indisponível no projeto de teste** | Verificar na Fatia 0 antes de tudo; se indisponível, reavaliar o plano (possível kill-switch de infra). |
| **`ghl-api-worker` quebra o cliente atual** | Fatia isolada; caminho feliz do cliente único inalterado; fail-closed + dead-letter; down-migration ensaiada; teste "chave certa por job" antes de deploy. |
| **Unicidade de `ghl_location_id` falha por duplicata existente** | Pré-checar o banco de teste antes da migration; resolver duplicatas antes de aplicar. |
| **Cache serve credencial revogada** | Releitura de `rotation_version` por request + TTL ≤10s + teste de revogação com SLA; rotação primária no provider upstream. |
| **`outbound_webhooks` dispara para tenant errado** | Filtro explícito de `workspace_id` na query da trigger + teste dedicado (A dispara só A). |
| **Reintrodução de "constante de módulo"** | Teste que verifica **qual chave foi realmente usada** em cada chamada (seção 11 do plano). |
| **Perda de eventos em bug de resolução** | Dead-letter `webhook_unresolved` com reprocessamento (nunca descarte). |
| **Rollback por fatia** | Cada migration com down-migration ensaiada (seção 10.4); nenhuma vai a produção sem ensaio em staging. |

---

## 7. Critério de pronto da Fase 2 (gate) + kill-switch

**Gate (todos obrigatórios, no banco de teste):**
- Teste "credencial certa para o tenant certo" verde (GHL + Meta + OpenRouter), incluindo **teste de revogação** dentro do SLA (≤10s).
- Fallback "workspace mais antigo" **removido** e substituído por falha dura + dead-letter.
- Constraint de unicidade de `ghl_location_id` aplicada (seção 3.5).
- `outbound_webhooks` com RLS + filtro de tenant na trigger + SSRF resolve-then-connect.
- Teste negativo Vault (JWT `authenticated` não lê segredo).
- Suite da seção 4.1 verde, **sem chamada externa real**.

**Kill-switch (seção 10.2):** após **2 ciclos completos de correção**, se ainda houver (a) vazamento de leitura cross-tenant ou (b) uso de chave de um workspace em chamada de outro → **Fase 2 inviável** → pausar, não avançar para Fase 3+, manter modelo de instância isolada como padrão.

---

## 8. O que NÃO entra nesta fase

- **Fase 3 / POC da Agency API (seção 6.2):** o caminho `auto_discovered` do `webhook-ghl` (seção 5.4.2) fica para depois da POC; a Fase 2 implementa **só** `manual_byok` (modelo atual, confirmado).
- **Área `/agency/*` (Fase 5)** e UI de gestão.
- **Prova de posse de location (seção 3.5.1)** no fluxo BYOK: entra na Fase 4 (BYOK); aqui só a constraint de unicidade (3.5) e o fim do fallback.
- **Aplicação em produção:** fora do escopo até cada fatia passar por teste **e** staging com down-migration ensaiada (`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`).

---

## 9. Checklist de aval do dono

Antes de eu começar a Fatia 0, confirmar:

- [ ] Escopo **completo** (sem MVP) mantido — as 12+worker GHL + Meta/OpenRouter/Notion + outbound, não só o "crítico-para-1º-tenant".
- [ ] **Ordem** das ondas (fundação → roteamento → núcleo GHL → in/out → Meta/etc. → suite) faz sentido.
- [ ] **Tudo no banco de teste**, em branch separada; produção só depois de teste + staging com reversão ensaiada.
- [ ] **Kill-switch** aceito: se não fechar em 2 ciclos, para e mantém instância isolada.
- [ ] **Fatia 4 (worker da fila)** é a de maior risco — executar com atenção redobrada e teste de "chave certa por job" antes de qualquer deploy.

---

## 10. Referências

- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — seções 3.5, 4.1, 5.1–5.5, 10.2, 10.4, 11.
- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — decisão de escopo (completo) e status.
- [`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`](PIPELINE-TESTE-STAGING-PRODUCAO.md) — como uma migration chega a produção.
- Mapeamento do estado real (2026-07-10): relatório "Mapear edge functions e credenciais" (somente leitura), usado na seção 2 deste plano.
