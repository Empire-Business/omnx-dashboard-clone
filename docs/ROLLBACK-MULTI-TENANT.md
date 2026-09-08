# Rollback da adoção multi-tenant — plano de contingência

| Campo | Valor |
|---|---|
| **Criado em** | 2026-07-16 BRT |
| **Status** | 📄 **PLANO — nada foi executado.** Documento de contingência, escrito a pedido do dono. |
| **Produção** | Projeto Supabase `qzesffnkqgelmtfblzkr` (região `sa-east-1`, PostgreSQL 17.6, PITR de 7 dias ativo) |
| **Objeto do rollback** | A adoção multi-tenant de julho/2026: migrations `20260720000000` → `20260920000000` (as 34 do manifesto A–D + follow-ups), 19 Edge Functions do lote inicial + funções criadas depois, crons por workspace, credenciais no Vault |
| **Fontes** | `docs/ROADMAP-MULTI-TENANT.md`, `docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`, `docs/MANIFESTO-RELEASE-MULTI-TENANT.md`, `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md`, `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`, `docs/SINGLE-TENANT-LOCK.md`, `docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`, `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`, as migrations em `supabase/migrations/` e medições SELECT-only em produção em 2026-07-16 |

> ## ⚠️ Nenhum passo deste documento foi executado; é um plano de contingência. Execução exige autorização explícita do dono e janela agendada.
>
> Regras do projeto que valem também para o rollback:
>
> - **Toda mutação de banco só via migration nova versionada** em `supabase/migrations/`. O rollback também é expresso como **migrations novas de reversão** — nunca SQL direto no SQL Editor, `psql` ou RPC arbitrária.
> - **Nunca editar migration já aplicada.** Reverter = criar migration nova que desfaz.
> - **Ensaiar tudo antes em staging** (`2-staging` = `suhkxlgnzcriigwrzjkh`), como foi feito na adoção.
> - **Nada de DROP sem export.** Qualquer tabela/coluna que o plano manda remover é exportada antes.
> - Gate de segurança (`security-report/verdict.json` com `gate: PASS`) vale para a janela de rollback igual vale para deploy.

---

## 1. Entenda em 5 minutos: o que foi a adoção multi-tenant

Antes de julho/2026, o sistema era **single-tenant**: uma instância = uma empresa. Existia uma tabela `workspaces`, mas só havia **um** workspace (o "Default"), e as integrações (GoHighLevel, Meta, Notion, OpenRouter) usavam **segredos globais** — variáveis de ambiente das Edge Functions (`GHL_API_KEY`, `WEBHOOK_SECRET`, `OPENROUTER_API_KEY` etc.).

Em julho/2026 o sistema ganhou a camada **multi-tenant** (uma instância = várias empresas, cada uma isolada). Em três camadas:

1. **Schema (banco):** ~34 migrations centrais (grupos A–D do `MANIFESTO-RELEASE-MULTI-TENANT.md`) mais follow-ups. Criaram as tabelas de agência (`agencies`, `agency_members`, `agency_workspaces`), a tabela de credenciais por workspace (`workspace_integration_credentials`, com o segredo em si guardado no **Vault** do Supabase), a dead-letter `webhook_unresolved`, `outbound_webhooks`, `agency_ghl_credentials`, `workspace_deletion_requests`, e adicionaram a coluna `workspace_id` (com backfill e `NOT NULL`) nas tabelas de negócio (`oportunidades`, `comunicacoes`, `vendas_fechamento`, `stevo_whatsapp_calls`, `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_schedules`, `weekly_email_logs`). Também adicionaram ~198 policies **aditivas** de agência (prefixo `agencia_*`) em ~85 tabelas.
2. **Edge Functions:** 19 funções foram republicadas no lote inicial (lista em `ROADMAP-MULTI-TENANT.md` §7.3) e outras mudaram depois. Hoje elas **resolvem a credencial por workspace** (cada tenant usa a própria chave, guardada no Vault) em vez de ler a env global; o `webhook-ghl` autentica cada evento pelo `location_id` do payload e, se não resolve o tenant, grava em `webhook_unresolved` e responde 401 (fail-closed).
3. **Crons (pg_cron):** vários jobs foram **reescritos para percorrer workspaces** (disparam uma chamada por workspace com credencial cadastrada — Meta, Notion, permalinks, ghl-users), um cron novo foi criado (`discover-agency-locations-6h`), 4 jobs órfãos foram removidos e outros 8+ tiveram o chamador trocado de `anon_key` para `service_role_key` (hardening).

**Fazer rollback** é desfazer essas três camadas **na ordem inversa da adoção**: primeiro o código (Edge Functions + segredos de ambiente), depois os crons, depois o schema — preservando os dados a cada passo.

---

## 2. O que é reversível e o que não é

