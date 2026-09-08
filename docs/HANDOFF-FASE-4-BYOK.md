# Handoff — Fase 4 (BYOK self-service) e estado do projeto multi-tenant

> ⚠️ **HISTÓRICO/SUPERADO (2026-07-10 BRT).** Este handoff foi escrito quando faltava a Fatia 4
> ("Testar conexão") — ela **já foi entregue** (commit `df416a2`), e a Fase 5 (MVP da área
> `/agency/*`) **também já foi entregue** (commit `beb0721`), ambas ainda só no banco de TESTE.
> Para o estado atual e os próximos passos reais, use sempre
> [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) (log de execução, seção 6) e
> [`docs/MUDANCAS.md`](MUDANCAS.md) (entrada de 2026-07-10). O conteúdo abaixo é mantido só como
> registro histórico de arquitetura/armadilhas (seções 3, 4 e 7 continuam válidas).

> Documento de transferência para outra IA continuar o trabalho **sem precisar de contexto anterior**.
> Leia inteiro antes de agir. Tudo aqui é factual e verificado em 2026-07-10.

| Campo | Valor |
|-------|-------|
| **Branch atual** | `feat/multi-tenant-fase-4-byok` (criada a partir de `feat/multi-tenant-fase-2-credenciais`) |
| **Último commit** | `2ad5b41` (UI "Chaves de API" — Fase 4/Fatia 2) |
| **Atualizado em** | 2026-07-10 BRT |
| **Skill ativa** | `omnx-code` — seguir o `CLAUDE.md` e criar tasks (TodoList) antes de agir |
| **Idioma do dono** | português do Brasil, simples, sem jargão (ele é leigo e quer velocidade) |

---

## 1. Onde paramos (resumo de 30 segundos)

- **Fase 2 (isolamento de credenciais por workspace): COMPLETA no banco de teste.** 9 fatias entregues, **285 testes verdes**, 0 vazamento cross-tenant. Cada cliente (workspace) passa a usar a **própria chave** (GHL/Meta/Notion) via Vault, em vez de uma chave global.
- **Fase 4 (BYOK — cliente cadastra a própria chave via UI): fatias 1 e 2 entregues no teste.**
  - Fatia 1: "porteiro" seguro (RPC `save_workspace_credential`).
  - Fatia 2: tela "Chaves de API" (GHL + Meta) na Sidebar da Administração.
- **Faltam na Fase 4:** botão "Testar conexão" (Fatia 4 do plano), link de intake para terceiro (Fatia 3, condicionada à Fase 5), e a **migração da chave atual no cutover** (ver seção 7).

---

## 2. Regras inegociáveis (não reabrir)

