# Handoff — Multi-tenant Agency (2026-07-11): estado completo para continuidade

> Documento de transferência para outra IA/sessão continuar o trabalho **sem precisar de
> contexto anterior**. Leia inteiro antes de agir. Tudo aqui é factual e verificado em 2026-07-11.
> **Supersede** `docs/HANDOFF-FASE-4-BYOK.md` (já marcado como histórico no índice do CLAUDE.md).

| Campo | Valor |
|-------|-------|
| **Branch atual** | `main` (tudo abaixo já está mergeado — não há branch de trabalho pendente) |
| **Último commit** | `76af3f8` |
| **Skill ativa** | `omnx-code` v1.10 — seguir o `CLAUDE.md`, criar tasks (`TaskCreate`) antes de agir, gate de versão da própria skill roda a cada ativação |
| **Idioma do dono** | português do Brasil, simples, sem jargão (é leigo em programação, quer velocidade e clareza) |
| **Suite de integração** | **313 passed \| 10 todo** (banco de TESTE `fgjbmdsucruvtpywyhhf`) |

---

## 1. Onde paramos (resumo de 30 segundos)

- **Fases 1, 2, 4 e 5 do plano multi-tenant: mergeadas em `main`** (PRs #14→#17, gate de segurança PASS). Nada em produção — só o histórico do GitHub mudou.
- **Vulnerabilidades npm pré-existentes corrigidas** (PR #18) — react-router RCE crítica e outras, sem breaking change.
- **Fase 6 (fatia 1): denormalização de `workspace_id`** em `oportunidades`/`comunicacoes`/`vendas_fechamento` — mergeada (PR #19).
- **Fase 3: POC real feita com token de agência de verdade** (não com staging — staging **não vai ser provisionado**, decisão do dono). Resultado: a descoberta de sub-contas funciona (`/locations/search`), mas ler admins por sub-conta exigiria dar ao token de agência o escopo **"Editar usuários"** — **o dono recusou** (risco demais numa credencial só). **Decisão: token de agência só serve pra listar sub-contas; todo dado de cada sub-conta (incl. usuários) vem da própria chave da sub-conta via BYOK (Fase 4, já pronta).**
- **Próximo passo, ainda NÃO iniciado:** construir de fato o `discover-agency-locations` (edge function + cron) que usa o token de agência (só leitura) pra achar sub-contas novas e criar um workspace `status='pending'` esperando o cliente conectar a própria chave. Ver seção 6.

---

## 2. Regras inegociáveis (não reabrir)

1. **TUDO no banco de TESTE** (`fgjbmdsucruvtpywyhhf`), via `.env.test`. **Produção (`qzesffnkqgelmtfblzkr`) NUNCA é conectada.** A suite aborta se apontar pra produção (`__tests__/helpers/safe-guard.ts`).
2. **Staging NÃO vai ser provisionado** (decisão do dono, 2026-07-11) — não sugerir isso de novo como próximo passo. O gate de performance real (volume de produção) fica sem caminho definido; POCs de comportamento de API (não de volume) rodam contra a API real como a Fase 3 fez.
3. **`.env.test` agora tem um token REAL de agência do GHL** (`GHL_AGENCY_API_TOKEN`, `GHL_AGENCY_COMPANY_ID`) — preenchido pelo dono para a POC da Fase 3. Continua fora do git (`.gitignore`). **Nunca** logar o valor do token em relatório/commit/print — só status HTTP e chaves do corpo, como o `scripts/poc-fase3-ghl-agency-api.ts` já faz.
4. **Token de agência do GHL é SÓ-LEITURA por decisão do dono** (seção 5). Nunca peça pra ele conceder escopo de edição/"Editar usuários" a esse token — já foi avaliado e recusado.
5. **Nunca** `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em código client-side.
6. **Modelo de IA** das edge functions `bot-chat`/`prevendas-ai`: **sempre `qwen/qwen3.6-plus`** via OpenRouter. Nunca `anthropic/*`/`openai/*`.
7. **Repositório sempre privado.**
8. **Git local-first, mas push já autorizado nesta sessão:** toda branch nova foi criada, commitada, enviada (`git push`), PR aberto e **mergeado em `main`** ao longo desta sessão (padrão repetido ~10x: branch → commit → push → `gh pr create` → `gh pr merge --merge --delete-branch=false`). Continue esse padrão a menos que o dono peça outra coisa.
9. **Gate de segurança (regra 1.6 do CLAUDE.md/OMNX) antes de qualquer merge em `main`:** rodar (ou já ter rodado nesta sessão) a `/security-auditor`, ler `security-report/verdict.json`, exigir `gate: PASS`. `security-report/` **não é versionado** (`.gitignore`) — só existe localmente na máquina onde a auditoria rodou. Se você é uma sessão/máquina nova, **rode a auditoria de novo** antes do próximo merge em `main` — o `verdict.json` de 2026-07-11 não persiste entre sessões/máquinas diferentes.
10. **`analises/relatorio-permissoes-apps-2026-07-08.{html,md}` ficam UNTRACKED SEMPRE.** Antes de todo commit: `git add` seletivo pelos caminhos e confirmar `git diff --cached --name-only | grep -E 'analises/relatorio' || echo OK`.
11. Documentação técnica em `docs/` + entrada no índice do `CLAUDE.md` (com "Atualizado em"). Commits em **Conventional Commits** com corpo `Contexto/Mudancas/Impacto-Testes`.

---

## 3. Ambiente e comandos exatos

### 3.1 Banco de teste (aplicar migration via psql)

```bash
PSQL=/opt/homebrew/opt/libpq/bin/psql
DBURL=$(grep -E '^TEST_DB_URL=' .env.test | sed -E 's/^TEST_DB_URL=//' | tr -d '"' | tr -d "'")
$PSQL "$DBURL" -v ON_ERROR_STOP=1 -f supabase/migrations/<arquivo>.sql
# sanitizar qualquer saída que possa conter a URL:
# sed -E 's#postgres(ql)?://[^@]*@#postgresql://***@#g'
```

### 3.2 Suite de integração

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run            # suite toda (313 passed | 10 todo)
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run __tests__/integration/<arquivo>.test.ts
```

### 3.3 Frontend (eb-dash2)

```bash
cd eb-dash2 && npx tsc -b        # typecheck
cd eb-dash2 && npm run build     # tsc -b && vite build
cd eb-dash2 && npx vitest run --exclude "**/.claude/**"   # suite unitária/componente (22 passed) — CUIDADO: sem o --exclude, pega worktrees antigos de outra sessão em .claude/worktrees/
```

### 3.4 Gate de tipos das edge functions (Deno)

`deno check <arquivo>` (deno 2.9.2 em `/opt/homebrew/bin/deno`). Critério: **ZERO erro novo**.

### 3.5 POC da Agency API do GHL (script já pronto, reaproveitável)

```bash
npx tsx scripts/poc-fase3-ghl-agency-api.ts
```
Lê `GHL_AGENCY_API_TOKEN`/`GHL_AGENCY_COMPANY_ID`/`GHL_TEST_LOCATION_ID_*` de `.env.test`. Chama `/locations/search` de verdade na API do GHL (não é mock) — nunca loga o token.

---

## 4. Arquitetura chave (o que já existe, por fase)

### Fase 2 — credenciais por workspace (Vault)
- Tabela `workspace_integration_credentials(workspace_id, provider, secret_key_id uuid→vault, metadata, rotation_version)`. RLS/GRANT: **só `service_role`**.
- Helper Deno `supabase/functions/_shared/resolve-workspace-credentials.ts`: `resolveWorkspaceCredential(service, workspaceId, provider)`, fail-closed, cache por `rotation_version`.
- **Armadilha:** `auth.uid()` é NULL quando o client é `service_role`. RPCs self-service só funcionam com JWT de usuário real.

### Fase 4 — BYOK self-service
- RPC `save_workspace_credential(workspace_id, provider, secret, metadata)` — guarda `is_workspace_admin`, retorna só `rotation_version`.
- UI `eb-dash2/src/pages/workspace/WorkspaceIntegrationsPage.tsx` (`/workspace/integracoes`) — cliente cola a própria chave GHL/Meta.
- Edge function `test-workspace-credential` — botão "Testar conexão", valida a chave contra a API do provedor sem nunca ecoar o segredo.

### Fase 1/5 — modelo Agency + gestão
- Tabelas `agencies`, `agency_members`, `agency_workspaces` (status: `active`/`suspended`/`pending`).
- `is_agency_member`/`is_agency_admin`/`can_access_workspace_via_agency` — **corrigidas em 2026-07-10** pra usar `(SELECT auth.uid())` (achado real da auditoria de segurança, melhora performance sem mudar semântica).
- RPCs `suspend_agency_workspace`/`reactivate_agency_workspace` (reativação exige `p_confirmed=true` — nunca automática).
- Frontend: `/agency/workspaces` (`AgencyRoute` guard via `useMyAgencies()`, nunca visível pro cliente atual single-tenant).
- `invite-user` aceita também admin/owner de agência dona de uma sub-conta `active` (fallback quando o caller ainda não é `workspace_members`).

### Fase 6 (fatia 1) — denormalização do CRM
- `oportunidades`/`comunicacoes`/`vendas_fechamento` ganharam coluna `workspace_id` (NOT NULL, trigger `BEFORE INSERT` preenche automaticamente). RLS **continua no join** (reescrever pra coluna é otimização opcional, não feita).
- **Pendente da Fase 6:** ~12 tabelas `workspace_id` nullable (`meta_ads_*`/`weekly_*`) + ~20-25 tabelas de infraestrutura — não iniciado.

### Fase 3 — descoberta de sub-contas (decisão tomada, implementação NÃO iniciada)
- POC confirmou: `GET /locations/search?companyId={id}` funciona com Private Integration Token de agência, lista todas as sub-contas de uma vez (testado: 5 sub-contas reais retornadas).
- `GET /users/?locationId=` retorna 401 `"Token's user type mismatch!"` — exigiria escopo "Editar usuários", **recusado pelo dono**.
- **Decisão:** token de agência só para listar sub-contas; dado de cada sub-conta (incl. usuários) sempre via BYOK da própria sub-conta.
- Script de referência: `scripts/poc-fase3-ghl-agency-api.ts`.

---

## 5. Decisões do dono (NÃO reabrir)

- Staging **não será provisionado**. Não sugerir de novo.
- Token de agência do GHL fica **só-leitura** (nunca pedir escopo de edição de usuários) — dado de cada sub-conta vem sempre de BYOK por sub-conta.
- PRs antigos #12 (auto-fechado pelo GitHub, conteúdo já mergeado) e #13 (`chore/ci-isolation-suite`, ainda aberto) — **não mexer**, decisão explícita de deixar como está.
- Merge das PRs desta sessão foi feito com `--merge` (merge commit, não squash), branches **não deletadas** (`--delete-branch=false`) — mantém rastreabilidade.

---

## 6. Próximo passo concreto (em ordem) — construir `discover-agency-locations`

Isso **não foi iniciado** ainda. Plano já desenhado, pronto pra implementar:

### 6.1 Migration `agency_ghl_credentials` (Vault, mesmo padrão de `workspace_integration_credentials`)
```sql
CREATE TABLE public.agency_ghl_credentials (
  agency_id UUID UNIQUE REFERENCES public.agencies(id),
  secret_key_id UUID NOT NULL,  -- ponteiro pro vault
  company_id TEXT NOT NULL,
  rotation_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: só service_role (igual workspace_integration_credentials)
```

### 6.2 RPC self-service `save_agency_ghl_credential(p_agency_id, p_token, p_company_id)`
Espelha `save_workspace_credential` exatamente: guarda `is_agency_admin(p_agency_id)`, `vault.create_secret` + upsert, retorna só `rotation_version`. Permite o dono da agência colar o próprio token de agência pela UI (em vez de eu inserir via SQL/env).

### 6.3 Edge function `discover-agency-locations`
- Loop `SELECT DISTINCT agency_id FROM agency_ghl_credentials` (mesmo padrão dos crons de Meta/Notion por workspace já existentes).
- Resolve o token via helper (mirror de `resolveWorkspaceCredential`, mas por `agency_id` — criar `resolveAgencyCredential` ou generalizar o helper existente).
- Chama `GET /locations/search?companyId=` (endpoint confirmado funcionando na POC).
- Para cada `locationId` novo (comparar com `agency_workspaces.ghl_location_id` já existentes):
  - Se já existe com `status='suspended'` → **não reconecta automaticamente** (seção 3.6 do plano-mãe) — só sinaliza pendência.
  - Se colide com `ghl_location_id` ativo em OUTRA agência → bloqueado pela constraint de unicidade já existente (Fase 2/fatia 3) — vira alerta, não falha silenciosa.
  - Caso contrário: cria workspace via `create_workspace_with_owner` (owner = dono da agência) + insere `agency_workspaces` (`provisioning_mode='auto_discovered'`, `status='pending'`).
- **Nunca** chama `/users/` (decisão da seção 5) — não tenta descobrir admin automaticamente.

### 6.4 Cron
Mirror do padrão já usado (`20260728000000_fase8_meta_crons_por_workspace.sql` etc.) — `pg_cron` chamando a edge function via `net.http_post` periodicamente (ex.: a cada 6h).

### 6.5 Frontend
Na área `/agency/workspaces`, sub-contas com `status='pending'` mostram um card **"Conecte a chave desta sub-conta"** (não um painel de aprovação de admin — isso foi descartado, seção 5).

### 6.6 Testes
Seguir o padrão de `agency-admin-rpcs.test.ts` (RPC self-service) + um teste estrutural pra `discover-agency-locations` (grep-based, confirmando que NUNCA chama `/users/` nem tenta ler admin — isso seria uma regressão da decisão da seção 5).

---

## 7. Armadilhas conhecidas (já depuradas)

- **`auth.uid()` sem `(SELECT ...)`** nas funções de RLS de agência já foi corrigido (2026-07-10) — se criar função de RLS nova, **sempre** usar `(SELECT auth.uid())`.
- **`vault.create_secret` tem `UNIQUE(name)`** — sempre usar nonce (`gen_random_uuid()`) no nome do segredo.
- **service_role não chama RPC self-service** (`auth.uid()` NULL) — teste com JWT de usuário real.
- **`npx vitest run` da raiz sem `--exclude`** pega worktrees antigos deixados por workflows de sessões passadas em `.claude/worktrees/` — sempre rodar de dentro de `eb-dash2/` ou com `--exclude "**/.claude/**"`.
- **Inserir em `oportunidades`/`comunicacoes`/`vendas_fechamento` em teste** dispara triggers reais (sync GHL, webhook OpenClaw, auto-tag) — usar os guards documentados em `fase6-denormalizacao-crm-workspace-id.test.ts` (`data_lead_recebido` preenchido, `direction='outbound'`, `op_link_do_contrato_assinado` omitido) pra não disparar efeito colateral.
- **`git checkout -b` sempre ANTES de editar** — nesta sessão, uma vez as edições de doc ficaram soltas em `main` por engano antes de eu perceber; sempre confirmar `git branch --show-current` antes de editar.

---

## 8. Como validar antes de reportar ao dono

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run   # esperado: 313 passed (ou mais)
cd eb-dash2 && npx tsc -b && npm run build
git status --short | grep '^??'   # deve listar SÓ analises/relatorio-* (untracked)
```
Reporte em pt-BR simples: o que ficou provado (números), hash do commit, e o próximo passo.

---

## 9. Referências

- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) v3 — plano-mãe (seção 6 tem a nota de atualização da decisão da Fase 3; seção 10.0 tem a tabela de status completa).
- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — status por fase e log de execução completo, atualizado a cada passo desta sessão.
- [`docs/FASE-3-POC-RESULTADOS.md`](FASE-3-POC-RESULTADOS.md) — resultado real da POC + decisão do dono sobre o token de agência.
- [`docs/FASE-5-AGENCY-UI.md`](FASE-5-AGENCY-UI.md), [`docs/FASE-6-DENORMALIZACAO-CRM.md`](FASE-6-DENORMALIZACAO-CRM.md) — detalhe técnico de cada fatia entregue.
- [`docs/PLANO-FASE-4-BYOK-SELF-SERVICE.md`](PLANO-FASE-4-BYOK-SELF-SERVICE.md), [`docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md`](PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md) — fundação de credenciais (reaproveitar o mesmo padrão pra `agency_ghl_credentials`, seção 6 acima).
- `scripts/poc-fase3-ghl-agency-api.ts` — script de POC, reaproveitável como ponto de partida da edge function `discover-agency-locations`.