| Item | Reversível? | Como / observação |
|---|---|---|
| Tabelas novas (`agencies`, `agency_members`, `agency_workspaces`, `workspace_integration_credentials`, `webhook_unresolved`, `outbound_webhooks`, `agency_ghl_credentials`, `workspace_deletion_requests`, `clara_workspace_settings`, `clara_settings_audit`, `workspace_ai_usage_events`, `workspace_external_form_sources`) | ✅ Sim | `DROP TABLE` em migration de reversão, **depois de exportar**. |
| Colunas `workspace_id` adicionadas nas tabelas de negócio | ✅ Sim | Soltar o `NOT NULL`, derrubar os triggers `set_workspace_id_*`, derrubar a coluna — tudo em migration nova. O dado da coluna se perde, mas ele é redundante no cenário single-tenant (só existe 1 workspace de verdade). Export antes mesmo assim. |
| Policies aditivas `agencia_*` (~198, em ~85 tabelas) | ✅ Sim | São **aditivas** (só liberam acesso extra para owner/admin de agência). Removê-las é `DROP POLICY` gerado em massa. Não urgente: deixá-las não quebra o single-tenant. |
| Funções/RPCs novas (`save_workspace_credential`, `get_decrypted_secret`, `seed_*`, `purge_workspace_data`, `adopt_existing_workspace_service_role`, `create_agency_for_owner_service_role`, etc.) | ✅ Sim | `DROP FUNCTION` em migration nova (ordem importa por causa de dependências com policies — ver §6, passo R-7). |
| Crons reescritos/criados | ✅ Sim | `cron.unschedule` + `cron.schedule` com o corpo antigo (recuperável do git: as versões pré-multi-tenant estão em migrations anteriores, ex.: `20260706135825_remove_hardcoded_supabase_tokens.sql`). |
| Edge Functions | ✅ Sim | Re-deploy das versões antigas a partir do tag git `backup/pre-main-merge-20260708-120345` (commit `4db5d87`, 2026-07-08, anterior ao primeiro merge multi-tenant em `main`). |
| **Segredo GHL do workspace Default** (migrou do env global para o Vault em 2026-07-15) | ⚠️ Sim, **mas exige cuidado** | Hoje a chave real do GHL **só existe no Vault** (e no painel do GHL). Antes de derrubar qualquer peça da infraestrutura de credenciais, é preciso **recuperar o valor** (via RPC `get_decrypted_secret` com `service_role`, ou reemitindo a chave no painel do GHL) e **recadastrar como secret de ambiente das Edge Functions**. Se derrubar a tabela/RPCs antes disso, a chave fica ilegível. |
| Dados de negócio já roteados com `workspace_id` (oportunidades, comunicações etc. dos 2 workspaces) | ⚠️ Parcialmente | As linhas não somem — mas se houver dado do tenant "Burn-in Interno" misturado, ele precisa ser **expurgado ou exportado** antes de derrubar as colunas/tabelas. Hoje o tenant de burn-in é interno e descartável (ver §4). |
| `webhook_unresolved` (≈19,4 mil eventos pendentes) e `ghl_api_jobs` mortos (≈42,7 mil) | ⚠️ Parcialmente | O **payload completo** está preservado nas tabelas. Depois de exportadas, dá para reprocessar (com o webhook-ghl antigo, que aceita segredo global) ou arquivar de vez. Mas ninguém "desfaz" o fato de que esses eventos não entraram no funil na época — é uma decisão de negócio, não técnica. |
| Usuários `auth.users` criados para tenants adicionais | ⚠️ Parcialmente | O owner do "Burn-in Interno" foi criado no Auth. A remoção é via Admin API (o script `scripts/purge-workspace.ts` já faz isso), não via migration. |
| O aviso de collation do staging | n/a | Não é dano a reverter; é manutenção. Ver §9. |
| **Fixes de segurança independentes de tenant** (grupo C: grants de RPCs sensíveis, remoção do INSERT anônimo em `webhooks_ghl`, anti-escalada em `workspace_members`; follow-ups `20260918000000`/`20260919000000`/`20260920000000`) | ✅ Tecnicamente sim, **mas não se deve** | Reverter isso **reabre vulnerabilidades P0** que nada têm a ver com multi-tenant. A decisão padrão deste plano é **manter** esses fixes mesmo no rollback total (ver §6, passo R-7.3). |

---

## 3. Gatilhos de decisão — quando NÃO fazer rollback

Pare e reavalie **antes** de iniciar qualquer passo do §6 se uma destas condições for verdade no dia da execução (re-mensure com as queries do §4 — os números abaixo são de 2026-07-16 e podem ter mudado):

1. **Existe cliente pagante em sub-conta.** Hoje o único tenant adicional é o "Burn-in Interno" (interno, `status='pending'`). Se um cliente real/pagante já estiver roteado, o rollback total deixa de ser opção — o caminho passa a ser **migração do cliente para uma instância isolada** (`scripts/provision-new-client.ts --mode=isolated-instance`) e não reversão de schema.
2. **Há dado de negócio real no tenant adicional.** Medir: `SELECT count(*) FROM oportunidades WHERE workspace_id = '<id-do-tenant>'`. Se for > 0 e o dado importar, tratar como migração de cliente (acima), não como descarte.
3. **O motivo do rollback é um bug pontual.** Reverter ~50 migrations e ~46 functions por causa de um bug localizado custa ordens de grandeza a mais do que corrigir pra frente. Rollback total é resposta a **inviabilidade estratégica** do modelo (ex.: kill-switch da Fase 2 disparado — vazamento cross-tenant confirmado após 2 ciclos de correção, ver `docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md` §4), não a incidente comum.
4. **Features construídas sobre a infra multi-tenant estão em uso.** Clara configurável (`clara_workspace_settings`), Inscrições (`workspace_external_form_sources` + `external-form-submissions`), OpenRouter BYOK por workspace, telemetria de IA. O rollback total **remove essas features** — o dono precisa aceitar isso explicitamente.
5. **O problema aconteceu há menos de 7 dias e o estrago é grande.** O PITR de 7 dias pode ser uma saída melhor que um rollback por migrations (restaura o banco inteiro para um ponto no tempo, num projeto novo). Decisão do dono, caso a caso.
6. **Sem janela e sem ensaio.** Se não houver tempo de ensaiar o roteiro completo no `2-staging`, não executar em produção. Ponto final.

---

## 4. Fotografia de produção (medida em 2026-07-16, SELECT-only)

Estado real confirmado por consultas somente-leitura (nenhuma mutação foi feita):

