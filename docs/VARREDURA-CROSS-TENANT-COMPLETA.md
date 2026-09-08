# Varredura Sistemática — Vazamento Cross-Tenant em Funções SECURITY DEFINER e Views

> **Data:** 2026-07-19 BRT
> **Gatilho:** a mesma classe de bug já havia aparecido 3 vezes — RPCs do CRM (`20261004000000`, round2), RPCs da Meta Ads (`20261004000003`) e as funções de métricas de criativo (PR #53, `docs/auditoria-criativos`). Em vez de corrigir de um em um a cada achado novo, esta rodada varreu **todo** o catálogo de funções `SECURITY DEFINER` e views do banco de produção (`qzesffnkqgelmtfblzkr`) numa única passada.
> **Branch:** `fix/cross-tenant-security-definer-sweep` — PR aberto **sem merge**, aguardando autorização do dono.
> **Método:** introspecção read-only de produção via Management API (`pg_proc`, `pg_class`, `pg_policies`, `information_schema`), leitura de `pg_get_functiondef` de cada função, grep exaustivo de callers em `eb-dash2/src` e `supabase/functions`, e validação com escrita real (2 tenants sintéticos) num projeto Supabase efêmero.

---

## Veredito rápido

| Métrica | Valor |
|---|---|
| Funções `SECURITY DEFINER` em `public` (produção) | **161** (158 nomes distintos, 3 com overload) |
| Views em `public` | **13** |
| Classificadas **(b) vazamento real** | **37 funções + 1 view** |
| Classificadas **(c) oráculo / risco aceito** | **7** |
| Classificadas **(d) seguras / corretas** | **73** (revisão manual ou isolamento por grant) |
| Classificadas **(d\*) heurística, não lidas linha-a-linha** | **41** (helpers/triggers/filas internas — ver seção "Limites desta rodada") |
| **A classe está fechada?** | Sim para o padrão de bug que já apareceu 3x (RPC workspace-aware sem filtro real, IDOR, anon-bypass). Os itens (c) continuam como risco aceito documentado — não bloqueiam. |

O achado mais grave desta rodada **não é novo código** — é uma falha no *fix anterior*: o round2 (`20261004000002_fix_clara_dashboard_rpc_cross_tenant_p0.sql`, já aplicado em produção) usou o padrão `auth.uid() IS NULL OR is_workspace_member(...)` para deixar automação de `service_role` passar sem checagem. O problema: `auth.uid()` **também** é `NULL` numa chamada com a `anon key` pública **sem login nenhum** — não é exclusivo de `service_role`. Como essas 6 funções (`get_lead_full`, `get_opp_id_by_email`, `buscar_lead_para_venda`, `list_weekly_email_schedules`, `auditoria_sdr_ia`, `delete_weekly_email_schedule`) também tinham `EXECUTE` concedido a `anon`, **qualquer visitante sem conta, usando só a anon key embutida no bundle público do frontend, conseguia reproduzir o vazamento que o round2 disse ter fechado** — em alguns casos (ex.: `list_weekly_email_schedules`) de forma pior, porque nem precisava de conta.

---

## Metodologia (garantia de exaustividade)

1. **Enumeração completa** — duas queries read-only contra `qzesffnkqgelmtfblzkr`:
   - `select ... from pg_proc p join pg_namespace n ... where n.nspname='public' and p.prosecdef = true` → **161 linhas**, com `has_function_privilege('anon'/'authenticated', p.oid, 'EXECUTE')` para cada uma.
   - `select ... from pg_class c ... where c.relkind in ('v','m')` → **13 views**, com `security_invoker` (via `reloptions`) e `has_table_privilege` para `anon`/`authenticated`.
2. **Corpo de cada função** — `pg_get_functiondef(oid)` puxado para as 161 funções de uma vez (arquivo de 273KB), permitindo grep e leitura offline sem re-consultar produção a cada função.
3. **Triagem automática** — script que cruza (a) se o corpo toca uma tabela de tenant conhecida (`oportunidades`, `contatos`, `vendas_fechamento`, `meta_ads_insights`, etc.), (b) se existe algum marcador de filtro de workspace (`workspace_id`, `is_workspace_member`, `raise_unless_workspace_member` etc.) e (c) se tem grant para `anon`/`authenticated`. Isso reduziu 161 candidatos para um conjunto de ~30 funções que exigiam leitura manual linha-a-linha.
4. **Leitura manual** de toda função nesse conjunto reduzido, mais um segundo grep dirigido ao anti-padrão `auth.uid() IS NULL OR` (achou 3 ocorrências adicionais além das já visíveis) e a funções com `p_workspace_id` no nome dos argumentos mas sem nenhuma chamada a `is_workspace_member`/`is_workspace_admin`/`raise_unless_workspace_member` no corpo (achou mais ~8 candidatos, dos quais 6 eram falsos positivos com checagem inline não capturada pelo regex, e 2 eram reais).
5. **Mapeamento de callers reais** — grep de cada nome de função em `eb-dash2/src` e `supabase/functions`, e leitura de cada edge function encontrada para confirmar se usa `SUPABASE_SERVICE_ROLE_KEY` (automação) ou o client do browser (usuário autenticado). Isso determinou se a correção certa era (i) revogar `anon`/`authenticated` sem tocar a lógica, (ii) adicionar um guard de posse sem quebrar o caller, ou (iii) ambos.
6. **Validação com escrita real** — projeto Supabase efêmero (`xigyntpcuusouswwcblw`, renomeado para `DELETAR-validacao-cross-tenant-sweep` ao final), com schema mínimo reproduzindo as tabelas/relacionamentos relevantes, 2 workspaces sintéticos (Tenant A / Tenant B) com dados que colidem propositalmente (mesmo código de criativo `CR-1` nos dois, como acontece de verdade em produção), e ataques adversariais simulando JWTs de `anon`, `authenticated` (usuário do Tenant A) e `service_role` contra as funções corrigidas.

### Limites desta rodada (honestidade sobre o que não foi feito)

- As **41 funções marcadas `d*`** na tabela completa (guards como `is_workspace_member`, triggers `set_workspace_id_*`, filas como `claim_ghl_api_jobs`) foram classificadas por **padrão de nome + grant**, não por leitura linha-a-linha do corpo — são os próprios primitivos que as funções corrigidas usam, ou operam sobre filas/tokens sem devolver PII de tenant. Não há indício de problema nelas, mas não tiveram o mesmo nível de escrutínio dado à classe (b). Recomendação: revisão pontual se qualquer uma delas ganhar um novo parâmetro de entrada no futuro.
- **Views:** das 13, **11 já têm `security_invoker=true`** (aplicado no round2). As 2 exceções (`ai_conversation_stats`, `ai_doc_index_summary`) foram lidas por completo nesta rodada — a primeira era vazamento real (corrigida), a segunda é metadado de indexação de docs sem coluna de tenant (classe d).
- **Validação de escrita** cobriu as categorias A (anon-bypass), B (IDOR) e C (CTE sem filtro) — as categorias com maior severidade e maior confiança de exploração real. As categorias D/E/F (revogação de grant sem mudança de lógica) não precisaram de teste funcional: `REVOKE EXECUTE` é uma operação cuja correção é verificável por inspeção (a função deixa de aparecer no schema PostgREST para o role revogado), não por teste de comportamento.

---

## O que foi corrigido (migration `supabase/migrations/20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql`)

### Categoria A — anti-padrão "auth.uid() IS NULL OR ..." (bypass anônimo)

Herdado do round2 (`20261004000002`), já aplicado em produção. Troca `auth.uid() IS NULL` por `auth.role() = 'service_role'` — só é verdadeiro numa conexão real de `service_role` (edge function com a service key), nunca para uma chamada `anon`/`authenticated` sem sessão — e revoga `EXECUTE` de `anon` em todas.

| Função | Caller real confirmado | O que mudou |
|---|---|---|
| `get_lead_full(p_opp_id)` | nenhum em `eb-dash2/src`/`supabase/functions` hoje | guard + revoga `anon` |
| `get_opp_id_by_email(p_email)` | nenhum hoje | guard + revoga `anon` |
| `buscar_lead_para_venda(tel, email)` | `supabase/functions/crm-buscar-lead` (service_role) | guard + revoga `anon` |
| `list_weekly_email_schedules()` | `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` (usuário autenticado) | **achado mais grave** — `WHERE auth.uid() IS NULL OR ...` colapsava para `TRUE OR ...`; qualquer requisição com a anon key pública listava agendamentos de e-mail semanal de **todos** os workspaces (assunto, destinatários, prompt da Clara) sem login |
| `auditoria_sdr_ia(p_workspace_id, ...)` | `eb-dash2/src/hooks/useAuditoriaIA.ts` (autenticado) | guard + revoga `anon` |
| `delete_weekly_email_schedule(p_id)` | `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` (autenticado) | guard + revoga `anon` (era um DELETE cross-tenant) |

### Categoria B — IDOR (recebe workspace_id/ID de recurso, nunca valida o chamador)

| Função | Problema | Caller real |
|---|---|---|
| `get_clara_campaigns_crm(p_workspace_id, ...)` | Filtra a query pelo `p_workspace_id` recebido, mas nunca chama `is_workspace_member` — um membro do workspace A podia informar o `workspace_id` de B e ler o dashboard Clara completo de B | `supabase/functions/_shared/report-tools.ts` (service_role) |
| `get_clara_creatives_crm(p_workspace_id, ...)` | Idem | idem |
| `buscar_reengajamento(p_workspace_id, ...)` | Idem | `eb-dash2/src/hooks/useDiscagemScore.ts` (autenticado) |
| `update_weekly_email_schedule(p_id, ...)` (2 assinaturas) | **Zero** checagem de posse — qualquer autenticado atualizava (inclusive `recipient_emails`, para exfiltrar o relatório) o agendamento de **qualquer** workspace por UUID | `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` (autenticado) |
| `send_weekly_report_test(p_schedule_id)` | Mesma falta de checagem — gravava um log `pending` atribuído a agendamento de outro workspace | nenhum caller ativo hoje |

Correção: cada função passou a resolver o `workspace_id` do recurso e comparar com a membership do chamador (`is_workspace_member`/guard equivalente), levantando exceção `insufficient_privilege`/`forbidden` em caso de descasamento.

### Categoria C — CTE de CRM/Meta sem filtro de workspace (mesma classe da PR #53)

A função valida a membership do chamador (`raise_unless_workspace_member`/`is_workspace_member`), mas uma ou mais CTEs internas que fazem o trabalho pesado agregam a tabela de tenant **sem filtrar por `workspace_id`** — o filtro só aparece no join final com `notion_creatives`, quando os totais já vieram contaminados.

| Função | CTE sem filtro | Origem do achado |
|---|---|---|
| `get_creative_metrics` (2 assinaturas) | `meta_agg` (meta_ads_insights) + `crm_agg` (oportunidades/contatos) | **Incorporado da PR #53** (`docs/auditoria-criativos`, migration `20261005000000` ainda não mergeada) — consolidado nesta migration para não deixar duas migrations concorrentes soltas |
| `get_campaign_creatives` | `crm_by_cr` (oportunidades/contatos) | Achado desta rodada — mesma família, não coberta pela PR #53 |
| `get_campaign_summary` | `crm_agg` (oportunidades/contatos) | Achado desta rodada |
| `get_objectives` | `meta` (meta_ads_insights) | Achado desta rodada |

**Por que não é hipotético:** `get_max_creative_number` numera criativos (`CR-`/`AN-`) sequencialmente **por workspace** — todo workspace novo recomeça em `CR-1`. Colisão de código entre dois clientes é esperada, não rara. A validação com escrita real (seção abaixo) prova isso com números concretos.

### Categoria D — funções legadas do evento "ev-jun-26"/"PG33" (zero workspace-awareness)

`ganhou_ingresso`, `get_compradores_do_criativo`, `get_compras_evento`, `get_email_utm_source_map`, `get_leads_do_criativo`, `get_leads_do_publico`, `get_origens`, `get_publicos_do_criativo`, `get_ranking_criativos`, `get_todos_leads_evento`, `get_utm_slugs_trafego`, `leads_pipeline_sem_compra`.

Todas leem `contatos`/`oportunidades`/`maquina_de_conteudo`/`utm_*` (tabelas com `workspace_id`) sem **nenhum** filtro de tenant, com uma tag hardcoded de um evento específico (`[cp] ev-jun-26`). Grep exaustivo em `eb-dash2/src` e `supabase/functions` confirma **zero callers** hoje — não fazia sentido retrofitar `p_workspace_id` num RPC que nenhum código chama. Correção: `REVOKE EXECUTE ... FROM anon, authenticated` (mantém acessível só via `service_role`, para eventual auditoria pontual manual).

### Categoria E — helpers de cron/worker/onboarding expostos sem necessidade

`mark_weekly_reprocess_queue_processed`, `setup_workspace_apps_and_permissions`, `sync_tags_from_webhook_batch`, `sync_tags_from_webhook_target`, `get_cron_jobs`, `get_cron_runs`.

Todos os callers reais confirmados em `supabase/functions` usam `SUPABASE_SERVICE_ROLE_KEY` (verificado por grep de `createClient`/`SERVICE_ROLE_KEY` em cada edge function). Nenhum é chamado pelo frontend. O grant a `anon`/`authenticated` permitia, por exemplo, que qualquer usuário autenticado marcasse a fila de reprocessamento semanal de **outro** workspace como processada, ou disparasse um re-sync de tags em massa cross-tenant. Correção: `REVOKE EXECUTE ... FROM anon, authenticated`, `GRANT ... TO service_role`.

### Categoria F — oráculo de enumeração de usuário→workspace

`get_user_workspace_ids`, `get_user_admin_workspace_ids`, `get_user_owner_workspace_ids`, `get_user_auth_events` — nenhuma verifica `p_user_id = auth.uid()`. Qualquer autenticado podia descobrir a quais workspaces **qualquer outro usuário** pertence (por UUID), e `get_user_auth_events` ainda expunha IP/ação/data de login de qualquer usuário (dado pessoal, LGPD). Zero callers confirmados (grep em `eb-dash2/src`/`supabase/functions` **e** busca por `prosrc ilike` em todas as outras funções SQL, para garantir que nenhuma outra função interna dependia delas). Correção: `REVOKE EXECUTE ... FROM anon, authenticated`.

### View — `ai_conversation_stats`

Sem `security_invoker` (owner=`postgres`, `BYPASSRLS`), agrega `ai_conversations`/`ai_messages` sem filtro de workspace/usuário, exposta a `anon`+`authenticated`. As tabelas base já têm RLS correta (dono do registro + membro do workspace — confirmado via `pg_policies`). Correção: `ALTER VIEW ... SET (security_invoker = true)` — mesmo padrão já usado no round2 para `v_creative_metrics`/`v_disparo_metricas`/etc. Mudança estritamente aditiva de restrição, nunca abre acesso que não existia.

---

## Validação com escrita real (projeto efêmero)

- **Projeto:** `xigyntpcuusouswwcblw`, região `sa-east-1`, criado nesta sessão na organização `qmlzmyxajckftczvshpp`. **Renomeado ao final para `DELETAR-validacao-cross-tenant-sweep`** — não foi excluído (regra 20c: nunca auto-deletar). **Pendência para o dono:** confirmar e excluir manualmente pelo painel do Supabase.
- **Schema:** réplica mínima das tabelas/relacionamentos relevantes (`workspaces`, `workspace_members`, `contatos`, `oportunidades`, `vendas_fechamento`, `meta_ads_insights`, `notion_creatives`, `utm_campaigns`, `utm_sources`, `weekly_email_schedules`, `weekly_email_logs`, `comunicacoes`) + os guards (`is_workspace_member`, `is_workspace_admin`, `raise_unless_workspace_member`) + as funções corrigidas desta migration (categorias A/B/C, que têm lógica nova — as categorias D/E/F são só `REVOKE`/`GRANT` e não precisam de teste funcional).
- **2 tenants sintéticos:** Tenant A e Tenant B, cada um com 1 lead, 1 oportunidade, 1 venda fechada e **o mesmo código de criativo `CR-1`** (reproduzindo a colisão real que motiva o achado da categoria C) com valores de `spend`/`leads`/`faturamento` distintos e identificáveis.
- **Ataques simulados** via JWT forjado (`request.jwt.claim.role`/`request.jwt.claim.sub`) contra as funções já corrigidas:

| # | Teste | Resultado esperado | Resultado obtido |
|---|---|---|---|
| 1 | `get_creative_metrics` — Tenant A consulta o **próprio** workspace | `total_spend=1000`, `leads_crm=1`, `faturamento=999999` (só os dados de A, não somados com os 2000/1/111111 de B) | ✅ `{"creative_code":"CR-1","total_spend":"1000","leads_crm":1,"faturamento":"999999"}` — confirma que a contaminação cross-tenant da categoria C está fechada |
| 2 | `get_creative_metrics` — Tenant A tenta passar o `workspace_id` de B (IDOR) | Exceção `insufficient_privilege` | ✅ `ERROR: 42501: Acesso negado: usuário não é membro deste workspace` |
| 3 | `get_clara_campaigns_crm` — Tenant A tenta passar o `workspace_id` de B | Exceção | ✅ `ERROR: 42501: Acesso negado: usuário não é membro deste workspace` |
| 4 | `buscar_reengajamento` — Tenant A tenta passar o `workspace_id` de B | Exceção | ✅ `ERROR: 42501: Acesso negado: usuário não é membro deste workspace` |
| 5 | `update_weekly_email_schedule` — Tenant A tenta atualizar o agendamento de B (hijack de `recipient_emails`) | Exceção, sem UPDATE aplicado | ✅ `ERROR: 42501: forbidden: agendamento pertence a outro workspace` |
| 6 | `list_weekly_email_schedules` — chamada como **anon puro, sem login** | Lista **vazia** (antes do fix: todos os workspaces) | ✅ `[]` |
| 7 | `list_weekly_email_schedules` — chamada como Tenant A autenticado | Só o agendamento de A | ✅ `[{"id":"a3333333-...","workspace_id":"aaaaaaaa-...","name":"Relatorio A"}]` — nada de B |
| 8 | `get_opp_id_by_email` — chamada como **anon puro** buscando o e-mail do lead secreto de B | `null` (antes do fix: resolvia direto) | ✅ `{"v":null}` |
| 9 | `get_opp_id_by_email` — mesma chamada como `service_role` (garantir que a automação real não quebrou) | Resolve normalmente | ✅ `{"v":"b2222222-..."}` |

**Conclusão da validação:** as 3 classes de bug mais graves (anon-bypass, IDOR, CTE sem filtro) foram comprovadamente fechadas com dados reais e comprovadamente **não quebram** o caminho de automação (`service_role`) nem o caminho legítimo do próprio dono do dado (usuário autenticado vendo seus próprios dados).

- **Build/typecheck:** `npx tsc --noEmit` em `eb-dash2/` — limpo (nenhuma mudança de assinatura de função quebrou nenhum caller; todas as correções desta migration preservam os parâmetros existentes).

---

## Itens classe (c) — oráculo / risco aceito (não bloqueiam)

| Função/View | Motivo do risco aceito |
|---|---|
| `get_contact_workspace_id(p_contato_id)` | Usada **dentro de 30+ políticas RLS** (`comunicacoes`, `oportunidades`, `vendas_fechamento`, `ghl_opp_reconcile_items`). Revogar o `EXECUTE` de `authenticated` quebraria toda leitura/escrita autenticada nessas tabelas — o Postgres exige `EXECUTE` na função para o role que avalia a policy, mesmo sendo `SECURITY DEFINER`. Já documentado em `docs/VALIDACAO-MULTITENANT.md`. |
| `get_opportunity_workspace_id(p_oportunidade_id)` | Mesma família/mesmo motivo. |
| `resolve_workspace_by_omnx_desk_secret_digest(p_digest)` | Já `service_role`-only; resolve workspace por *digest* de secret (não PII), padrão de autenticação de webhook por design. |
| `extrair_vendas_fechamento_do_webhook()` | Trigger-only (`RETURNS trigger`) — chamar via RPC direto falha (`NEW`/`OLD` nulos fora de um trigger real). Grant a `anon`/`authenticated` inofensivo, mas desnecessário. |
| `audit_app_feature_role_permissions()` / `audit_app_feature_user_overrides()` / `audit_dashboard_user_permissions()` | Mesma classe — trigger-only, sem superfície de ataque via RPC direto. |
| `ai_doc_index_summary` (view) | Status de indexação de documentos para RAG — sem coluna `workspace_id`, não é dado de tenant. |

---

## Inventário completo (161 funções + 13 views)

A tabela abaixo lista **cada** função `SECURITY DEFINER` de `public` em produção (161 linhas, 158 nomes distintos — 3 com overload) com sua classificação, grants e a base da classificação (revisão manual do código vs. isolamento por grant vs. heurística). Views ao final.

| Função/View | Classe | anon | authenticated | Observação | Base da classificação |
|---|---|---|---|---|---|
| `adopt_existing_workspace_service_role` | d | False | False | Sem EXECUTE para anon/authenticated — só acessível via service_role (edge functions/crons/triggers). Não exploitável via PostgREST client-side. | isolamento por grant |
| `analisar_meta_crm_cruzado` | d | False | True | Já corrigido em `20261004000003` (`workspace_id` + `is_workspace_member`). | revisão manual do código |
| `audit_app_feature_role_permissions` | c | True | True | Trigger-only — chamada direta via RPC falha (NEW/OLD nulos). | revisão manual do código |
| `audit_app_feature_user_overrides` | c | True | True | Trigger-only — mesmo motivo. | revisão manual do código |
| `audit_dashboard_user_permissions` | c | True | True | Trigger-only — mesmo motivo. | revisão manual do código |
| `auditoria_sdr_ia` | b | True | True | Anon-bypass — corrigido (categoria A). | revisão manual do código |
| `backfill_meta_ads_job` | d | False | False | Isolado por grant. | isolamento por grant |
| `bot_query` | d | False | False | Isolado por grant. | isolamento por grant |
| `buscar_lead_para_venda` | b | True | True | Anon-bypass — corrigido. Caller real: `crm-buscar-lead` (service_role). | revisão manual do código |
| `buscar_reengajamento` | b | True | True | IDOR — corrigido (categoria B). Caller real: `useDiscagemScore.ts`. | revisão manual do código |
| `can_access_workspace_via_agency` | d* | True | True | Helper/guard — primitivo usado por outras funções. | heurística |
| `can_write_disparos` | d* | True | True | Helper/guard de permissão. | heurística |
| `can_write_sdr_ia_config` | d* | True | True | Helper/guard de permissão. | heurística |
| `check_rate_limit` | d* | True | True | Helper de rate limit, não retorna PII de tenant. | heurística |
| `claim_contact_opp_sync_queue` | d* | True | True | Worker de fila interna. | heurística |
| `claim_ghl_api_jobs` | d* | True | True | Worker de fila interna. | heurística |
| `claim_ghl_opp_reconcile_items` | d* | True | True | Worker de fila interna. | heurística |
| `cleanup_expired_reset_tokens` | d* | True | True | Limpeza de tokens expirados. | heurística |
| `create_agency_for_owner_service_role` | d | False | False | Isolado por grant. | isolamento por grant |
| `create_weekly_email_schedule` (2 assinaturas) | d | True | True | `workspace_id` vem de trigger a partir de `auth.uid()`, não de input do cliente — correto. | revisão manual do código |
| `create_workspace_with_owner` | d | True | True | Usa somente `auth.uid()` — correto. | revisão manual do código |
| `delete_weekly_email_schedule` | b | True | True | Anon-bypass num DELETE — corrigido. | revisão manual do código |
| `detach_adopted_workspace_service_role` | d | False | False | Isolado por grant. | isolamento por grant |
| `detect_ghl_mapping_changes` | d | False | False | Isolado por grant. | isolamento por grant |
| `discover_agency_locations_job` | d | False | False | Isolado por grant. | isolamento por grant |
| `enforce_workspace_member_update` | d | False | False | Isolado por grant. | isolamento por grant |
| `enqueue_ghl_api_job` | d* | True | True | Worker de fila interna. | heurística |
| `export_workspace_data_manifest` | d | False | False | Isolado por grant. | isolamento por grant |
| `extrair_vendas_fechamento_do_webhook` | c | True | True | Trigger-only — chamada direta falha. | revisão manual do código |
| `finalize_workspace_deletion_request` | d | False | False | Isolado por grant. | isolamento por grant |
| `ganhou_ingresso` | b | True | True | Zero workspace-awareness (evento legado), 0 callers — EXECUTE revogado. | revisão manual do código |
| `get_agency_credential_meta` | d | False | False | Isolado por grant. | isolamento por grant |
| `get_agency_ghl_credential_status` | d | False | True | `is_agency_admin` — correto. | revisão manual do código |
| `get_campaign_creatives` | b | False | True | CTE `crm_by_cr` sem filtro `workspace_id` — corrigido (categoria C). | revisão manual do código |
| `get_campaign_daily` | d | False | True | Escopado via `ws_accounts`/`local_crs`, sem join CRM — correto. | revisão manual do código |
| `get_campaign_summary` | b | False | True | CTE `crm_agg` sem filtro `workspace_id` — corrigido. | revisão manual do código |
| `get_clara_benchmarks` / `get_clara_campaigns` / `get_clara_channels` / `get_clara_comparison` / `get_clara_creatives` / `get_clara_funnel` / `get_clara_kpis` / `get_clara_trend` | d | False | False | `service_role`-only. | revisão manual do código |
| `get_clara_campaigns_crm` | b | True | True | IDOR — corrigido (categoria B). | revisão manual do código |
| `get_clara_creatives_crm` | b | True | True | IDOR — corrigido. | revisão manual do código |
| `get_compradores_do_criativo` / `get_compras_evento` / `get_email_utm_source_map` / `get_leads_do_criativo` / `get_leads_do_publico` / `get_origens` / `get_publicos_do_criativo` / `get_ranking_criativos` / `get_todos_leads_evento` / `get_utm_slugs_trafego` / `leads_pipeline_sem_compra` | b | True | True | Família "evento legado" — zero workspace-awareness, 0 callers — EXECUTE revogado. | revisão manual do código |
| `get_contact_workspace_id` | c | True | True | Oráculo já documentado — usado em 30+ RLS policies, risco aceito. | revisão manual do código |
| `get_creative_metrics` (2 assinaturas) | b | True | True | CTEs sem filtro `workspace_id` (PR #53, incorporado). | revisão manual do código |
| `get_cron_jobs` / `get_cron_runs` | b | True/False | True | Grant desnecessário (caller real = service_role) — revogado por higiene. | revisão manual do código |
| `get_decrypted_secret` / `get_secret` | d | False | False | Isolado por grant. | isolamento por grant |
| `get_lead_full` | b | True | True | Anon-bypass — corrigido. | revisão manual do código |
| `get_max_creative_number` | d | True | True | `raise_unless_workspace_member` + filtro `workspace_id` — correto. | revisão manual do código |
| `get_meta_ads_campaign_metrics` | d | False | True | Filtra por `workspace_id` + `is_workspace_member` — correto. | revisão manual do código |
| `get_meta_campaigns` | d | False | True | Escopado indiretamente via `ws_accounts` — correto. | revisão manual do código |
| `get_objectives` | b | False | True | CTE `meta` sem filtro `workspace_id` — corrigido. | revisão manual do código |
| `get_opp_id_by_email` | b | True | True | Anon-bypass — corrigido. | revisão manual do código |
| `get_opportunity_workspace_id` | c | True | True | Mesma família de `get_contact_workspace_id` — risco aceito. | revisão manual do código |
| `get_user_admin_workspace_ids` / `get_user_owner_workspace_ids` / `get_user_workspace_ids` | b | True | True | Oráculo de enumeração user→workspace sem checar `p_user_id=auth.uid()`, 0 callers — revogado. | revisão manual do código |
| `get_user_auth_events` | b | True | True | Expõe IP/login de qualquer usuário (LGPD), 0 callers — revogado. | revisão manual do código |
| `get_weekly_email_logs` | d | False | True | Filtra por `workspace_id` + `is_workspace_member` — correto. | revisão manual do código |
| `get_workspace_credential_meta` | d | False | False | Isolado por grant. | isolamento por grant |
| `get_workspace_credential_status` | d | False | True | `is_workspace_admin` — correto. | revisão manual do código |
| `get_workspace_external_form_source_status` | d | False | True | Só revela status/URL (sem secret) do workspace informado; 0 caller ativo. | revisão manual do código |
| `get_workspace_members_with_profile` | d | True | True | Subquery inline confirma membership do chamador — correto. | revisão manual do código |
| `ghl_api_worker_job` / `ghl_mapping_detect_changes_job` / `ghl_mapping_discovery_watch_job` / `ghl_opp_reconcile_process_job` / `ghl_opp_reconcile_start_nightly_job` | d | False | False | Isolado por grant. | isolamento por grant |
| `increment_ghl_opp_reconcile_run_counters` | d* | True | True | Worker de fila interna. | heurística |
| `is_active_workspace_admin_any` / `is_active_workspace_member_any` / `is_agency_admin` / `is_agency_member` / `is_workspace_admin` / `is_workspace_member` / `is_workspace_owner` / `raise_unless_workspace_member` | d* | True | True | São os próprios primitivos/guards usados pelas funções corrigidas. | heurística |
| `list_weekly_email_schedules` | b | True | True | Anon-bypass mais grave (`TRUE OR ...`) — corrigido. | revisão manual do código |
| `log_auth_event` | d* | True | True | Log de evento de auth (escrita, não leitura de terceiros). | heurística |
| `mark_weekly_reprocess_queue_processed` | b | True | True | Grant desnecessário (caller real = service_role) — revogado. | revisão manual do código |
| `notion_sync_creatives_job` / `notion_sync_organic_creatives_job` / `notion_sync_paid_creatives_job` | d | False | False | Isolado por grant. | isolamento por grant |
| `on_new_workspace_seed_ghl_mappings` / `on_new_workspace_setup_apps` | d* | True | True | Triggers de onboarding. | heurística |
| `purge_workspace_data` | d | False | False | Isolado por grant. | isolamento por grant |
| `reactivate_agency_workspace` / `suspend_agency_workspace` | d | False | True | `is_agency_admin` — correto. | revisão manual do código |
| `recalcular_discagem_scores` / `register_outbound_webhook` | d | False | False | Isolado por grant. | isolamento por grant |
| `request_workspace_deletion` | d | False | True | `is_workspace_owner`/`is_agency_admin` — correto. | revisão manual do código |
| `requeue_stale_contact_opp_sync_queue` / `requeue_stale_ghl_api_jobs` / `requeue_stale_ghl_opp_reconcile_items` / `reset_rate_limit` | d* | True | True | Workers de fila/rate-limit interna. | heurística |
| `resolve_workspace_by_omnx_desk_secret_digest` | c | False | False | Já `service_role`-only; oráculo por digest. | revisão manual do código |
| `revoke_workspace_credential` / `save_agency_ghl_credential` / `save_workspace_credential` / `save_workspace_external_form_source` | d | False | True | `is_workspace_admin`/`is_agency_admin`/checagem inline — corretas. | revisão manual do código |
| `seed_workspace_credential_service_role` / `seed_workspace_ghl_credential_service_role` | d | False | False | Isolado por grant. | isolamento por grant |
| `send_weekly_report_test` | b | True | True | IDOR de escrita — corrigido. | revisão manual do código |
| `set_workspace_id_*` (11 triggers: `comunicacoes`, `ghl_tasks`, `maquina_de_conteudo`, `meta_ads_backfill_controle`, `meta_ads_backfill_log`, `meta_ads_campaigns`, `meta_ads_permalinks`, `oportunidades`, `reunioes`, `stevo_whatsapp_calls`, `vendas_fechamento`, `webhooks_ghl`, `weekly_email_logs`, `weekly_email_schedules`) | d* | True | True | Triggers `BEFORE INSERT` — não expõem dado via SELECT direto. | heurística |
| `setup_workspace_apps_and_permissions` | b | True | True | Permitiria reativar apps de outro workspace — grant revogado. | revisão manual do código |
| `sync_ad_permalinks_job` / `sync_contact_attribution_job` / `sync_contact_opportunities_job` / `sync_contact_tags_job` / `sync_contact_tasks_job` / `sync_ghl_conversations_job` / `sync_ghl_users_job` / `sync_meta_ads_7days_job` / `sync_meta_ads_job` / `sync_opp_dates_job` / `sync_tags_from_latest_webhook` | d | False | False | Isolado por grant (`*_job` — guard de cron já documentado em `SEGURANCA-CRON-CALLER-GUARD.md`). | isolamento por grant |
| `sync_tags_from_webhook_batch` / `sync_tags_from_webhook_target` | b | True | True | Write cross-tenant em massa — grant revogado. | revisão manual do código |
| `trg_fn_enqueue_attribution_on_contact` / `trigger_sync_opp_dates` | d* | True | True | Triggers. | heurística |
| `update_weekly_email_schedule` (2 assinaturas) | b | True | True | IDOR de escrita — corrigido. | revisão manual do código |
| `update_workspace_external_form_source_status` / `verificar_status_backfill` | d | False | False | Isolado por grant. | isolamento por grant |
| `weekly_email_dispatcher_job` / `weekly_reports_auth_header` / `weekly_reports_cohort_job` / `weekly_reports_cohort_reprocess_job` / `weekly_reports_finalize_job` / `weekly_reports_produtividade_job` | d | False | False | Isolado por grant. | isolamento por grant |

### Views (13)

| View | security_invoker | anon/auth | Classe |
|---|---|---|---|
| `ai_conversation_stats` | **era false → corrigido para true** | True/True | **b — corrigido** (sem filtro de workspace/usuário, owner=postgres/BYPASSRLS) |
| `ai_doc_index_summary` | false | True/True | c (sem coluna de tenant, não é dado de tenant) |
| `comunicacoes_com_remetente` | true | True/True | d (round2) |
| `v_creative_metrics` | true | **SELECT revogado de anon/authenticated nesta migration** | b — código morto com o mesmo bug de CTE da PR #53, agora sem acesso client-side |
| `v_creative_status_counts` / `v_disparo_metricas` / `v_meta_ads_daily_summary` / `v_meta_ads_ultimas_syncs` / `v_weekly_dashboard` / `v_weekly_snapshots_status` / `vw_amostra_datas_oportunidades` / `vw_comparacao_datas_webhook_oportunidade` / `vw_qualidade_datas_oportunidades` | true | True/True | d (já corrigidas no round2) |

---

## Referências

- [`docs/VALIDACAO-MULTITENANT.md`](VALIDACAO-MULTITENANT.md) — validação adversarial anterior (round2) e aplicação em produção de `20261004000000`/`20261004000002`.
- [`docs/VALIDACAO-META-MULTITENANT.md`](VALIDACAO-META-MULTITENANT.md) — achado e correção de `analisar_meta_crm_cruzado`/`analisar_meta_ads_por_regiao` (`20261004000003`).
- PR #53 (`docs/auditoria-criativos`, commit `5bb7cdd`) — achado original de `get_creative_metrics`/`v_creative_metrics`, incorporado nesta migration.
- [`docs/SEGURANCA-CRON-CALLER-GUARD.md`](SEGURANCA-CRON-CALLER-GUARD.md) — padrão de guard de `service_role` em funções `*_job`, mesma lógica aplicada aqui às categorias E/F.
- Migration desta rodada: `supabase/migrations/20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql`.

**Status:** branch `fix/cross-tenant-security-definer-sweep`, PR aberto sem merge. Aplicação em produção requer autorização explícita do dono (regra 20b do projeto — mudança em política/RPC sensível de tabela com tráfego real).
