# Plano de Execução — Fase 4: BYOK self-service (cliente cadastra a própria chave)

| Campo | Valor |
|-------|-------|
| **Versão** | 0.2 |
| **Atualizado em** | 2026-07-10 BRT |
| **Status** | 🟡 Em execução (Fatias 1, 2 e 4 entregues no teste; faltam Fatia 3 e o cutover) |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — seções 7 e 7.1 (BYOK) |
| **Decisão do dono** | A chave de cada cliente **deve ser cadastrada pelo próprio cliente**, de forma **visual e fácil via UI** — não pelo operador via SQL |
| **Branch** | `feat/multi-tenant-fase-4-byok` (a partir de `feat/multi-tenant-fase-2-credenciais`) |
| **Onde roda** | **Banco de TESTE** (`fgjbmdsucruvtpywyhhf`), via `.env.test`. Produção nunca é conectada. |

> Este plano transforma a fundação da Fase 2 (cofre/Vault + leitura service_role-only) em uma **porta de entrada self-service**: o admin do workspace cola a chave na tela, ela vai direto para o cofre, e ninguém (nem ele) lê de volta.

---

## 1. O que já existia e o que faltava

- **Já existia:** a seção 7/7.1 do plano v3 descreve o BYOK, mas com foco no caso de **sub-conta de terceiro** (outra agência) — onde o dono da sub-conta **não tem login** no Empire e precisa de um **link de intake de uso único** (token 128 bits, expiração 1h, step-up por e-mail verificado, prova de posse do location). O desenho é bom e fica preservado para esse caso.
- **O que faltava (e o dono pediu):** o caso **self-service autenticado** — o admin do workspace, já logado, cadastra a **própria** chave na tela. É mais simples e mais seguro (sem link/token, porque a identidade já é a sessão autenticada) e cobre o cliente atual (single-tenant) e qualquer workspace com admin logado.

**Duas vias de cadastro, casos distintos:**

| Via | Quem usa | Identidade | Quando |
|-----|----------|-----------|--------|
| **Self-service autenticado** (este plano) | admin/owner do workspace logado | sessão (JWT) + `is_workspace_admin` | cliente atual + qualquer workspace com login |
| **Link de intake** (seção 7.1, fatia 3) | dono de sub-conta de terceiro, sem login | token de uso único + step-up | BYOK de outra agência |

---

## 2. Fatias

### Fatia 1 — Porteiro seguro: RPC `save_workspace_credential` (EM EXECUÇÃO)
- **Objetivo:** a ÚNICA via de escrita de credencial por workspace, com checagem de papel.
- **Mudanças:** migration com duas RPCs `SECURITY DEFINER`:
  - `save_workspace_credential(workspace_id, provider, secret, metadata)` → guarda `is_workspace_admin` (42501 se não-admin), valida provider ∈ {ghl, meta, notion}, `vault.create_secret` + upsert com `rotation_version+1`, **retorna só `rotation_version` (int)** — nunca o segredo.
  - `get_workspace_credential_status(workspace_id)` → admin-only; retorna `(provider, rotation_version, updated_at, metadata)` para a UI saber "conectado/não" sem ler segredo.
  - `GRANT EXECUTE TO authenticated` (a segurança é a guarda interna); `anon` de fora.
- **Pronto:** teste — não-admin/outro workspace ⇒ erro; admin ⇒ roundtrip no vault (sem plaintext) + `rotation_version`; salvar de novo ⇒ rota (versão sobe); provider inválido ⇒ erro; retorno nunca contém o segredo.
- **Risco:** abrir EXECUTE para `authenticated` → mitigado pela guarda `is_workspace_admin` + teste negativo.
- **Depende de:** Fase 2 (tabela + vault).

### Fatia 2 — UI "Chaves de API" no `eb-dash2` (✅ ENTREGUE no teste em 2026-07-10)
- **Decisões do dono:** aba **"Chaves de API" na Sidebar** da área de Administração (`WorkspaceLayout`); provedores **GHL e Meta** (Notion descontinuado — fora da UI); a **chave atual** do workspace é preservada (dados legados) — migração env→cofre fica para o cutover, não para a UI.
- **Mudanças:**
  - `eb-dash2/src/hooks/useWorkspaceCredentials.ts` — `useCredentialsStatus` (lê `get_workspace_credential_status`) + `useSaveCredential` (chama `save_workspace_credential`), TanStack Query.
  - `eb-dash2/src/pages/workspace/WorkspaceIntegrationsPage.tsx` — card por provedor (GHL/Meta): status Conectado/Não conectado, metadata atual, campo de chave (password, com mostrar/ocultar), campo de metadata, botão Salvar; a chave **nunca** reaparece (limpa ao salvar).
  - Rota `/workspace/integracoes` (admin/owner via `AdminRoute` + `WorkspaceLayout`) em `App.tsx` + item na Sidebar.
