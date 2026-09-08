# Validação Adversarial do Isolamento Multi-Tenant — Integração Meta Ads

> **Prioridade:** CRÍTICO
> **Postura:** cética — o objetivo desta sessão foi tentar QUEBRAR o isolamento da integração Meta, não confirmar que funciona.
> **Escopo:** só a integração Meta Ads (tabelas `meta_ads_*`, `workspace_meta_ad_accounts`, credenciais, sync, RPCs de análise). O núcleo GHL/CRM já foi validado em `docs/VALIDACAO-MULTITENANT.md` (rodadas 1 e 2, aplicadas em produção em 2026-07-19).
> **Estado:** ✅ **Aplicado em produção em 2026-07-19T11:xx UTC.** Ver [Aplicação em Produção (2026-07-19)](#aplicação-em-produção-2026-07-19) no final deste documento — deploy coordenado (frontend + migration), verificação dinâmica real (não só estática) confirmando o furo fechado e a aba Tráfego funcional.

## Veredito em uma frase

**Estava não isolada — agora está corrigido e verificado em produção.** As tabelas `meta_ads_*` em si (RLS, triggers, sync) já estavam bem endurecidas — melhor cobertura que o núcleo GHL na primeira rodada. O problema real era **duas RPCs de análise (`analisar_meta_crm_cruzado` e `analisar_meta_ads_por_regiao`) criadas antes da retrofit multi-tenant e nunca filtradas por workspace**, uma delas executável **por qualquer pessoa, sem login, usando a `anon key` pública**. Corrigido e aplicado em produção nesta sessão (ver seção final) — hoje `anon` recebe `permission denied` ao tentar chamar a função, e um usuário autenticado só vê dados do próprio workspace (testado ao vivo, não só verificado por leitura de policy).

## Metodologia e grau de confiança

- **Banco de teste/staging:** não existem mais (`docs/DECISAO-SO-PRODUCAO-2026-07-18.md`). Criar um projeto Supabase efêmero novo (org/billing, `supabase projects create`, provisionamento completo) não é viável de forma não-interativa nesta sessão sem credenciais de organização/billing que não estão disponíveis aqui.
- **Método usado:** introspecção **read-only** de produção (`qzesffnkqgelmtfblzkr`) via Supabase Management API, com um script dedicado (`scripts/query-prod-readonly.mjs`) que **só aceita `SELECT`/`WITH`/`EXPLAIN`** — bloqueado no próprio código contra qualquer mutação. Toda evidência abaixo vem de `pg_policies`, `pg_proc.proacl` (`has_function_privilege`), `pg_class.relrowsecurity`, `information_schema` e contagens reais nas tabelas — não são suposições a partir dos arquivos de migration (que podem divergir do estado real, ver `docs/BASELINE-REPRODUCIBILIDADE.md`).
- **Confiança:** **alta** para tudo que é política/grant/schema declarado (queries diretas contra o catálogo do Postgres em produção, determinístico). **Média** para o comportamento dinâmico do sync (`sync-meta-ads`), validado por leitura do código-fonte deployado, não por execução ao vivo contra a Meta API.
- **Não executei ataque ativo simulando um usuário real de um tenant.** Isso exigiria personificar uma sessão JWT real de um workspace ou criar dados sintéticos em produção — fora do que uma sessão read-only deveria fazer sem autorização explícita adicional. Toda a análise de "A consegue ler B" é feita lendo a política/RPC que o Postgres/PostgREST vai executar — o mesmo padrão de evidência aceito na rodada 1 do núcleo GHL.
- **2 tenants reais já existem em produção** (não precisei simular): `Default` (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`, 10.554 linhas em `meta_ads_insights`, 11.242 em `oportunidades`) e `Burn-in Interno` (`15cacbe4-8c3d-4af7-a028-e2eda7b569f4`, 0 linhas Meta/CRM). Isso deu um cenário real de "2 tenants, um vazio" em vez de sintético.

---

## Scorecard

| # | Superfície | Veredito | Evidência |
|---|-----------|----------|-----------|
| 1 | `meta_ads_insights` — SELECT cross-tenant | **PASS** | RLS ativa; única policy `authenticated`: `is_workspace_member(workspace_id) OR can_access_workspace_via_agency(workspace_id)`. `workspace_id` é `NOT NULL` (0 linhas NULL) — sem brecha residual |
| 2 | `meta_ads_insights_breakdowns` — SELECT cross-tenant | **PASS** | Mesmo padrão; `workspace_id NOT NULL`, 0 NULL |
| 3 | `meta_ads_raw_insights` — SELECT cross-tenant | **PASS** | Mesmo padrão; `NOT NULL`, 0 NULL. (Rodada 1 do núcleo GHL tinha achado uma policy antiga sem filtro nesta tabela — confirmado que já foi corrigida) |
| 4 | `meta_ads_account_daily` — SELECT cross-tenant | **PASS** | `is_workspace_member OR can_access_workspace_via_agency`; `NOT NULL`, CHECK validado |
| 5 | `meta_ads_campaigns` — SELECT cross-tenant | **PASS** | Duas policies redundantes (ambas corretas) checando membership; `NOT NULL` |
| 6 | `meta_ads_sync_log` — SELECT cross-tenant | **PASS (com ressalva cosmética)** | `workspace_id NOT NULL` (0 NULL) no banco real, mas a policy `agencia_select_meta_ads_sync_log` ainda contém a cláusula morta `workspace_id IS NULL OR ...` — nunca pode casar hoje, mas é lixo de policy que deveria ser limpo (ver Achado #3, baixo) |
| 7 | `workspace_meta_ad_accounts` — SELECT cross-tenant | **PASS** | `is_workspace_member OR can_access_workspace_via_agency` |
| 8 | `workspace_meta_ad_accounts` — grants de tabela para `anon`/`authenticated` | **PASS funcionalmente / FAIL defesa-em-profundidade** | Tabela tem `GRANT ALL` (INSERT/UPDATE/DELETE/TRUNCATE) para `anon` E `authenticated` — mas RLS está habilitada e **não existe nenhuma policy de INSERT/UPDATE/DELETE para esses roles** (só `service_role`), e nem `anon` nem `authenticated` têm `BYPASSRLS`. Escrita é bloqueada na prática. Achado #4 (baixo/hardening) |
| 9 | **`analisar_meta_crm_cruzado(date, date)`** — RPC de análise Meta+CRM | **FAIL — CRÍTICO (P0)** | `SECURITY DEFINER` (ignora RLS sempre), **sem parâmetro/filtro de workspace**, `EXECUTE` concedido a `anon` **e** `authenticated` (confirmado ao vivo via `has_function_privilege`). Chamada direto do frontend (`useMetaCrmCruzado.ts`, aba Tráfego) sem login algum necessário para ser invocada via REST. Ver Achado #1 |
| 10 | **`analisar_meta_ads_por_regiao(date, date)`** — RPC de análise por região (Clara) | **FAIL — ALTO (P1, hoje bloqueado na aplicação)** | `SECURITY INVOKER`, sem filtro de workspace. Via PostgREST direto (`anon`/`authenticated`) a RLS das tabelas de baixo protegeria — mas é chamada pela Clara através de um client com `SERVICE_ROLE_KEY` (`BYPASSRLS = true`), e o wrapper `createWorkspaceScopedClient` só intercepta `.from().select()`, nunca `.rpc()`. **Achei que estava ativamente explorável — na checagem do call site descobri que `bot-chat-data/index.ts` já bloqueia essa tool explicitamente** (`if (tool.name === 'query_meta_ads_region') throw new Error('Ferramenta indisponível...')`). Ou seja: sem exploração ativa hoje, mas a única barreira é uma string de nome de tool na camada de aplicação — nada no banco impede. Ver Achado #2 |
| 11 | `analisar_meta_ads(date, date, ...)` — RPC de análise Meta (sem caller ativo) | **FAIL — MÉDIO (P2, dormente)** | Mesmo padrão do #10 (sem filtro de workspace, `SECURITY INVOKER`), mas nenhum caller localizado em `supabase/functions/**` — risco latente, não ativo |
| 12 | Credencial Meta por workspace (`workspace_integration_credentials`, provider `meta`) | **PASS** | RLS ativa, **zero** policies para `anon`/`authenticated` (só `service_role`); tabela sem GRANT nenhum para esses roles (`REVOKE ALL ... FROM authenticated, anon` confirmado ao vivo) |
| 13 | RPCs de decifragem (`get_decrypted_secret`, `get_workspace_credential_meta`) | **PASS** | `has_function_privilege('authenticated', ...)` = `false`, `has_function_privilege('anon', ...)` = `false` — só `service_role` executa, confirmado ao vivo (o bug de "REVOKE FROM PUBLIC não revoga grant direto" documentado em `docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md` está corrigido para estas 2 funções) |
| 14 | Sync `sync-meta-ads` — escreve sempre no workspace certo? | **PASS** | `workspace_id` obrigatório no body (400 se ausente, sem fallback a env/"workspace mais antigo"); contas-alvo vêm exclusivamente de `workspace_meta_ad_accounts` filtradas por `workspace_id + is_active`; trigger `trg_validar_meta_ad_account_workspace` rejeita INSERT/UPDATE se a conta não estiver vinculada ao workspace informado (fail-closed, mesmo via `service_role` direto) |
| 15 | Cron Meta (`sync_meta_ads_job`, `sync_meta_ads_7days_job`) — dispara por tenant certo? | **PASS** | Itera `DISTINCT workspace_id FROM workspace_integration_credentials WHERE provider='meta'` e dispara uma chamada HTTP por workspace com `body.workspace_id` explícito — sem fallback "workspace mais antigo" (a mesma família de bug do webhook GHL não se repete aqui) |
| 16 | `get_meta_ads_campaign_metrics` (RPC de reporting) | **PASS** | Corrigida na migration `20260908000000` — exige `is_workspace_member(p_workspace_id)`; `anon` sem EXECUTE, `authenticated` só vê o próprio workspace |
| 17 | Isolamento de ad account entre tenants (mesma conta em 2 workspaces) | **PASS** | `UNIQUE INDEX ... (account_id) WHERE is_active = true` em `workspace_meta_ad_accounts` — impossível a mesma conta Meta estar ativa em 2 workspaces simultaneamente; trigger valida em toda INSERT/UPDATE nas 4 tabelas de dado |

---

## Achado #1 (CRÍTICO / P0) — `analisar_meta_crm_cruzado` vaza dados de todos os tenants, sem login

**O quê:** a função `analisar_meta_crm_cruzado(p_start_date DATE, p_end_date DATE)` (migration `20260627030000`) é `SECURITY DEFINER` — roda com o dono da função (bypassa RLS por completo) — e agrega `meta_ads_insights` (investimento, impressões, cliques, leads) cruzado com `oportunidades`/`contatos`/`vendas_fechamento` (leads, MQLs, reuniões, fechamentos) por `utm_campaign`/`campaign_name`, **sem qualquer filtro de `workspace_id`**.

**Confirmado ao vivo em produção:**
```sql
SELECT p.proname, p.prosecdef, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='analisar_meta_crm_cruzado';

 proname                  | prosecdef | auth_exec | anon_exec
 analisar_meta_crm_cruzado| true      | true      | true
```

`anon_exec = true` significa que **qualquer requisição HTTP não autenticada**, usando só a `anon key` pública (que já está no bundle JS do frontend, por design), pode chamar:

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/rest/v1/rpc/analisar_meta_crm_cruzado
apikey: <anon key pública>
{ "p_start_date": "2026-01-01", "p_end_date": "2026-12-31" }
```

e receber investimento Meta, leads, MQLs, reuniões e fechamentos agregados por campanha — de **todos os workspaces do banco**, sem nenhuma credencial de usuário.

**Por que não é hipotético:** a função já está com essa `EXECUTE` para `anon`/`authenticated` **em produção agora**, e é chamada de verdade pelo frontend (`eb-dash2/src/hooks/useMetaCrmCruzado.ts` → aba Tráfego, `TrafegoTab.tsx`). O único motivo de hoje não vazar dado de um 2º cliente é que o 2º workspace (`Burn-in Interno`) está com 0 linhas em `meta_ads_insights`/`oportunidades` — confirmado ao vivo. No instante em que existir um 2º tenant pago com dados reais, essa RPC devolve os números dos dois tenants somados/misturados por campanha para qualquer usuário logado (ou nem logado) do outro tenant.

**Por que passou despercebido antes:** foi criada em `20260627030000`, **antes** da retrofit multi-tenant das tabelas Meta Ads (`20260705000002` em diante) — nunca foi revisitada quando `workspace_id` foi adicionado a `meta_ads_insights`/`oportunidades`. O achado de PR #35 (policies de SELECT sem filtro) cobriu as **tabelas**, não as **RPCs de análise** que leem essas tabelas via `SECURITY DEFINER` — que é uma classe de bug diferente (RLS não protege RPC `SECURITY DEFINER` de jeito nenhum, é preciso filtrar dentro da função).

---

## Achado #2 (ALTO / P1) — `analisar_meta_ads_por_regiao` sem filtro de workspace; só uma checagem de nome de tool no app impede exploração hoje

**O quê:** `analisar_meta_ads_por_regiao(p_start_date, p_end_date)` (migration `20260618210000`) é `SECURITY INVOKER` e também **sem filtro de `workspace_id`**, cruzando `meta_ads_insights`/`meta_ads_insights_breakdowns` com `vendas_fechamento`/`oportunidades`/`contatos` por região brasileira.

**Por que `SECURITY INVOKER` normalmente seria seguro aqui:** se chamada via PostgREST direto por um usuário `authenticated` (ou `anon`), a função roda com os privilégios do chamador — e a RLS de `meta_ads_insights`/`vendas_fechamento` filtraria automaticamente pelo workspace do usuário. **Essa parte está OK** (confirmado: `anon_exec`/`auth_exec` = `true` no catálogo, mas o resultado seria vazio/só-do-próprio-workspace por causa da RLS por baixo).

**Onde quebra:** a função é chamada pela Clara (`supabase/functions/_shared/clara/executors.ts`, case `query_meta_ads_region`) através de um client Supabase construído com `SUPABASE_SERVICE_ROLE_KEY` — e `service_role` tem `rolbypassrls = true` (confirmado ao vivo em `pg_roles`). O wrapper que deveria conter esse client, `createWorkspaceScopedClient` (`supabase/functions/_shared/clara/workspace-query-guard.ts`), **só intercepta chamadas a `.from(table).select(...)`** — a lista `WORKSPACE_TABLES` nem inclui `meta_ads_insights_breakdowns`/`vendas_fechamento` diretamente, e mais importante: **o proxy nunca intercepta `.rpc(...)`**. Qualquer `supabase.rpc(...)` passa direto para o client real, sem filtro nenhum.

**Por que não é explorável em produção agora:** ao rastrear o call site (`supabase/functions/bot-chat-data/index.ts`), a própria tool está desabilitada explicitamente:
```ts
if (tool.name === 'run_sql_query' || tool.name === 'query_meta_ads_region') {
  throw new Error('Ferramenta indisponível até receber isolamento por conta.')
}
```
Ou seja, o time já tinha identificado esse tipo de risco e bloqueou a tool na camada de aplicação — **mas a única barreira é essa string de nome na aplicação, não a RPC em si nem o banco**. Se alguém reativar essa tool sem lembrar desse detalhe (ex: ao implementar "isolamento por conta" da Clara, mencionado no próprio comentário), o vazamento volta a valer imediatamente, porque a RPC continua sem filtro.

**Classificação:** ALTO em vez de CRÍTICO porque hoje está de fato bloqueada — mas é uma correção que precisa acontecer **antes** de reabilitar a tool, e o ideal é corrigir na RPC (defesa em profundidade), não confiar só no gate de aplicação.

## Achado #3 (BAIXO / limpeza) — `analisar_meta_ads` com o mesmo padrão, sem caller ativo

`analisar_meta_ads(date, date, group_by, ...)` (migration `20260620050000`) tem exatamente o mesmo formato de risco do Achado #2 (SECURITY INVOKER, sem workspace_id), mas nenhum caller foi localizado em `supabase/functions/**` — corrigida por simetria/prevenção, não por exploração confirmada.

## Achado #4 (BAIXO / cosmético) — cláusulas `workspace_id IS NULL` mortas em 3 policies

`meta_ads_insights` (`agencia_select_meta_ads_insights`), `meta_ads_insights_breakdowns` (`agencia_select_...`) e `meta_ads_sync_log` (`agencia_select_meta_ads_sync_log`) ainda têm a cláusula `workspace_id IS NULL OR ...` de quando essas colunas eram nullable. Hoje as 3 colunas são `NOT NULL` (0 linhas NULL confirmado ao vivo), então a cláusula nunca pode casar — não é uma vulnerabilidade ativa, é lixo de migration que deveria ser removido num cleanup futuro para não confundir a próxima leitura de policy.

## Achado #5 (BAIXO / defesa em profundidade) — grants de tabela largos demais em `workspace_meta_ad_accounts`

A tabela tem `GRANT ALL` (INSERT/UPDATE/DELETE/TRUNCATE) para `anon` e `authenticated` — herdado do padrão-modelo do Supabase (todas as tabelas `public` recebem isso por padrão; RLS é que deveria ser o gate real, e este é o mesmo padrão usado em todo o schema, não específico da Meta). RLS está habilitada e não existe policy de escrita para esses roles, então a escrita é bloqueada hoje. Mas outras tabelas de credencial do projeto (`workspace_integration_credentials`) já fazem `REVOKE ALL FROM authenticated, anon` explícito como defesa em profundidade — recomendo o mesmo aqui, já que esta tabela controla qual conta Meta pertence a qual workspace (dado sensível o suficiente para não depender só de RLS).

---

## Correção proposta (NÃO aplicada em produção)

Arquivo: `supabase/migrations/20261004000003_fix_meta_ads_rpcs_cross_tenant_p0.sql`

- Recria as 3 funções (`analisar_meta_crm_cruzado`, `analisar_meta_ads_por_regiao`, `analisar_meta_ads`) com um parâmetro **obrigatório** `p_workspace_id UUID`.
- Fail-closed: cada uma exige `is_workspace_member(p_workspace_id)` — sem isso, retorna vazio (mesmo padrão já usado em `get_meta_ads_campaign_metrics`, migration `20260908000000`).
- Filtra todas as tabelas de origem (`meta_ads_insights`, `meta_ads_insights_breakdowns`, `oportunidades`, `vendas_fechamento`) por `workspace_id = p_workspace_id`.
- `REVOKE ALL ... FROM PUBLIC, anon` explícito (não só `PUBLIC`) nas 3 — mesma causa raiz documentada em `20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql` (grant direto a `anon`/`authenticated` sobrevive a um `REVOKE FROM PUBLIC`).
- `GRANT EXECUTE` só para `authenticated` e `service_role`.

**Callers já atualizados no mesmo commit (evita quebrar produção no dia em que a migration for aplicada):**
- `eb-dash2/src/hooks/useMetaCrmCruzado.ts` — agora recebe `workspaceId` como 1º argumento e passa `p_workspace_id` na chamada RPC.
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` — resolve `workspaceId` via `getWorkspaceId()` (padrão já usado no resto do arquivo) e passa para o hook.
- `supabase/functions/_shared/clara/executors.ts` — `executeTool` ganhou um 4º parâmetro opcional `workspaceId`, repassado para `p_workspace_id` na chamada de `analisar_meta_ads_por_regiao`. **Não reativei a tool `query_meta_ads_region`** (continua bloqueada em `bot-chat-data/index.ts` — decisão de produto de outra sessão, fora do escopo desta auditoria); a mudança é só para a RPC já nascer correta no dia em que alguém reabilitar a tool.
- `supabase/functions/bot-chat-data/index.ts` — passa `body.workspace_id` para `executeTool`.

**Verificação estática feita:** `npx tsc --noEmit` limpo no `eb-dash2` após as mudanças. **Não testado ao vivo** (sem ambiente efêmero disponível) — ver seção seguinte para o plano de verificação pós-aplicação.

### Como validar depois de aplicar (reaproveitando o script desta auditoria)

```bash
node scripts/query-prod-readonly.mjs "
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('analisar_meta_crm_cruzado','analisar_meta_ads_por_regiao','analisar_meta_ads');
"
-- esperado: anon_exec = false nas 3

-- E, autenticado como usuário do workspace Burn-in Interno, chamar
-- analisar_meta_crm_cruzado com p_workspace_id = Default e confirmar 0 linhas
-- (is_workspace_member falha para um não-membro).
```

---

## Decisão pendente do dono

1. ~~Aplicar a migration em produção~~ — **FEITO, ver seção abaixo.**
2. **Cleanup opcional (Achado #4):** remover a cláusula `workspace_id IS NULL` das 3 policies remanescentes (dead code, não bloqueante).
3. **Hardening opcional (Achado #5):** `REVOKE ALL ON workspace_meta_ad_accounts FROM authenticated, anon` + regrant explícito de `SELECT` via policy (a tabela já tem `SELECT` correto via RLS; só a defesa-em-profundidade de INSERT/UPDATE/DELETE/TRUNCATE ficaria mais alinhada ao padrão de `workspace_integration_credentials`).
4. O restante do trabalho pendente de commit de sessão anterior (`docs/VALIDACAO-MULTITENANT.md` e as 2 migrations `20261004000000`/`20261004000002` do núcleo GHL) **continua sem commit** — não foi bundlado neste deploy de propósito (escopo separado). Considere commitar quando o dono revisar.

---

## Aplicação em Produção (2026-07-19)

**Autorização:** dono autorizou explicitamente deploy coordenado (frontend + migration) e, em seguida, o uso da flag `--allow-destructive` do `apply-migration.mjs` (o script recusou por padrão porque a migration contém `DROP FUNCTION` — redefinição de assinatura, não perda de dado; confirmado antes de aplicar que não há `DROP TABLE`/`DELETE`/`TRUNCATE`/`ALTER TABLE...DROP` no arquivo).

**Ponto de recuperação (PITR) confirmado ANTES da escrita:** WAL-G contínuo ativo, região `sa-east-1`, backup físico mais recente em `2026-07-19T11:00:26Z` (~24s antes da checagem) — `pitr_enabled: true`, `walg_enabled: true`.

**Gate de segurança (regra 1.6 da omnx-code):** auditoria escopada ao diff rodou `security-report/verdict.json` → `gate: PASS` (0 P0/P1/P2 abertos) antes do merge. Relatório: `security-report/audit-2026-07-19-meta-fix.md`.

**Sequência executada (Preferência 2 do dono — sequenciamento apertado, não retrocompatibilidade com overload):**

> Nota de decisão: o dono ofereceu duas alternativas — (1) manter a função antiga vulnerável viva temporariamente como overload de zero-downtime, ou (2) mergear o frontend, confirmar deploy ao vivo, e aplicar a migration imediatamente depois. Optei pela (2): manter o `analisar_meta_crm_cruzado(date,date)` antigo ativo mesmo que por poucos minutos significaria manter o vazamento `anon`-sem-login aberto durante a transição — o objetivo primário desta correção é fechar um P0 de segurança, não maximizar uptime de uma aba interna às 1h da manhã. A migration usa `DROP FUNCTION` da assinatura antiga + `CREATE OR REPLACE` da nova (não overload) — a função vulnerável deixa de existir no instante em que a migration roda.

1. PITR confirmado (acima).
2. Branch `fix/meta-ads-rpc-workspace-isolation` → commit → push → PR [#51](https://github.com/Empire-Business/GHL-SUPABASE/pull/51) → merge em `main` (commit `5ae2414`).
3. Deploy Vercel confirmado **ao vivo em produção** antes de tocar no banco — verificado via `vercel inspect`/`gh api .../deployments`: `target: production`, `status: Ready`, aliases incluindo os domínios reais do cliente (`dash.omnx.pro`, `ceo.omnx.pro`, `ceo.empirebusiness.com.br`).
4. Migration `20261004000003` aplicada via `node scripts/apply-migration.mjs ... --allow-destructive` — sucesso, registrada em `supabase_migrations.schema_migrations`.

### Verificação pós-aplicação (dinâmica, não só estática)

**1) Grants — furo fechado:**
```
proname                      | anon_exec | auth_exec | args
analisar_meta_crm_cruzado     | false     | true      | p_workspace_id uuid, p_start_date date, p_end_date date
analisar_meta_ads_por_regiao  | false     | true      | p_workspace_id uuid, p_start_date date, p_end_date date
analisar_meta_ads             | false     | true      | p_workspace_id uuid, p_start_date date, ...
```
`anon_exec = false` nas 3 — confirmado via `has_function_privilege` ao vivo, pós-aplicação.

**2) Teste funcional real (não simulação) — simulando JWT de um admin real do workspace `Default` via `request.jwt.claim.sub` + `role authenticated`:**

| Teste | Resultado |
|---|---|
| Admin do `Default` chama `analisar_meta_crm_cruzado` para o **próprio** workspace | ✅ 161 linhas, R$ 266.321,65 de investimento agregado — dado real, função funcional |
| Mesmo admin chama para o workspace `Burn-in Interno` (não é membro) | ✅ 0 linhas — isolado, sem erro, sem vazamento |
| Mesmo admin chama `analisar_meta_ads_por_regiao` para o próprio workspace | ✅ 1 linha, R$ 207.723,33 agregado — funcional |
| Mesmo admin chama `analisar_meta_ads_por_regiao` para `Burn-in Interno` | ✅ 0 linhas — isolado |
| Chamada como `role anon` (sem JWT) em `analisar_meta_crm_cruzado` | ✅ **`ERROR 42501: permission denied for function analisar_meta_crm_cruzado`** — bloqueado na camada de GRANT, nem chega a filtrar por linha |

Isso prova as duas pontas: (a) a aba Tráfego do cliente real continua funcionando — a função responde com dado real para o workspace correto; (b) o vazamento cross-tenant/anônimo está fechado — não é só ausência de dado, é rejeição explícita de permissão.

**3) Ingestão e dados intactos:**
- Cron `sync-meta-ads` rodou com sucesso às `2026-07-19 11:00:03 UTC` (24 registros buscados, 24 inseridos) — antes e depois da migration, sem interrupção.
- `meta_ads_insights`: `24` linhas com `fetched_at` nas últimas 2h no momento da checagem — ingestão contínua confirmada.
- `workspace_meta_ad_accounts` intacto: `Default` → `act_716772443330289`, `is_active = true` — vínculo conta↔workspace não foi tocado pela migration.

### Veredito final

✅ **Furo `anon`/cross-tenant fechado em produção** (testado, não só declarado). ✅ **Aba Tráfego funcional** para o workspace correto (testado com dado real). ✅ **Ingestão e dados do cliente intactos.** Janela de exposição entre o merge do frontend e a aplicação da migration: poucos minutos, mitigada por ser fora de horário de pico (~1h BRT) e por autorização explícita do dono a cada passo.
