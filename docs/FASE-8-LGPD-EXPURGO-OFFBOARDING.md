# Fase 8 — LGPD/offboarding: runbook técnico de expurgo de workspace

| Campo | Valor |
|-------|-------|
| **Status** | 🟢 Parte técnica implementada e validada no banco de TESTE (2026-07-11). Falta a parte jurídica (DPA — fora do escopo desta entrega, ver seção 6) e a aplicação em staging/produção. |
| **Migration** | [`supabase/migrations/20260811000000_fase8_lgpd_workspace_purge.sql`](../supabase/migrations/20260811000000_fase8_lgpd_workspace_purge.sql) |
| **Teste** | [`__tests__/integration/fase8-workspace-purge.test.ts`](../__tests__/integration/fase8-workspace-purge.test.ts) — 5/5 verde, suite completa 362/372 (10 todo), 0 regressão |
| **Scripts** | [`scripts/export-workspace-data.ts`](../scripts/export-workspace-data.ts) (portabilidade) + [`scripts/purge-workspace.ts`](../scripts/purge-workspace.ts) (hard-delete) |
| **Plano-mãe** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) seções 15 e 16 |
| **Gate que isso resolve** | "Regra de ouro": Fase 8 tem que estar completa **e com burn-in** antes do 2º tenant real/pago (ver `docs/ROADMAP-MULTI-TENANT.md` seção 3) |

---

## 1. Objetivo

Dar ao operador (dono/agência) uma forma **testada, auditável e atômica** de:
1. Exportar todos os dados pessoais de um workspace antes de excluí-lo (Art. 18, IX da LGPD — direito à portabilidade).
2. Apagar definitivamente (hard-delete) todos os dados desse workspace sob pedido, sem deixar órfãos e sem vazar/tocar em nenhum outro workspace (Art. 18, VI — direito à eliminação).
3. Registrar esse processo como um fluxo formal e auditável (`workspace_deletion_requests`), desacoplado do campo `agency_workspaces.status` (que é sobre *provisionamento*, não sobre *ciclo de vida de dado pessoal* — ver seção 16.2 do plano-mãe).

Isso é pré-requisito técnico da "regra de ouro" do roadmap: nenhuma 2ª sub-conta real/paga entra na mesma instância antes da Fase 8 estar pronta.

**Fora do escopo desta entrega (não é engenharia):** o texto do DPA (Data Processing Agreement) por sub-conta e a comunicação formal ao cliente atual sobre a mudança de modelo de infraestrutura (seções 15 e 16.1 do plano-mãe). Ver seção 6 deste documento para o que falta.

---

## 2. Por que essa função é atômica (e por que isso NÃO se generaliza para o provisionamento)

`purge_workspace_data` é uma única função `plpgsql`. No Postgres, **uma função é uma transação implícita**: se qualquer `DELETE` dentro dela falhar (FK violation, exceção, etc.), **tudo** o que a função já fez desde o início é desfeito automaticamente — não precisa de `BEGIN/COMMIT` explícito nem de lógica de compensação escrita à mão.

Isso é diferente do problema de não-atomicidade documentado na Fase 7 (`docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md`, ver também `docs/FASE-7-P2-ATOMICIDADE.md`): lá, os passos incluem chamadas de rede para **serviços externos** (Supabase Admin Auth API, RPCs via HTTP/PostgREST em requisições separadas) — não cabem dentro de uma única transação SQL porque não são todos SQL. Aqui, **todos os passos são `DELETE` no mesmo banco**, então a garantia do Postgres se aplica de graça. É a mesma razão pela qual não tentamos "consertar" a Fase 7 da mesma forma — são categorias de problema diferentes (ver `docs/FASE-7-P2-ATOMICIDADE.md` seção 2).

A única exceção real é o passo de apagar `auth.users` dos usuários com membership exclusiva — isso acontece **depois** da transação SQL confirmar sucesso, via Admin API (chamada de rede, não pode entrar na mesma transação). Se essa etapa falhar, o `purge_workspace_data` **já commitou** (dados de negócio já apagados) — só o registro de Auth do usuário fica pendente, listado explicitamente no relatório (`usuarios_exclusivos_nao_apagados_de_auth_users`) para o operador resolver manualmente. Isso é aceitável: o objetivo primário do LGPD (apagar dados do titular/lead) já foi cumprido; um usuário interno da equipe do cliente sobrando no Auth por alguns minutos não é o mesmo risco.

### O truque do dry-run transacional