1. **TUDO no banco de TESTE** (`fgjbmdsucruvtpywyhhf`), via `.env.test`. **Produção (`qzesffnkqgelmtfblzkr`) NUNCA é conectada.** A suite aborta se apontar para produção (`__tests__/helpers/safe-guard.ts`).
2. **Nunca** `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em código client-side.
3. **Modelo de IA** das edge functions `bot-chat`/`prevendas-ai`: **sempre `qwen/qwen3.6-plus`** via OpenRouter. Nunca `anthropic/*`/`openai/*` (custo).
4. **Repositório sempre privado.** Nunca `gh repo edit --visibility public`.
5. **Git local-first:** pode criar branch, editar, commitar localmente. **Push da branch de trabalho já está autorizado.** **NÃO** abrir PR, **NÃO** fazer push em `main`, **NÃO** merge/rebase em branch compartilhada sem pedido explícito do dono.
6. **`analises/relatorio-permissoes-apps-2026-07-08.{html,md}` ficam UNTRACKED SEMPRE.** Antes de todo commit: `git add` seletivo pelos caminhos e confirmar `git diff --cached --name-only | grep -E 'analises/relatorio' || echo OK`.
7. **Documentação técnica em `docs/`** + entrada no índice do `CLAUDE.md` (com "Atualizado em"). Commits em **Conventional Commits** com corpo `Contexto/Mudancas/Impacto/Testes`.

---

## 3. Ambiente e comandos exatos

### 3.1 Banco de teste (aplicar migration via psql)

```bash
# psql (Apple Silicon / Homebrew libpq)
PSQL=/opt/homebrew/opt/libpq/bin/psql

# extrair a URL sem expor o segredo (nunca cat/Read do .env.test)
DBURL=$(grep -E '^TEST_DB_URL=' .env.test | sed -E 's/^TEST_DB_URL=//' | tr -d '"' | tr -d "'")

# aplicar uma migration
$PSQL "$DBURL" -v ON_ERROR_STOP=1 -f supabase/migrations/<arquivo>.sql

# sanitizar qualquer saída que possa conter a URL
# sed -E 's#postgres(ql)?://[^@]*@#postgresql://***@#g'
```

### 3.2 Suite de integração (vitest contra o banco de teste)

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run            # suite toda
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run __tests__/integration/<arquivo>.test.ts  # um arquivo
```
Estado esperado hoje: **285 passed | 10 todo**. Helpers em `__tests__/helpers/supabase-test-client.ts`.

### 3.3 Frontend (eb-dash2)

```bash
cd eb-dash2 && npx tsc -b        # typecheck
cd eb-dash2 && npm run build     # tsc -b && vite build
npm run dev                      # porta 3222
```

### 3.4 Gate de tipos das edge functions (Deno)

Quando tocar em `supabase/functions/**`: comparar contagem de `TS[0-9]{4}` antes/depois com `deno check` (deno 2.9.2 em `/opt/homebrew/bin`). Critério: **ZERO erro novo**. Para TS2345 por client cross-version, usar cast localizado `sb as unknown as Parameters<typeof resolveWorkspaceCredential>[0]`.

---

## 4. Arquitetura chave da Fase 2/Fase 4 (o que já existe)

- **Tabela** `public.workspace_integration_credentials(workspace_id, provider text, secret_key_id uuid→vault, metadata jsonb, rotation_version int, updated_at, created_at)`, `UNIQUE(workspace_id, provider)`. **RLS/GRANT: só `service_role`** (nem o owner lê).
- **RPCs (service_role-only):** `get_workspace_credential_meta(uuid,text)` (metadados, leve, chamada a cada request) e `get_decrypted_secret(uuid)` (decifra, só no cache-miss).
- **RPCs self-service (GRANT TO authenticated, com guarda `is_workspace_admin`):** `save_workspace_credential(workspace_id, provider, secret, metadata)→int` (vault + upsert, retorna **só** `rotation_version`) e `get_workspace_credential_status(workspace_id)→table(provider, rotation_version, metadata, updated_at)` (sem segredo).
- **Helper Deno** `supabase/functions/_shared/resolve-workspace-credentials.ts`: `resolveWorkspaceCredential(service, workspaceId, provider)` com `provider ∈ {ghl, meta, openrouter, notion}`, retorna `{apiKey, rotationVersion, metadata}`, cache por `rotation_version` (TTL ≤10s), `CredentialResolutionError` (fail-closed, sem env global). `resolveGhlCredentials` é atalho.
- **Vault:** `vault.create_secret(secret, name, description)` tem **UNIQUE(name)** (`secrets_name_idx`) — por isso o nome leva um nonce `gen_random_uuid()` (cada rotação cria segredo novo; o antigo fica órfão/inacessível — housekeeping futuro).
- **`auth.uid()` é NULL para service_role.** Logo, a RPC self-service **só funciona com JWT de usuário real** (é o esperado — é o cliente logado). Operador via SQL service_role usa INSERT direto (runbook de seed), não a RPC.

---

## 5. Decisões do dono (NÃO reabrir)

- A chave de cada cliente **é cadastrada pelo próprio cliente, via UI** — não pelo operador via SQL.
- **Notion descontinuado** → fora da UI (a RPC ainda aceita `notion` por compatibilidade; não remover à toa).
- UI com **GHL e Meta**; aba **"Chaves de API" na Sidebar** da Administração (`WorkspaceLayout`), rota `/workspace/integracoes`.
- A **chave ATUAL** do workspace (hoje em env global / `ghl_integration_settings`) **não pode ser perdida** — há dados legados pendurados nela. Ela será **migrada para o cofre no cutover** (passo do operador/script), **não** pela UI.
- `sync-meta-ads-backfill` (carga histórica) é **residual de-scoped** (grava `workspace_id` NULL) — o dono priorizou o fluxo "pra frente" (100% isolado). Não mexer salvo pedido.

---

## 6. Próximos passos concretos (em ordem)

### 6.1 Fatia 4 do plano F4 — "Testar conexão" / prova de posse (PRÓXIMA)
- **Por quê:** validar a chave na hora melhora UX e fecha "location squatting"/erro de digitação (seção 3.5.1 do plano v3).
- **Como:** edge function server-side `test-workspace-credential` (não expõe a chave no browser e contorna CORS):
  - recebe `{ workspace_id, provider }` (ou a chave ainda não salva), valida JWT do chamador + `is_workspace_admin`;
  - busca a chave via `resolveWorkspaceCredential` (ou usa a recebida) e chama a API do provedor:
    - GHL: `GET https://services.leadconnectorhq.com/locations/{location_id}` com `Authorization: Bearer <token>` + header `Version` — confirma que o `location_id` retornado == metadata;
    - Meta: `GET https://graph.facebook.com/vX/act_{ad_account_id}` com o token — confirma a conta.
  - retorna `{ ok: true }` ou erro amigável; **nunca** ecoa a chave.
- **Teste:** grep-based no fonte (chama a URL certa, não ecoa segredo) + unit do handler com fetch mockado.
- **UI:** ligar o botão "Testar conexão" em `WorkspaceIntegrationsPage.tsx`.

### 6.2 Cutover em produção (QUANDO o dono pedir "ligar em produção")
- Pré-requisito: cadastrar a credencial do workspace atual em `workspace_integration_credentials` (senão as funções por workspace falham fechado e os crons viram no-op).
- Caminho: runbook `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md` (operador) OU um script de migração que lê a config atual e grava no cofre do workspace (preservar a chave atual — dados legados). Validar no **staging** antes (`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`). Nunca SQL manual em produção; migration versionada, uma fase por vez, com aval do dono.

### 6.3 Fatia 3 do plano F4 — link de intake para terceiro (DEPOIS da Fase 5)
- Edge function `byok-secret-intake` (token 128 bits, expiração 1h, uso único, step-up por e-mail verificado) + página isolada (seção 7.1 do plano v3). Para sub-conta de outra agência sem login. **Não bloqueia** o self-service.

---

## 7. Armadilhas conhecidas (já depuradas)

- **`secrets_name_idx`:** `vault.create_secret` falha em nome duplicado → usar nonce no nome (já corrigido na migration `20260731000000`).
- **service_role não chama a RPC self-service** (auth.uid() NULL) → testes usam `getAuthenticatedClient` (JWT real), não `getServiceClient`.
- **Frontend `supabase.rpc(...)`:** o projeto chama RPCs direto (sem cast) e compila; manter o padrão.
- **`credential-isolation.test.ts`** auto-exclui o próprio arquivo no assert "nenhum teste dispara HTTP para edge function" (senão se auto-flaga).

---

## 8. Como validar antes de reportar ao dono

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run   # esperado: 285 passed (ou mais)
cd eb-dash2 && npx tsc -b && npm run build
git status --short | grep '^??'   # deve listar SÓ analises/relatorio-* (untracked)
```
Reporte em pt-BR simples: o que ficou provado (números), hash do commit, e o próximo passo.

---

## 9. Referências

- [`docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md`](PLANO-FASE-4-BYOK-SELF-SERVICE.md) — plano desta fase (fatias 1–4).
- [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md) — fundação (tabela + vault + helper).
- [`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`](FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md) — cadastro via operador (cutover).
- [`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`](FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md) — revogação/kill-switch.
- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — status por fase e log de execução.
- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — plano-mãe (seções 3.5.1, 7, 7.1 para BYOK).
- [`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`](PIPELINE-TESTE-STAGING-PRODUCAO.md) — como uma migration chega a produção.
