# Hardening de Segurança

> **Atualizado em:** 2026-07-08 15:14 BRT  
> **Branch:** `fix/security-hardening-omnx`  
> **Objetivo:** eliminar exposição de secrets, ativar RLS nas tabelas de dados e administrativas e tornar o isolamento por workspace confiável.

---

## 1. Resumo das Mudanças

Esta fase trata os riscos críticos encontrados na auditoria de segurança:

- Secrets reais commitados no repositório.
- RLS inexistente em `contatos`, `oportunidades`, `comunicacoes` e `vendas_fechamento`.
- `ghl_users` sem RLS efetivo.
- RPCs `get_creative_metrics` e `get_max_creative_number` sem validação de workspace membership.
- Edge function `sync-ghl-users` sem autenticação.
- Edge function `workspace-apps` com fallback perigoso de "primeiro workspace ativo".

---

## 2. Secrets — O que foi removido do working tree

Os seguintes arquivos tiveram valores reais de tokens/chaves substituídos por variáveis de ambiente ou placeholders:

| Arquivo | Tipo de secret | Mitigação |
|---------|----------------|-----------|
| `Guzela/import_leads.py` | `SUPABASE_SERVICE_ROLE_KEY` | `os.environ.get("SUPABASE_SERVICE_ROLE_KEY")` |
| `Guzela/sync-evento-contacts.py` | `SUPABASE_SERVICE_ROLE_KEY` | `os.environ.get("SUPABASE_SERVICE_ROLE_KEY")` |
| `scripts/backfill-comunicacoes.py` | `SUPABASE_ANON_KEY` | `os.environ.get("SUPABASE_ANON_KEY")` |
| `scripts/cami-evento-growth-mai26.mjs` | `GHL_API_KEY` | `process.env.GHL_API_KEY` |
| `check_meta_ads.js` | `SUPABASE_ANON_KEY` | `process.env.SUPABASE_ANON_KEY` |
| `SETUP-SYNC-OPP-PIPELINES.md` | `GHL_API_KEY` | `<SUA_GHL_API_KEY_AQUI>` |
| `docs/APIS-DOCS/ghl-conversations-api.md` | `apiKey` | `<SUA_GHL_API_KEY_AQUI>` |
| `docs/GHL_WEBHOOK_SETUP.md` | `apikey` / `Authorization` | placeholders documentados |
| `docs/MCP-SUPABASE-SETUP.md` | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` | placeholders documentados |
| `supabase/functions/sync-ghl-conversations/README.md` | `GHL_API_KEY` | `<SUA_GHL_API_KEY_AQUI>` |
| `tests/sub-apps/README.md` | `SUPABASE_ACCESS_TOKEN` | `<SEU_SUPABASE_ACCESS_TOKEN_AQUI>` |
| `eb-dash2/tests/bot-chat.spec.ts` | email/senha de teste | variáveis de ambiente |
| `supabase/migrations/20260601011926_sdr_ia_crons_e_reset_janela.sql` | JWT anon key | `current_setting('app.settings.supabase_anon_key', true)` |

### Ainda é necessário fazer (fora do código)

1. **Rotacionar as credenciais expostas** no Supabase Dashboard e no GoHighLevel:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
   - `GHL_API_KEY`
2. Atualizar secrets das edge functions:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="novo-valor"
   supabase secrets set SUPABASE_ANON_KEY="novo-valor"
   supabase secrets set GHL_API_KEY="novo-valor"
   supabase secrets set CRON_SECRET="valor-seguro-aleatorio"
   ```
3. Configurar no banco o anon key usado pelo cron:
   ```sql
   ALTER DATABASE postgres SET app.settings.supabase_anon_key = 'novo-anon-key';
   ```
4. Atualizar variáveis de ambiente locais (`.env.local`, `eb-dash2/.env.local`) sem commitar.

---

## 3. Row Level Security (RLS)

### 3.1 Tabelas com RLS ativado

As tabelas abaixo tiveram RLS ativado e policies criadas:

- `contatos` — usando `workspace_id`.
- `oportunidades` — via `contato_id` → `contatos.workspace_id`.
- `comunicacoes` — via `contato_id` → `contatos.workspace_id`.
- `vendas_fechamento` — via `contato_id` ou `oportunidade_id` → `contatos.workspace_id`.
- `ghl_users` — reativado RLS; SELECT limitado a usuários autenticados membros de algum workspace.
- `ghl_api_jobs` — fila global da API GHL; apenas `service_role` tem acesso (ALL).
- `ghl_opp_reconcile_runs` — execuções de reconciliação; leitura para membros ativos, escrita para admins.
- `ghl_opp_reconcile_items` — itens de reconciliação; isolamento via `contato_id` → `contatos.workspace_id`.
- `bot_context` — contexto dinâmico do bot; leitura para membros ativos, escrita para admins.
- `ghl_custom_field_mappings` — mapeamento de custom fields GHL; leitura para membros ativos, escrita para admins.

### 3.2 Helpers criados