`p_dry_run=true` (padrão) faz a função rodar os `DELETE`s de **verdade** — não são estimativas — e no final força `RAISE EXCEPTION` carregando o relatório como JSON na mensagem de erro. Como a exceção aborta a função, o Postgres desfaz tudo automaticamente — nada é commitado, mas as contagens reportadas são exatas (vieram de `GET DIAGNOSTICS ... ROW_COUNT` de deletes reais). O script `scripts/purge-workspace.ts` decodifica essa mensagem e mostra o relatório como se fosse um retorno normal.

---

## 3. Ordem de exclusão e por que ela importa

A ordem não é arbitrária — cada passo existe por causa de uma FK específica descoberta ao inspecionar o schema real do banco de teste (não assumida, checada com `psql` contra `fgjbmdsucruvtpywyhhf`):

| Passo | Tabela(s) | Motivo da ordem |
|---|---|---|
| a | `ghl_tasks` | FK `contato_id -> contatos` é **`NO ACTION`** (RESTRICT) — bloqueia o `DELETE` de `contatos` se rodar depois. |
| b | `ghl_opp_reconcile_items` | FK `contato_id -> contatos` é **`SET NULL`** — não bloqueia, mas orfanaria a linha (ainda tem `ghl_contact_id`, PII) se não apagada explicitamente. |
| c | `contatos WHERE workspace_id = alvo` | Cascade automático (`ON DELETE CASCADE`) cobre `oportunidades`, `comunicacoes`, `vendas_fechamento`, `reunioes` — todas penduradas em `contato_id`. Essas 4 tabelas **não precisam de passo próprio**. |
| d | `webhooks_ghl`, `contact_opp_sync_queue`, `webhook_unresolved` | Sem FK nenhuma (payload bruto do GHL) — só têm `location_id`. Resolvidos via `ghl_integration_settings.ghl_location_id`, capturado **antes** do passo (g) apagar essa tabela. |
| e | `ghl_users`, `ghl_calendars` | FK `workspace_id -> workspaces` é **`SET NULL`** — o cascade final do passo (g) **não apagaria** essas linhas, só orfanaria (nome/e-mail do usuário GHL do cliente ficaria sem dono). |
| f | `ai_messages`, `ai_conversations`, `ai_analysis_sessions` | Só para usuários cuja **única** membership é este workspace (evita apagar o histórico de um admin que também atua em outro tenant — cenário relevante assim que a Fase 1/5 multi-tenant estiver ativa de verdade). |
| g0 | `app_feature_role_permissions`, `app_feature_user_overrides`, `dashboard_user_permissions` | **Achado real desta sessão** (ver seção 4) — precisam ser apagadas explicitamente ANTES do passo (g), não podem esperar o cascade. |
| g | `DELETE FROM workspaces` | Cascade cobre o resto: `ads_campaigns`, `creative_*`, `disparo_*`, `funnels`, `ghl_discovery_runs`, `ghl_field_mappings`, `ghl_integration_settings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `goal_definitions -> goal_versions -> goal_snapshots` (cascade em cadeia), `notion_*`, `organic_*`, `outbound_webhooks`, `permission_audit_log`, `sales_*`, `sdr_ia_config`, `utm_*`, `whatsapp_pricing_config`, `workspace_apps`, `workspace_integration_credentials`, `workspace_members`, `workspace_settings`, `agency_workspaces`. |

---

## 4. Achado real: cascade de workspace estava quebrado por triggers de auditoria

Ao **testar de verdade** contra o banco de teste (não só ler o schema), o primeiro `dry_run` reprovou com:

```
insert or update on table "permission_audit_log" violates foreign key constraint "permission_audit_log_workspace_id_fkey"
```

**Causa raiz:** `app_feature_role_permissions`, `app_feature_user_overrides` e `dashboard_user_permissions` têm gatilhos `AFTER INSERT OR DELETE OR UPDATE` que **escrevem** em `permission_audit_log` (com `workspace_id`). Quando o `DELETE FROM workspaces` dispara o `CASCADE` nessas 3 tabelas, o gatilho tenta inserir uma linha de auditoria referenciando um `workspace_id` que **já não existe mais** naquele ponto da transação (a linha em `workspaces` já foi removida antes do cascade propagar) — a FK de `permission_audit_log` rejeita o insert, e a transação inteira aborta.

**Isso significa que, antes desta sessão, `DELETE FROM workspaces WHERE id = X` sozinho (a forma "óbvia" de apagar um workspace) SEMPRE falharia** assim que qualquer uma dessas 3 tabelas tivesse pelo menos 1 linha — o que é o caso normal de qualquer workspace em uso (permissões de sub-app são seedadas no provisionamento). Esse bug nunca foi notado porque **nada no sistema hoje tenta apagar um workspace inteiro** — é a primeira vez que essa operação é exercitada de ponta a ponta.

**Correção aplicada** (dentro da própria `purge_workspace_data`, passo g0): apagar essas 3 tabelas **explicitamente antes** do `DELETE FROM workspaces`, enquanto a linha em `workspaces` ainda existe — os inserts que o gatilho faz em `permission_audit_log` têm FK válida nesse momento, e essas linhas de auditoria (que também têm `workspace_id CASCADE`) são limpas automaticamente no cascade final do passo (g), sem sobrar rastro.

**Ação de projeto separada recomendada (fora desta migration):** os gatilhos de auditoria (`audit_app_feature_role_permissions`, `audit_app_feature_user_overrides`, `audit_dashboard_user_permissions`) deveriam, no mínimo, **não quebrar** operações legítimas de cascade — ex.: usar `ON CONFLICT DO NOTHING` não ajuda aqui (é FK, não unicidade), mas o gatilho poderia checar `to_regclass` ou capturar a exceção de FK e degradar graciosamente. Não corrigido aqui porque foge do escopo do expurgo (é um comportamento pré-existente e o workaround no passo g0 já resolve o caso que importa); registrado como dívida técnica.

---

## 5. Gaps conhecidos (documentados, não escondidos)

O relatório de toda execução (dry-run ou real) da RPC, e o manifesto de export, **sempre listam explicitamente** as tabelas abaixo como **não cobertas** — nunca reportam "100% limpo" silenciosamente (mesmo risco de completude que o Anexo B do plano-mãe já aponta para a seção 16.3: "o export/hard-delete que varre todas as tabelas com workspace_id omite silenciosamente as linhas NULL"):

| Tabela | Por que não é purgada | Contém PII? | Prioridade de correção |
|---|---|---|---|
| `meta_ads_backfill_controle` / `meta_ads_backfill_log` | Residual de-scoped por decisão do dono — `sync-meta-ads-backfill` (carga histórica, uso raro) segue single-tenant, "não mexer salvo pedido" (`docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`) | Não (metadados de execução de job) | Baixa (decisão explícita, não esquecimento) |
| `audit_log` (residual) | Log de auditoria genérico (`user_id`, `table_name`, `record_id`) sem `workspace_id` — best-effort fora de escopo desta função | Indireto (referencia registros já apagados) | Baixa (registros ficam órfãos/inúteis, não vazam PII legível diretamente) |

**`stevo_whatsapp_calls` — gap fechado (2026-07-11).** Era o único gap com PII direta (`caller`/`receiver`, telefones de chamadas WhatsApp) e sem NENHUM caminho de isolamento (nem `contato_id`, nem `location_id`). Migration [`20260812000000_fase6_workspace_id_stevo_whatsapp_calls.sql`](../supabase/migrations/20260812000000_fase6_workspace_id_stevo_whatsapp_calls.sql) adicionou `workspace_id` (mesmo padrão seguro da Fase 6: nullable → backfill fail-closed com 2+ workspaces → `NOT NULL` → trigger `BEFORE INSERT`), e `purge_workspace_data`/`export_workspace_data_manifest` foram atualizadas na mesma migration para cobri-la por coluna direta.

**`meta_ads_campaigns` / `meta_ads_permalinks` / `weekly_email_logs` / `weekly_email_schedules` — gaps fechados (Fase 6 fatia 2, 2026-07-11).** Migration [`20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql`](../supabase/migrations/20260813000000_fase6_fatia2_backfill_meta_permalinks_weekly_email.sql) adicionou `workspace_id` via backfill por JOIN real (não só o fallback single-workspace) e corrigiu as policies de SELECT das 4 tabelas, que **não filtravam por linha** — achado de segurança real ao inspecionar antes de fechar o gap (vazamento cross-tenant de `recipient_emails` em `weekly_email_logs`, o dado com PII deste lote). `purge_workspace_data`/`export_workspace_data_manifest` cobrem as 4 por coluna direta. Detalhe completo em `docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md`.

Só restam `meta_ads_backfill_controle`/`log` (decisão explícita do dono) e `audit_log` (residual, best-effort). Nenhuma tabela com PII direta de lead segue sem caminho de isolamento.

---

## 6. O que falta para "Fase 8 pronta" (não é código)

Esta entrega cobre a **parte técnica** do runbook (seção 15, item 2 do plano-mãe: "runbook técnico de expurgo de titular específico"). Ainda faltam, fora do escopo de engenharia:

1. **DPA por sub-conta** (seção 15, item 1) — jurídico redige e revisa, formalizando que a infraestrutura é compartilhada, a Alto Valor é operadora, a sub-conta é controladora dos dados dos próprios leads.
2. **Comunicação formal ao cliente atual** (seção 16.1) — atualizar contrato/termos avisando da mudança de instância física isolada para infraestrutura logicamente compartilhada (LGPD Art. 6º IX, Art. 9º), com opção de permanecer no tier "instância isolada".
3. **Definição de bases legais e prazos de retenção por tipo de dado de lead** (seção 15, item 3) — hoje o `grace_period_days` da tabela `workspace_deletion_requests` tem default de 30 dias, mas o valor "certo" é uma decisão jurídica/de produto, não técnica.
4. **Burn-in** — a "regra de ouro" do roadmap não pede só "Fase 8 implementada", pede implementada **e testada em produção real por um período**, antes do 2º tenant pago. Isso só acontece depois do primeiro tenant interno/de baixo risco (Fase 7) rodar por um tempo.
5. **Aplicação em staging/produção** — esta migration só foi validada no banco de TESTE (`fgjbmdsucruvtpywyhhf`), seguindo `docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`. Staging não foi provisionado (decisão do dono, 2026-07-11) — aplicação em produção segue o mesmo caminho já usado nas Fases 1-7 (migration versionada, revisada, aval explícito do dono na hora).

---

## 7. Como usar (procedimento operacional)

```bash
# 1) SEMPRE exportar antes de apagar (Art. 18, IX é pré-requisito, não opcional)
npx tsx scripts/export-workspace-data.ts --workspace-id=<uuid> --out=./export-<slug-do-cliente>
# Entregar esse pacote ao solicitante ANTES de qualquer exclusão.