| Medida | Valor | Observação |
|---|---|---|
| Workspaces | **2** | `Default` (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`, criado 2026-02-25, o único pré-multi-tenant) e `Burn-in Interno` (`15cacbe4-8c3d-4af7-a028-e2eda7b569f4`, criado 2026-07-14) |
| Agencies / vínculos | **1 / 1** | A agência contém apenas o "Burn-in Interno" (`status='pending'`). O workspace "Default" **não** está vinculado à agência |
| `workspace_members` | 25 | |
| Credenciais no Vault | **4** | `Default`: ghl + meta + openrouter (seedadas 2026-07-15 — **o cutover env→Vault do workspace principal já aconteceu**); `Burn-in Interno`: ghl (BYOK real, 2026-07-14) |
| Credenciais de agência | 0 | `agency_ghl_credentials` vazia |
| `webhook_unresolved` pendentes | **≈19,4 mil** | 19.385 na primeira contagem e 19.396 um minuto depois — **a fila está viva**, recebendo entradas novas; 100% com `reason='missing_tenant'` |
| `ghl_api_jobs` | 11 ativos (`pending`/`processing`) + **42.726 `dead`** | Os 11 ativos podem estar falhando em ciclo (coerente com o crescimento da dead-letter) |
| Cron jobs ativos | **31** | Inventário completo no Apêndice A |
| PostgreSQL | 17.6 (aarch64), provider de collation **ICU** (`datlocale='en-US'`) | Collation **sem mismatch** — ver §9 |
| Migrations remotas | tudo aplicado até `20260920000000`; `20260921000000_revoke_internal_security_definer.sql` pendente | Confirmado via `supabase migration list --linked` em 2026-07-16. A fronteira pré-multi-tenant é `20260713170448_create_meta_ads_account_daily.sql` |
| Edge Functions | 46 no repo; 7 criadas depois do tag pré-MT | `discover-agency-locations`, `test-workspace-credential`, `clara-settings`, `external-form-submissions`, `ai-ghl-mapping`, `infer-ghl-mappings`, `crm-sync-stats` |

**Leitura executiva:** hoje o rollback total é **tecnicamente barato em dados** (o único tenant descartável é interno; o workspace principal tem tudo preservado) e **caro em features** (Clara configurável, Inscrições, telemetria de IA morrem junto). O ponto sem retorno mais delicado é o segredo GHL que só existe no Vault — tratado no passo R-4.

---

## 5. Preparação comum (obrigatória em qualquer cenário)

1. **Autorização explícita do dono + janela agendada** (madrugada BRT, fim de semana de preferência). Sem isso, nada abaixo acontece.
2. **Ensaio completo no `2-staging`** (`suhkxlgnzcriigwrzjkh`) com o roteiro exato que será rodado em produção. O rollout da adoção fez isso grupo a grupo; o rollback exige o mesmo rigor.
3. **PITR confirmado** (7 dias, ativo desde 2026-07-13) e, recomendado, **dump lógico** das tabelas críticas antes da janela.
4. **Gate de segurança da sessão** com `gate: PASS` (não reutilizar verdict de sessão anterior).
5. **Branch de trabalho dedicada** (ex.: `feat/rollback-multi-tenant`) onde as migrations de reversão serão escritas e revisadas. As migrations novas entram em `supabase/migrations/` com timestamp posterior a tudo que já existe, e são aplicadas pelo mesmo método de bundle controlado do manifesto (`scripts/build-multi-tenant-release-bundle.sh`) — **nunca `supabase db push` integral** enquanto houver migrations fora de escopo pendentes (hoje: `20260921000000`).
6. **Congelar deploys** de outras features durante a janela.

---

## 6. Cenário A — Rollback TOTAL (voltar ao single-tenant pré-adoção)

Objetivo final: banco funcionalmente no estado de `20260713170448` (última migration pré-multi-tenant), Edge Functions nas versões do tag `backup/pre-main-merge-20260708-120345`, segredos globais de ambiente restaurados, um único workspace ("Default"), sem nenhum dado perdido sem export prévio.

**Princípio da ordem:** desfazer na **ordem inversa da adoção** — primeiro código e segredos (para a ingestão nunca parar), depois follow-ups, depois grupos D → B → A. Dentro do banco, cada passo é **uma ou mais migrations novas de reversão**, ensaiadas em staging.

### R-0. Decisão, autorização e ensaio
- Coberto pelo §5. Sem ensaio verde no `2-staging`, não prosseguir.

### R-1. Backup e trava de segurança
- Confirmar PITR; gerar dump lógico das tabelas: `workspaces`, `workspace_members`, `agencies`, `agency_members`, `agency_workspaces`, `workspace_integration_credentials` (metadados — nunca o segredo), `webhook_unresolved`, `outbound_webhooks`, `ghl_api_jobs` (amostra + contagens), `clara_workspace_settings`, `workspace_ai_usage_events`, `workspace_external_form_sources`, `workspace_deletion_requests`.
- Gerar o manifesto por workspace com a RPC existente: `SELECT export_workspace_data_manifest('<workspace-id>')` para cada um dos 2 workspaces. Guardar os JSONs em `exports/` (ou bucket) — é a prova do "antes".

### R-2. Preservação de dados (export antes de qualquer DROP)
Exportar para CSV/JSON (via `npx supabase db query --linked` ou script) e arquivar:
- `webhook_unresolved` **inteira** (contém `payload` e `headers` completos dos ≈19,4 mil eventos — é a única forma de reprocessar depois);
- `ghl_api_jobs` com `status='dead'` (ou pelo menos amostra + contagens por tipo — decisão do dono sobre guardar 42,7 mil linhas);
- `workspace_integration_credentials` **só os metadados** (`workspace_id`, `provider`, `metadata`, `rotation_version`) — **nunca** exportar segredo decifrado para arquivo;
- `agencies`, `agency_members`, `agency_workspaces`, `agency_ghl_credentials` (vazia), `outbound_webhooks`, `clara_workspace_settings`, `clara_settings_audit`, `workspace_ai_usage_events`, `workspace_external_form_sources`, `workspace_deletion_requests`;
- Contagens de `workspace_id` por tabela de negócio (`oportunidades`, `comunicacoes`, `vendas_fechamento`, `stevo_whatsapp_calls`, `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_schedules`, `weekly_email_logs`).

### R-3. Drenar as filas
1. **Suspender os crons que alimentam as filas** (primeira migration de reversão da janela — `cron.unschedule` dos jobs que enfileiram: `ghl-api-worker-cron` e os syncs GHL). Isso estanca o crescimento da dead-letter durante a janela. Sem esta trava, o R-3 nunca converge.
2. **`ghl_api_jobs`:** esperar os 11 ativos terminarem ou marcar como cancelados (via migration de reversão, não SQL solto); exportar os `dead` (R-2).
3. **`webhook_unresolved`:** decidir com o dono — (a) **reprocessar depois do rollback**: com o `webhook-ghl` antigo (segredo global) de volta no ar, os payloads exportados podem ser reenviados para ele em lote; ou (b) **arquivar**: os eventos são majoritariamente `missing_tenant` (lixo operacional acumulado), e o custo de reprocessar pode não valer. Registrar a decisão no ROADMAP.

### R-4. Recuperar o segredo GHL do Vault (o passo sem retorno controlado)
Hoje a chave real do GHL do workspace "Default" **só existe no Vault** (seedada em 2026-07-15). Antes de tocar em qualquer peça de credencial:
1. Com conexão `service_role`, ler **uma vez**: `SELECT get_decrypted_secret(secret_key_id) FROM workspace_integration_credentials WHERE workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351' AND provider = 'ghl';` (alternativa mais segura: **reemitir a chave no painel do GHL** e nem tocar na antiga).
2. Recadastrar como secrets de ambiente das Edge Functions: `GHL_API_KEY`, `GHL_LOCATION_ID` (e `WEBHOOK_SECRET`, `OPENROUTER_API_KEY` e demais segredos globais que as versões antigas das functions esperam — conferir o código de cada function no tag pré-MT).
3. **Nunca** gravar esses valores em arquivo versionado, log ou documento.
4. Validar que as functions antigas (a deployar no R-5) leem as envs — um `diag-ghl` antigo responde isso.

### R-5. Re-deploy das Edge Functions (versões pré-multi-tenant)
1. `git checkout backup/pre-main-merge-20260708-120345 -- supabase/functions/` num worktree separado (ou checkout do tag inteiro) para ter o código antigo.
2. Re-deploy das **39 functions que existiam antes** (as que existem nos dois estados), uma a uma, com confirmação remota — mesmo cuidado do rollout de 2026-07-14. As que mais importam: `webhook-ghl` (volta ao `WEBHOOK_SECRET` global), `ghl-api-worker` (volta a usar credencial global), `sync-*` GHL/Meta/Notion (voltam a ler envs), `bot-chat`/`prevendas-ai` (voltam ao `OPENROUTER_API_KEY` global).
3. **Apagar** as functions exclusivas do multi-tenant: `discover-agency-locations`, `test-workspace-credential`.
4. **Decisão explícita do dono** para as features novas que não são estritamente tenant: `clara-settings`, `external-form-submissions`, `ai-ghl-mapping`, `infer-ghl-mappings`, `crm-sync-stats`. Se a feature morre no rollback (padrão do rollback total), apagar também.
5. **Risco de regra de IA:** se `bot-chat`/`prevendas-ai` antigos forem re-deployados, conferir que o modelo continua `qwen/qwen3.6-plus` via OpenRouter — a regra de modelo é inegociável em qualquer versão.

### R-6. Validar ingestão ponta a ponta ANTES de mexer no schema
- Enviar webhook de teste real do GHL → confirmar que cai em `webhooks_ghl` e vira contato/oportunidade (o trigger de extração não mudou).
- Rodar um sync manual de oportunidades → confirmar que usa a env global.
- Só com ingestão verde seguir para as migrations de reversão. **Este é o ponto de não-retorno bem definido:** até aqui, nada destrutivo aconteceu no banco.

### R-7. Migrations de reversão — ordem inversa dos grupos
Cada bloco abaixo é **uma migration nova** (ou mais), escrita na branch de rollback, ensaiada no `2-staging`, aplicada em produção por bundle controlado com dry-run prévio. Os SQLs abaixo são **esboços ilustrativos** — o conteúdo real é gerado na execução, a partir do git e do estado medido.

#### R-7.1 Follow-ups pós-manifesto (reverter `20260920000000` → `20260825000000`)
- Voltar `bot-chat`/`telegram-bot` ao OpenRouter global (coberto no R-5; aqui, desfazer o que sobrou de schema: `workspace_id` em tabelas de conversas/sessões do bot e telegram).
- Dropar `workspace_external_form_sources` + RPCs, `workspace_ai_usage_events`, `clara_workspace_settings`, `clara_settings_audit` (todas já exportadas no R-2).
- Dropar RPCs `seed_workspace_credential_service_role` (genérica), `revoke_workspace_credential`, e o clamp de modelos proibidos da Clara (a regra de modelo volta a ser garantida pelo código das functions + revisão).
- **Manter** `20260918000000`/`20260919000000` (grants e revoke correto no Vault) — hardening independente de tenant.

#### R-7.2 Grupo D (reverter `20260823000000`, `20260822000000`)
- `meta_ads_account_daily`: voltar a constraint UNIQUE para `(account_id, date)` e a RLS anterior (a coluna `workspace_id` já existia nullable antes do multi-tenant — **manter a coluna**, só desfazer a troca de constraint).
- Dropar `adopt_existing_workspace_service_role` / `detach_adopted_workspace_service_role`.

#### R-7.3 Grupo C — **NÃO reverter** (decisão padrão)
`20260815000000`–`20260818000000` são correções de bugs reais e vulnerabilidades P0 (colunas faltantes do webhook Hotmart, grants de RPCs sensíveis, INSERT anônimo em `webhooks_ghl`, anti-escalada em `workspace_members`). Reverter reabre o P0 do webhook forjável com a anon key pública. **Manter.** Se o dono quiser reverter mesmo assim, que seja item explícito e separado na autorização.

#### R-7.4 Grupo B (reverter `20260814000000` → `20260803000000`)
1. **Crons:** recriar os corpos single-tenant das funções de cron reescritas — `sync_meta_ads_job()`, `sync_meta_ads_7days_job()`, `notion_sync_creatives_job()`/`paid`/`organic`, `sync_ad_permalinks_job()`, `sync_ghl_users_job()` — recuperando as versões antigas do git (migrations anteriores a `20260728000000`) e re-agendando os mesmos jobnames. **Importante:** isso precisa acontecer **antes** de derrubar `workspace_integration_credentials` (R-7.5), porque os corpos atuais fazem loop sobre ela.
2. Unschedule + dropar `discover_agency_locations_job()` e o cron `discover-agency-locations-6h`.
3. **Expurgar o tenant "Burn-in Interno"** usando as RPCs da própria Fase 8 **antes de derrubá-las**: `purge_workspace_data('15cacbe4-8c3d-4af7-a028-e2eda7b569f4', 'Burn-in Interno', p_dry_run := true)` → conferir contagens do dry-run → rodar com `p_dry_run := false`; remover o owner do Auth via script `scripts/purge-workspace.ts`. Depois disso sobra 1 workspace (o "Default") — pré-condição para os passos de schema abaixo.
4. Dropar `agency_ghl_credentials` + RPCs (`save_agency_ghl_credential`, `get_agency_credential_meta`, `get_agency_ghl_credential_status`), `create_agency_for_owner_service_role`, RPCs de suspender/reativar (`suspend_agency_workspace`, `reactivate_agency_workspace`), RPCs de LGPD (`request_workspace_deletion`, `export_workspace_data_manifest`, `purge_workspace_data`, `finalize_workspace_deletion_request`) e `workspace_deletion_requests`.
5. **Remover `workspace_id` das tabelas de negócio** (`oportunidades`, `comunicacoes`, `vendas_fechamento`, `stevo_whatsapp_calls`, `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_schedules`, `weekly_email_logs`): derrubar os triggers `set_workspace_id_*` e suas funções → `ALTER COLUMN workspace_id DROP NOT NULL` → `DROP COLUMN workspace_id` (dado já exportado no R-2; índices associados caem junto). Em tabelas grandes (`oportunidades`, `comunicacoes`) o `DROP COLUMN` é rápido (só catálogo), mas exige lock exclusivo breve — por isso a janela de madrugada.
6. **Manter** `20260810000000` (remoção dos 4 crons órfãos — eram código morto; não ressuscitar) e `20260808000000` (caller `service_role` nos crons — hardening independente de tenant; os corpos antigos recriados no item 1 deste passo já devem nascer com `service_role_key`).

#### R-7.5 Grupo A (reverter `20260802500000` → `20260720000000`)
1. `DROP TABLE webhook_unresolved` (exportada no R-2, drenada no R-3) e `DROP TABLE outbound_webhooks` + funções associadas (`register_outbound_webhook`, `assert_outbound_url_safe`, trigger de updated_at).
2. `ghl_api_jobs`: derrubar as colunas `workspace_id` e `location_id` e os índices criados (fila já drenada no R-3).
3. `get_workspace_id_by_ghl_location_id`: o `webhook-ghl` antigo **não a usa** (ver `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md` §2) — decisão padrão: **dropar** (a versão com fallback "workspace mais antigo" é uma vulnerabilidade conhecida; não restaurar).
4. Dropar o índice único `uq_ghl_integration_settings_location_active` (irrelevante com 1 workspace; manter também não atrapalha — decisão de menor diferença: dropar, já que o objetivo é voltar ao schema pré-adoção).
5. **Credenciais:** para cada uma das 4 linhas de `workspace_integration_credentials`, chamar `revoke_workspace_credential(workspace_id, provider)` — a RPC apaga o segredo do Vault limpo (só fazer isso **depois** do R-6 verde, ou a ingestão morre). Em seguida dropar as RPCs de credencial (`save_workspace_credential`, `get_workspace_credential_status`, `get_workspace_credential_meta`, `get_decrypted_secret`, `seed_workspace_ghl_credential_service_role`) e finalmente `DROP TABLE workspace_integration_credentials`.
6. **Policies `agencia_*`:** gerar os `DROP POLICY` das ~198 policies aditivas (mesmo gerador do retrofit, `scripts/build-agency-rls-retrofit.sh`, em modo reverso — ou script equivalente). **Ordem obrigatória:** policies primeiro, funções depois — `can_access_workspace_via_agency` é referenciada pelas policies e o `DROP FUNCTION` falha com dependência pendente.
7. Dropar `can_access_workspace_via_agency`, `is_agency_member`, `is_agency_admin` e, por fim, `DROP TABLE agency_workspaces, agency_members, agencies` (agência já vazia desde o R-7.4 item 3).
8. `20260802500000` (cascade de auditoria) e `20260721120000` (fix RLS meta_ads_account_daily): avaliar no ensaio; a tendência é **manter** (corrigem comportamento quebrado independente de tenant).

### R-8. Inventário final de crons
Conferir `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;` contra o Apêndice A: nenhum job multi-tenant restante (`discover-agency-locations-6h` fora), corpos single-tenant re-agendados, órfãos **não** ressuscitados.

### R-9. Frontend
`SINGLE_WORKSPACE_MODE` já está `true` (nunca mudou). Remover a área `/agency/*` (rotas, guards `AgencyRoute`, hooks `useMyAgencies`, páginas de Chaves de API/Inscrições se as features morreram) em commit de código separado, no mesmo pacote da janela.

### R-10. Smoke completo + observação
- Webhook real chegando e virando dado; syncs GHL/Meta/Notion rodando nos horários; dashboards carregando; login dos 25 membros ok; Clara respondendo no modelo permitido.
- **Observar 2 ciclos completos de cron** (como o burn-in exigia na adoção) e registrar horário/resultado.

### R-11. Atualizar a documentação no mesmo commit
`docs/ROADMAP.md`, `docs/ROADMAP-MULTI-TENANT.md` (marcar como revertido), `docs/UML.md`, `docs/NIVEIS-DE-ACESSO.md` (matriz papel × recurso volta ao desenho single-tenant) — regra do projeto: documentação de schema/acesso muda no mesmo commit da mudança.

### R-12. Pós-condição
`supabase migration list --linked` mostra as migrations de reversão como as últimas aplicadas; produção opera single-tenant com os hardenings de segurança preservados; este documento é marcado como "executado em `<data>`" (ou descartado, se o ensaio mostrar que não vale a pena).

---

## 7. Cenário B — Rollbacks PARCIAIS (menu)

Do mais suave ao mais invasivo. Todos continuam exigindo migration nova para qualquer mutação de banco.

### B-0. "Rollback operacional" — voltar a operar single-tenant sem desfazer nenhuma migration ⭐ (opção mais barata)
Expurgar o tenant "Burn-in Interno" (`purge_workspace_data` + remoção do owner do Auth) e apagar a agência. O sistema volta a ter 1 workspace e se comporta como single-tenant — a infra multi-tenant fica **dormente** (tabelas vazias, RLS aditiva inócua, crons viram no-op natural quando não há credenciais de outros workspaces). **Zero migration, totalmente reversível, sem janela longa.** Se a motivação do rollback é "não vamos vender sub-contas agora", esta é a resposta — não o rollback total.

### B-1. Voltar o `webhook-ghl` ao segredo global
- Re-deploy apenas do `webhook-ghl` a partir do tag pré-MT + recadastrar o secret `WEBHOOK_SECRET` global + re-apontar o webhook no GHL se necessário.
- **Antes:** drenar `webhook_unresolved` (R-3) — a function antiga não escreve nela; o que ficar lá dentro só sai por export/reprocessamento manual.
- A tabela `webhook_unresolved` e o routing por `location_id` ficam no banco, dormentes. **Ressalva de segurança:** o segredo global era exatamente o anti-padrão que a Fase 2 corrigiu (ver `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`); aceitável porque hoje só há 1 location real, mas registrar a decisão.
- Reversão: re-deploy da versão por workspace + remover o env global. Barato.

### B-2. Voltar crons específicos ao modo global
- Aplicável a qualquer cron reescrito (Meta, Notion, permalinks, ghl-users): migration nova que recria o corpo antigo da função de cron (do git) e re-agenda o jobname. Só faz sentido junto com B-3 (o corpo por workspace faz loop em `workspace_integration_credentials`).

### B-3. Voltar a resolução de credenciais ao env global (desfaz o cutover da Fase 2)
- Executar R-4 (recuperar/reeemitir o segredo GHL → env `GHL_API_KEY`/`GHL_LOCATION_ID`), re-deploy das functions que leem Vault pelas versões que leem env, e B-2 para os crons.
- **Não** dropar `workspace_integration_credentials` neste cenário — deixar a tabela e as RPCs dormentes preserva o caminho de volta e os segredos já semeados.
- Reversão: re-seed + re-deploy. Médio custo.

### B-4. Remover só a RLS de agência
- `DROP POLICY` das ~198 `agencia_*` + drop das funções `can_access_workspace_via_agency`/`is_agency_*` (ordem: policies → funções). Útil se houver suspeita de custo de performance da RLS aditiva (o gate de performance da Fase 1.2c nunca rodou em staging production-like). Sem efeito funcional no single-tenant.

### B-5. Desligar só a descoberta de sub-contas
- Unschedule do `discover-agency-locations-6h` + apagar a function `discover-agency-locations`. A tabela `agency_ghl_credentials` já está vazia, então o cron hoje é no-op — desligar é higiene, não urgência.

---

## 8. Riscos e mitigação por etapa

| Etapa | Risco | Mitigação |
|---|---|---|
| R-2 (exports) | Export incompleto descoberto só depois do DROP | Manifesto por workspace + contagens antes/depois; conferência cruzada com o dump lógico do R-1 |
| R-3 (drenar filas) | Fila continuar crescendo durante a janela (está viva — medido) | Suspender os crons produtores **primeiro**; sem isso o R-3 não converge |
| R-4 (segredo GHL) | Perder o único lugar onde a chave real existe | Recuperar/reeemitir e recadastrar nas envs **antes** de qualquer passo destrutivo; validar com `diag-ghl` antigo; preferir reemitir no painel do GHL |
| R-5 (re-deploy functions) | Versão antiga incompatível com schema atual (colunas/tabelas novas) | O schema novo ainda existe neste ponto — functions antigas só leem o que conhecem; validar no R-6 antes de seguir |
| R-5 (re-deploy functions) | Regredir a regra de modelo de IA (`qwen/qwen3.6-plus` via OpenRouter) | Conferir o código deployado; a regra é inegociável em qualquer versão |
| R-7 (migrations de reversão) | Ordem errada quebra dependência (policy ↔ função, cron ↔ tabela de credenciais) | Ordem fixa deste documento: crons antes de dropar credenciais; policies antes de dropar funções de agência; ensaio completo no `2-staging` |
| R-7.4 (drop `workspace_id`) | Lock em tabelas grandes (`oportunidades`, `comunicacoes`) durante a janela | `DROP COLUMN` é operação de catálogo (rápida), mas exige ACCESS EXCLUSIVE breve — madrugada BRT; medir no ensaio |
| R-7.5 (drop credentials/Vault) | Ingestão morre se o env não estiver 100% | Gate explícito: R-6 verde é pré-condição; revoke por linha (limpa o Vault) só depois |
| Qualquer | `db push` integral publicar migrations fora de escopo (hoje `20260921000000` está pendente) | Mesmo método do rollout: bundle controlado + dry-run listando **só** as migrations de reversão |
| Qualquer | Descobrir no meio que um cliente real foi roteado | Re-medir o §4 **no dia da execução**; gatilho 1 do §3 aborta o plano |
| Pós | Dado do tenant expurgado necessário depois | Exports do R-2 + PITR de 7 dias cobrem; passados 7 dias, só os exports |

---

## 9. O aviso de collation (staging/teste) — o que é, por quê e como corrigir

### 9.1 Onde está registrado
O aviso apareceu ao aplicar migrations no banco de teste/staging e ficou registrado como pendência em dois lugares, **sem detalhe técnico transcrito** (o texto exato do aviso e os valores não foram capturados na época — lacuna a sanar na próxima ocorrência):

- `docs/ROADMAP.md` (2026-07-13): *"…ainda falta registrar o rollback operacional das migrations, **revisar o aviso de collation do staging** e obter autorização explícita do dono."*
- `docs/ROADMAP.md` (2026-07-15, decisões do dono): *"rollback operacional das migrations + **aviso de collation aprovado** (artefatos em elaboração antes da janela)"* — este documento é o artefato.
- `docs/MUDANCAS.md` (2026-07-13): duas menções ao bloqueio do rollout "pela revisão do aviso de collation no PostgreSQL".

### 9.2 O que o aviso significa (em linguagem simples)
"Collation" é a **regra de ordenação e comparação de textos** (ex.: se "á" vem antes de "b", se "A" = "a"). O Postgres não implementa essa regra sozinho: ele a pega emprestada de uma biblioteca do sistema — tradicionalmente a **glibc** do Linux (provider `libc`), ou a **ICU** (provider `icu`), mais estável e recomendada nas versões novas.

Quando um banco é criado, o Postgres grava a **versão** da collation daquele momento (`pg_database.datcollversion`). Toda vez que alguém conecta, ele compara a versão gravada com a versão que o sistema operacional reporta **agora**. Se forem diferentes, aparece o aviso:

```
WARNING: database "<nome>" has a collation version mismatch
DETAIL: The database was created using collation version X, but the operating system provides version Y.
```

Isso acontece tipicamente quando: (a) a imagem/host do Supabase foi atualizada e a glibc/ICU mudou de versão; ou (b) o banco foi **restaurado** (Restore to new project, PITR) num host com biblioteca diferente daquele onde o backup foi criado — o `datcollversion` viaja com o backup.

### 9.3 Por que aparece em staging/teste e não em produção
Medido em produção em 2026-07-16 (SELECT-only, sem mutação):

| Banco | Provider | Versão gravada (`datcollversion`) | Versão real do SO (`pg_database_collation_actual_version`) | Mismatch? |
|---|---|---|---|---|
| `postgres` | **ICU** (`datlocale='en-US'`) | `153.120` | `153.120` | **Não** |
| `template1` | ICU | `153.120` | `153.120` | **Não** |

Ou seja: **produção está íntegra hoje** — PostgreSQL 17.6 com collation ICU, versão gravada igual à real, nenhuma ação necessária lá. O projeto de produção é mais novo (e o PG17/Supabase já usa ICU por padrão); os projetos de **teste histórico** (`fgjbmdsucruvtpywyhhf`) e **staging** (`2-staging`, criado por *Restore to new project*) carregam histórico de versões/imagens diferentes — exatamente as condições (b) e (a) acima. Não consultei staging/teste nesta sessão (o link local aponta para produção e não havia necessidade de mutação de link); o diagnóstico lá é rodar a mesma query do §9.5 contra o projeto de staging.

### 9.4 O risco real
O aviso em si é só um aviso — **mas o motivo dele é sério**: índices e constraints construídos sobre colunas de texto (`text`, `varchar`) com a collation **antiga** podem estar logicamente inconsistentes com a collation **nova**. Sintomas possíveis: `ORDER BY` retornando ordem diferente do esperado, buscas que usam índice **não encontrando linhas que existem**, constraint `UNIQUE` deixando passar duplicata que a regra nova consideraria igual. É silencioso e não corrompe o dado gravado — corrompe a estrutura do índice. Na prática, para português/ASCII comum o risco de mudança real de ordenação entre versões próximas é baixo, mas não é zero, e o Postgres não tem como saber — por isso ele avisa.

### 9.5 Correção padrão segura (como migration nova, nunca SQL direto)
Sequência conservadora — **reindexar primeiro, refrescar a versão por último** (refrescar antes só calaria o aviso sem corrigir índice nenhum, que é pior que o aviso):

1. **Medir** (SELECT-only, qualquer hora):
   ```sql
   SELECT datname, datcollversion AS registrada,
          pg_database_collation_actual_version(oid) AS real_do_so
   FROM pg_database;
   ```
2. **Identificar os índices de texto potencialmente afetados** (SELECT-only):
   ```sql
   SELECT n.nspname AS schema, c.relname AS tabela, i.relname AS indice
   FROM pg_index x
   JOIN pg_class i   ON i.oid = x.indexrelid
   JOIN pg_class c   ON c.oid = x.indrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(x.indkey)
   JOIN pg_type t    ON t.oid = a.atttypid
   WHERE n.nspname = 'public' AND t.typname IN ('text','varchar','name')
   GROUP BY 1,2,3 ORDER BY 1,2,3;
   ```
3. **Reindexar os objetos identificados**, um a um, na migration de correção:
   ```sql
   REINDEX INDEX public.<indice>;   -- ou REINDEX TABLE public.<tabela>;
   ```
   **Não usar `REINDEX DATABASE`/`REINDEX SCHEMA`** neste projeto: esses comandos não rodam dentro de transação, e o pipeline de migrations aplica cada arquivo em transação única — a migration falharia. `REINDEX INDEX`/`REINDEX TABLE` por objeto são transacionais e ainda por cima limitam o lock a uma tabela por vez.
4. **Só então** registrar a versão nova:
   ```sql
   ALTER DATABASE postgres REFRESH COLLATION VERSION;
   ```
5. **Revalidar**: a query do passo 1 deve mostrar `registrada = real_do_so`; smoke de ordenação em uma tabela de texto.

### 9.6 Quando agendar
Em **janela de baixo tráfego** (madrugada BRT, idealmente junto com outra janela já planejada — ex.: a janela do rollback, se ele acontecer, ou a janela de aplicação da `20260921000000` pendente). `REINDEX` bloqueia escritas na tabela envolvida — em tabelas grandes (`oportunidades`, `comunicacoes`) medir a duração no ensaio em staging antes. Ordem prática: ensaiar no banco de teste/staging (onde o aviso existe de verdade), registrar duração, e só então agendar. Produção, reforçando, **não precisa** desta correção no estado medido em 2026-07-16 — se um dia o aviso aparecer lá (pós-upgrade de imagem), o mesmo roteiro se aplica.

---

## 10. Apêndices

### Apêndice A — Inventário de crons de produção (verificado em 2026-07-16: 31 ativos)

| Job | Schedule | Mexido pelo multi-tenant? | Ação no rollback total |
|---|---|---|---|
| `discover-agency-locations-6h` | `0 */6 * * *` | **Criado** (Fase 3, `20260807000000`) | Unschedule + drop da função (R-7.4) |
| `sync-meta-ads-hourly` | `0 * * * *` | Função `sync_meta_ads_job()` reescrita p/ loop por workspace (Fase 8, `20260728000000`) | Recriar corpo single-tenant (R-7.4) |
| `sync-meta-ads-7days-daily` | `0 6 * * *` | Reescrito idem (`20260728000000`) | Recriar corpo single-tenant (R-7.4) |
| `notion-sync-paid-creatives` / `notion-sync-organic-creatives` | `0 9,21 * * *` | Reescritos p/ loop por workspace (`20260729000000`) | Recriar corpos single-tenant (R-7.4) |
| `sync-ad-permalinks-daily` | `0 5 * * *` | Reescrito idem (`20260730000000`) | Recriar corpo single-tenant (R-7.4) |
| `sync-ghl-users-cron` | `0 */6 * * *` | Reescrito p/ loop por workspace + caller `service_role` (`20260808000000`) | Recriar corpo single-tenant (R-7.4), **mantendo** o caller `service_role` |
| `sync-appointment-dates-cron` | `3,8,13,...` | Só caller trocado p/ `service_role` (`20260808000000`) | **Manter** (hardening, não é tenant) |
| `sync-opp-pipelines-cron` / `sync-opp-pipelines-meeting-window-cron` / `sync-opp-sdr-cron` | vários | Só caller trocado p/ `service_role` | **Manter** |
| `sync-contact-attribution` / `sync-contact-tasks` | vários | Funções de job reescritas p/ `service_role` (`20260808000000`) | **Manter** |
| `weekly-email-dispatcher`, `weekly-reports-produtividade`, `weekly-reports-cohort`, `weekly-reports-cohort-reprocess` | vários | Header de auth trocado p/ `service_role` (`20260808000000`) | **Manter** |
| `ghl-api-worker-cron` | `* * * * *` | Schedule inalterado; a **function** `ghl-api-worker` mudou (credencial por job, Fase 4) | Coberto pelo re-deploy da function (R-5) |
| `ghl-mapping-detect-changes` / `ghl-mapping-discovery-watch` | `30 4`, `0 4 * * *` | Vieram de `20260819000000` (vigilância de mapping — feature posterior, não é tenant estrito) | Decisão do dono junto com a feature (R-5 item 4) |
| `ghl-opp-reconcile-nightly-start`, `ghl-opp-reconcile-processor`, `process-meta-ads-pending`, `processar-webhooks-ghl`, `recalcular-discagem-scores`, `sync-contact-opportunities`, `sync-contact-tags`, `sync-ghl-conversations-incremental`, `sync-opp-dates`, `sync-tags-from-webhook`, `weekly-reports-finalize` | vários | **Inalterados** pelo multi-tenant | Nada |
| ~~`reconcile-vendas-fechamento-cron`~~, ~~`stevo-process-att1/2/3`~~ | — | **Removidos** como órfãos (`20260810000000`) | **Não ressuscitar** (código morto) |

### Apêndice B — Migrations que compõem a adoção multi-tenant em produção

- **Núcleo (34, manifesto A–D, aplicadas 2026-07-13):** `20260720000000`–`20260802500000` (A, 16), `20260803000000`–`20260814000000` (B, 12), `20260815000000`–`20260818000000` (C, 4), `20260822000000` + `20260823000000` (D, 2).
- **Follow-ups dependentes (aplicadas depois, confirmadas no `migration list` em 2026-07-16):** `20260821000000`, `20260824000000`–`20260920000000` (inclui isolamento Clara/OpenRouter por workspace, telemetria de IA, fontes externas de formulário, seed/revoke genéricos de credencial, hardening de grants).
- **Fronteira pré-multi-tenant:** `20260713170448_create_meta_ads_account_daily.sql`.
- **Pendente em produção (não relacionada a tenant):** `20260921000000_revoke_internal_security_definer.sql`.

### Apêndice C — Objetos de schema criados pela adoção (checklist de reversão)

- **Tabelas:** `agencies`, `agency_members`, `agency_workspaces`, `workspace_integration_credentials`, `webhook_unresolved`, `outbound_webhooks`, `agency_ghl_credentials`, `workspace_deletion_requests`, `clara_workspace_settings`, `clara_settings_audit`, `workspace_ai_usage_events`, `workspace_external_form_sources`.
- **Colunas `workspace_id` (com `NOT NULL` + trigger):** `oportunidades`, `comunicacoes`, `vendas_fechamento`, `stevo_whatsapp_calls`, `meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_schedules`, `weekly_email_logs`; colunas extras em `ghl_api_jobs` (`workspace_id`, `location_id`) e em tabelas do bot/telegram.
- **Policies:** ~198 `agencia_*` em ~85 tabelas (retrofit `20260722000000`) + policies próprias das tabelas novas.
- **Funções/RPCs:** credenciais (`save_workspace_credential`, `get_workspace_credential_status`, `get_workspace_credential_meta`, `get_decrypted_secret`, `seed_workspace_ghl_credential_service_role`, `seed_workspace_credential_service_role`, `revoke_workspace_credential`), agência (`is_agency_member`, `is_agency_admin`, `can_access_workspace_via_agency`, `suspend_agency_workspace`, `reactivate_agency_workspace`, `create_agency_for_owner_service_role`, `adopt_existing_workspace_service_role`, `detach_adopted_workspace_service_role`, `save_agency_ghl_credential`, `get_agency_credential_meta`, `get_agency_ghl_credential_status`), LGPD (`request_workspace_deletion`, `export_workspace_data_manifest`, `purge_workspace_data`, `finalize_workspace_deletion_request`), routing (`get_workspace_id_by_ghl_location_id` versão fail-closed), outbound (`register_outbound_webhook`, `assert_outbound_url_safe`), triggers `set_workspace_id_*`, funções de cron por workspace (Apêndice A).
- **Segredos no Vault:** 4 entradas (`ghl`, `meta`, `openrouter` do workspace Default; `ghl` do Burn-in) — limpeza via `revoke_workspace_credential` por linha, **nunca** delete manual em `vault.secrets`.

### Apêndice D — Referências

`docs/ROADMAP-MULTI-TENANT.md` (§7.2/§7.3/§7.7), `docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`, `docs/MANIFESTO-RELEASE-MULTI-TENANT.md`, `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md`, `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`, `docs/SINGLE-TENANT-LOCK.md`, `docs/FASE-2-RUNBOOK-REVOGACAO-KILLSWITCH.md`, `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`, `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`, `docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`, tag git `backup/pre-main-merge-20260708-120345`, `scripts/build-multi-tenant-release-bundle.sh`, `scripts/provision-new-client.ts`, `scripts/purge-workspace.ts`.

---

*Fim do plano. Repetindo o aviso do topo: nenhum passo foi executado. Execução exige autorização explícita do dono, ensaio em staging e janela agendada.*