- **Pronto:** `tsc -b` e `vite build` verdes; admin salva a chave e vê "Conectado"; a chave não reaparece. (Validação funcional ponta a ponta no browser fica para staging.)
- **Botão "Testar conexão"** ficou fora desta fatia (exige edge function server-side para não expor a chave no browser/CORS) → Fatia 4.
- **Depende de:** Fatia 1.

### Fatia 3 — Link de intake para terceiro (seção 7.1) — DEPOIS
- Edge function `byok-secret-intake` (token 128 bits, expiração 1h, uso único, step-up por e-mail verificado) + página isolada. Para o caso de sub-conta de outra agência sem login. **Não** bloqueia o self-service.
- **Depende de:** Fase 5 (área `/agency/*`) para o operador gerar o link.

### Fatia 4 — Prova de posse / "Testar conexão" (seção 3.5.1) — ✅ ENTREGUE no teste em 2026-07-10
- Edge function `supabase/functions/test-workspace-credential/index.ts`: valida JWT + owner/admin do workspace, resolve a credencial via `resolveWorkspaceCredential` (fail-closed) e chama a API do provedor — GHL `GET /locations/{locationId}` (confirma `id` retornado == `location_id` cadastrado) ou Meta `GET /act_{ad_account_id}?fields=id,name` (confirma `id` retornado == conta cadastrada). Responde sempre `{ ok, error? }`, **nunca** ecoa a chave nem o corpo cru do provedor.
- Lógica de interpretação isolada em módulo puro `supabase/functions/_shared/test-workspace-credential-logic.ts` (sem imports Deno/esm), testável em Node — segue o padrão já usado em `_shared/webhook-ghl-auth.ts`.
- UI: botão "Testar conexão" em `WorkspaceIntegrationsPage.tsx` (visível só quando conectado) + hook `useTestConnection` em `useWorkspaceCredentials.ts` (chama a edge function via `supabase.functions.invoke`).
- **Pronto:** `__tests__/integration/test-workspace-credential.test.ts` (15 provas: unit puro de interpretação de resposta + garantias estruturais — checa admin antes de chamar o provedor, resolve credencial fail-closed, nunca coloca `apiKey` em uma resposta); suite completa **301 verdes | 10 todo** (era 285); `tsc -b`/`vite build` verdes; `deno check` sem erro novo.
- Fecha squatting/erro de digitação. **Não bloqueante** para o self-service do cliente atual (o `location_id` já existe) — vira **obrigatória** quando a Fatia 3 (cadastro de location de terceiro) existir.
- **Depende de:** Fatia 2 (botão) e Fatia 3 (cadastro de location de terceiro, para o caso obrigatório).

---

## 3. Ordem e justificativa

```
1 (porteiro) → 2 (UI) → 3 (link terceiro) / 4 (prova de posse)
```

O porteiro (1) é o núcleo de segurança e independe de decisões de UI — vem primeiro. A UI (2) é o que o dono vê e exige aval de onde encaixar. As fatias 3 e 4 cobrem o caso de sub-conta de terceiro e não bloqueiam o self-service.

---

## 4. Critério de pronto da Fase 4 + cutover

- Fatia 1 verde no teste (RPC admin-only + roundtrip vault + rotação + negativos).
- Fatia 2: admin cadastra a chave pela tela, vê "Conectado", chave nunca reaparece.
- Fatia 4: admin clica "Testar conexão" e vê confirmação/erro amigável, sem a chave aparecer em tela/console.
- **Cutover em produção:** só via `docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`. A Fase 2 já exige que a credencial exista para as funções por workspace funcionarem — com a Fatia 1+2, o próprio cliente faz isso pela tela, sem operador.

---

## 5. Referências

- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — seções 7, 7.1, 3.5.1.
- [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md) — fundação (tabela + vault + helper).
- [`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`](FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md) — cadastro via operador (vira caminho interno de contingência).
- [`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`](FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md) — revogação/kill-switch.