# 2) Dry-run — mostra exatamente o que seria apagado, não apaga nada de verdade
npx tsx scripts/purge-workspace.ts --workspace-id=<uuid> --confirm="Nome Exato do Workspace"

# 3) Conferir o relatório do dry-run contra o manifesto do export (mesmas contagens)

# 4) Execução real — 5s de graça pra cancelar (Ctrl+C), depois apaga de verdade
#    (inclui apagar do Auth os usuários cuja ÚNICA membership era este workspace)
npx tsx scripts/purge-workspace.ts --workspace-id=<uuid> --confirm="Nome Exato do Workspace" --execute
```

Se o pedido nasceu de um fluxo formal via `request_workspace_deletion` (RPC disponível a `authenticated`, guardada por `is_workspace_owner` ou admin da agência dona), passe `--request-id=<uuid>` no passo 4 para marcar `workspace_deletion_requests.status = 'deleted'` automaticamente ao final.

**Nunca** rodar `--execute` sem antes ter o export em mãos e sem confirmar o nome exato — a RPC recusa (fail-closed) qualquer `p_confirmation_name` que não bata exatamente com `workspaces.name`.

---

## 8. Prova de completude (o que o teste automatizado garante)

`__tests__/integration/fase8-workspace-purge.test.ts` (5/5 verde) prova, contra o banco de teste real:

- confirmação errada → recusa, nada é apagado;
- dry-run → conta certo, não commita nada (workspace e dados continuam existindo depois);
- expurgo real → **zero linhas residuais** em `contatos`, `oportunidades`, `comunicacoes`, `vendas_fechamento`, `ghl_users`, `ghl_calendars`, `ghl_integration_settings`, `workspace_members`, `webhooks_ghl`, `contact_opp_sync_queue`, `webhook_unresolved` do workspace apagado — checado tabela por tabela, não por amostragem;
- **zero linhas órfãs** em `reunioes`/`ghl_tasks`/`ghl_opp_reconcile_items` apontando para o `contato_id` já apagado;
- conversa de IA do usuário com membership exclusiva é apagada;
- **workspace B (dados paralelos, seedados no mesmo teste) permanece 100% intacto** depois do purge de A — prova direta de zero vazamento cross-tenant do próprio mecanismo de expurgo (não só de leitura via RLS, que já era coberto pela suite de isolamento da Fase 0);
- `export_workspace_data_manifest` reflete contagens reais e recusa rodar para workspace já apagado.