- `get_contact_workspace_id(p_contato_id UUID)` — retorna `workspace_id` de um contato.
- `get_opportunity_workspace_id(p_oportunidade_id UUID)` — retorna `workspace_id` via oportunidade.
- `raise_unless_workspace_member(p_workspace_id UUID)` — levanta exceção se o usuário não for membro.
- `is_active_workspace_member_any()` — retorna true se o usuário atual é membro ativo de algum workspace.
- `is_active_workspace_admin_any()` — retorna true se o usuário atual é owner/admin ativo de algum workspace.

### 3.3 Policy de DELETE corrigida

A migration `20260627000000_add_delete_policy_limpeza.sql` permitia DELETE em `oportunidades`/`contatos` para qualquer admin de **qualquer** workspace. A nova policy `workspace_admins_delete_*` verifica o `workspace_id` da linha específica.

### 3.4 Service role

Todas as tabelas mantêm uma policy `service_role_all_*` para permitir que edge functions e syncs continuem operando com `SUPABASE_SERVICE_ROLE_KEY` no servidor.

---

## 4. RPCs Protegidas

As funções abaixo agora validam workspace membership no início:

- `get_creative_metrics(uuid, date, date, uuid)`
- `get_creative_metrics(uuid, date, date, uuid, text[], text[], text[], text[], text[], text[])`
- `get_max_creative_number(uuid, text)`

Se o usuário não for membro do workspace solicitado, a função levanta:

```
Acesso negado ao workspace <uuid>
```

---

## 5. Edge Functions

### 5.1 `sync-ghl-users`

Agora exige autenticação. Aceita:

1. Header `Authorization: Bearer <JWT>` de usuário autenticado com papel `owner` ou `admin`.
2. Header `x-cron-secret` com valor igual à env `CRON_SECRET`.

### 5.2 `workspace-apps`

- Removeu o fallback de "primeiro workspace ativo".
- Header `x-workspace-id` tornou-se obrigatório.
- Continua validando JWT manualmente (`verify_jwt = false` no `config.toml`).

### 5.3 Outras functions com `verify_jwt = false`

As functions abaixo continuam com validação manual de token:

- `bot-chat`
- `bot-chat-data`
- `bot-chat-synthesis`
- `prevendas-ai`

Elas não foram alteradas nesta fase, mas a validação de token deve ser revisada periodicamente.

---

## 5.4 Remoção de tokens hardcoded e auditoria de permissões

Migrations complementares aplicadas em 2026-07-06:

| Migration | O que faz |
|-----------|-----------|
| `20260706135825_remove_hardcoded_supabase_tokens.sql` | Remove tokens Supabase hardcoded do cron SQL; passa a usar `current_setting('app.settings.supabase_anon_key', true)` e secrets das edge functions. |
| `20260706160000_add_permission_audit_triggers.sql` | Cria `permission_audit_log` e triggers que registram INSERT/UPDATE/DELETE em `workspace_members`, `app_role_permissions` e `app_user_overrides`. |

---

## 6. Pre-commit de Segurança

Criados:

- `scripts/security-check.sh` — verifica secrets em arquivos rastreados.
- `.git/hooks/pre-commit` — roda o script apenas nos arquivos staged.

Para rodar manualmente:

```bash
./scripts/security-check.sh
```

---

## 7. Checklist de Conformidade

| Regra | Status |
|-------|--------|
| Nenhum `SUPABASE_SERVICE_ROLE_KEY` no frontend | ✅ |
| Nenhum secret real em código commitado | ✅ (working tree limpo) |
| `.env`, `.env.*`, `*.pem`, `*.key` no `.gitignore` | ✅ (raiz + `eb-dash2/`) |
| RLS ativo em `contatos`, `oportunidades`, `comunicacoes`, `vendas_fechamento` | ✅ |
| RLS efetivo em `ghl_users` | ✅ |
| RLS ativo em `ghl_api_jobs`, `ghl_opp_reconcile_runs`, `ghl_opp_reconcile_items`, `bot_context`, `ghl_custom_field_mappings` | ✅ |
| Tokens temporários/escopados em edge functions | ✅ |

---

## 8. Próximos Passos de Segurança

- [ ] Rotacionar credenciais no Supabase/GHL.
- [ ] Aplicar migrations de RLS no banco de produção.
- [ ] Testar isolamento: usuário A do workspace 1 não lê dados do workspace 2.
- [x] Ativar RLS em tabelas administrativas sem proteção (`ghl_api_jobs`, `ghl_opp_reconcile_runs`, `ghl_opp_reconcile_items`, `bot_context`, `ghl_custom_field_mappings`).
- [x] Adicionar `workspace_id` à tabela `ghl_users` para isolamento mais forte (`20260705000007_ghl_users_workspace_id.sql`).
- [ ] Revisar e possivelmente ativar `verify_jwt = true` nas edge functions que não precisam de acesso anônimo.
- [x] Implementar auditoria de alterações de permissões (`permission_audit_log` — `20260706160000_add_permission_audit_triggers.sql`).
