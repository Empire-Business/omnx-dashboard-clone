# Handoff para o dev de multi-tenant — tabela `meta_ads_account_daily`

> **Status em 2026-07-13:** os gaps descritos nas seções 1 e 2 foram corrigidos
> no código e foram mergeados em `main` pela PR #47. Este documento
> permanece como contexto e evidência do desenho; o rollout seguro está em
> [`docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`](ROLLOUT-MULTI-TENANT-PRODUCAO.md).
>
> Contexto completo do bug (não-multi-tenant) em
> [`docs/BUG-FIX-META-ADS-TIME-INCREMENT.md`](./BUG-FIX-META-ADS-TIME-INCREMENT.md).
> Leia primeiro se quiser entender o "porquê" da tabela existir.

---

## O que foi criado

**Tabela nova:** `meta_ads_account_daily` — migration
`supabase/migrations/20260713170448_create_meta_ads_account_daily.sql`.

1 linha por dia, com o `spend` oficial da Meta no **nível de conta**
(`level=account` da Meta Graph API — diferente de `meta_ads_insights`, que é
nível de anúncio). É a fonte de verdade para qualquer card de "Investimento
Total" no dashboard.

```sql
CREATE TABLE public.meta_ads_account_daily (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID,               -- nullable, ver seção abaixo
    account_id        TEXT NOT NULL,
    date              DATE NOT NULL,
    spend             NUMERIC(15,2) NOT NULL DEFAULT 0,
    account_currency  TEXT,
    raw_insight_id    UUID,
    fetched_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT meta_ads_account_daily_account_date_key UNIQUE (account_id, date)
);
```

---

## ✅ Gap 1 resolvido — `sync-meta-ads-backfill` por workspace

`supabase/functions/sync-meta-ads-backfill/index.ts` **não foi migrada** para
o modelo por-workspace que `sync-meta-ads` já usa (Fase 2/Fatia 8 do trabalho
de vocês, `workspace_integration_credentials` + `resolveWorkspaceCredential`).

Ela ainda lê credencial via variável de ambiente global:

```ts
const metaAccessToken = Deno.env.get('META_ACCESS_TOKEN');
const metaAdAccountId = Deno.env.get('META_AD_ACCOUNT_ID');
```

Isso significa:
- Todo `INSERT`/`upsert` que essa function faz em `meta_ads_insights` e em
  `meta_ads_account_daily` grava **`workspace_id = NULL`**.
- Ela só funciona hoje porque o projeto é single-tenant na prática (uma
  única conta Meta, via env global).
- **Quando vocês ligarem o segundo workspace com credencial Meta própria**,
  esta function vai continuar escrevendo tudo pro workspace `NULL` (ou vai
  falhar/misturar dados, dependendo de como o cutover for feito) — ela
  precisa do mesmo tratamento que `sync-meta-ads` já recebeu.

**O que fazer:** aplicar em `sync-meta-ads-backfill/index.ts` o mesmo padrão
já usado em `sync-meta-ads/index.ts`:
1. Receber `workspace_id` obrigatório no body (fail-closed, sem fallback a
   env).
2. Resolver credencial via `resolveWorkspaceCredential(supabase, workspaceId, 'meta')`
   (`supabase/functions/_shared/resolve-workspace-credentials.ts`).
3. Passar `workspace_id` no upsert de `meta_ads_insights` (já suporta a
   coluna, só falta popular) e de `meta_ads_account_daily`.

Isso não foi feito neste bugfix porque estava fora de escopo — o objetivo
era só corrigir o valor errado, não fechar o gap de multi-tenant que já
existia antes.

---

## ✅ Gap 2 resolvido — policy de RLS de agência

As outras tabelas `meta_ads_*` (`meta_ads_insights`,
`meta_ads_insights_breakdowns`, `meta_ads_raw_insights`) têm uma policy
adicional de acesso via agência, criada em
`20260722000000_fase1_agency_rls_retrofit.sql`:

```sql
CREATE POLICY "agencia_select_meta_ads_insights" ON public."meta_ads_insights"
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((workspace_id IS NULL) OR can_access_workspace_via_agency(workspace_id)));
```

`meta_ads_account_daily` **não tem essa policy** ainda. Ela foi
propositalmente deixada de fora da migration porque, no momento em que essa
migration rodou em produção, `can_access_workspace_via_agency()` **não
existia no banco de produção** — ela faz parte do backlog descrito no Gap 3
abaixo, que ainda não foi aplicado lá.

**O que fazer, quando o backlog de agência estiver aplicado em produção:**

```sql
CREATE POLICY "agencia_select_meta_ads_account_daily"
ON public.meta_ads_account_daily AS PERMISSIVE FOR SELECT TO authenticated
USING (
    workspace_id IS NULL
    OR can_access_workspace_via_agency(workspace_id)
);
```

(Nova migration — nunca editar a `20260713170448` já aplicada.)

Sem essa policy, um usuário de agência (que acessa múltiplos workspaces via
`can_access_workspace_via_agency`) **não vai ver** o card de Investimento
Total dos workspaces que não são dele diretamente — só a policy de
`is_workspace_member` funciona hoje.

---

## ⚠️ Gap 3 — produção com trilha de migrations divergente

Durante a aplicação da migration deste bugfix, descobrimos que o projeto de
produção (`qzesffnkqgelmtfblzkr`) está **31 migrations atrasado** em relação
ao que já existe em `main`:

```
20260710000000  até  20260817000000
```

O backlog multi-tenant está pronto/revisado em código, mas a produção não pode
receber um `db push` integral: ela segue a trilha histórica enquanto dois
baselines posteriores são *squashes* para banco novo. A classificação e a
ordem segura estão em `docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`.

**Isso é crítico para o seu trabalho porque:**
- Toda função (`can_access_workspace_via_agency`, RPCs de agência, etc.) que
  o código de multi-tenant espera **não existe ainda** no banco de produção
  atual.
- Se vocês testarem contra produção sem saber disso, vão ver erros de
  "function does not exist" que na verdade são só falta de deploy, não bug
  de código.

**Como eu confirmei isso** (reproduzível):
```bash
supabase link --project-ref qzesffnkqgelmtfblzkr
supabase migration list --linked
# Compare a coluna "Local" com "Remote" — tudo que estiver com Remote vazio
# está pendente.
```

**O que eu NÃO fiz:** não apliquei esse backlog (fora de escopo, risco alto,
mudança grande e não relacionada ao bug que eu estava resolvendo). Só apliquei
a migration da tabela nova, isoladamente — movendo temporariamente os outros
30 arquivos de migration para fora da pasta `supabase/migrations/` durante o
`db push`, e restaurando todos depois (confirmado via `git status`, nenhum
outro arquivo foi alterado).

**Decisão que precisa ser tomada pelo time:** quando e como aplicar esse
backlog em produção (`supabase db push` completo, revisão prévia de cada
migration, plano de rollback). Isso é trabalho seu, não meu — só documentando
o achado para vocês não descobrirem isso "na marra" no meio de outra tarefa.

---

## Arquivos tocados neste bugfix (para referência rápida)

| Arquivo | O que mudou |
|---|---|
| `supabase/migrations/20260713170448_create_meta_ads_account_daily.sql` | Tabela nova + RLS (sem policy de agência, ver Gap 2) |
| `supabase/functions/sync-meta-ads/index.ts` | `time_increment` no fetch por anúncio + novo fetch/upsert de nível de conta (já usa `workspace_id` corretamente, Gap 1 não se aplica aqui) |
| `supabase/functions/sync-meta-ads-backfill/index.ts` | `time_increment` (defensivo) + novo fetch/upsert de nível de conta (ainda single-tenant, ver Gap 1) |
| `eb-dash2/src/hooks/useTrafego.ts` | `MetaAccountDailyRow`, `computeMetaKpis(rows, accountDailyRows?)`, fetch de `meta_ads_account_daily` em `loadTrafegoDataset` e `useTrafego` |
| `eb-dash2/src/hooks/useAquisicao.ts` | Idem |
| `eb-dash2/src/hooks/usePreVendas.ts` | Idem (2 pontos de fetch no mesmo arquivo) |
| `eb-dash2/src/pages/**/*.tsx` (8 arquivos) | Threading de `accountDailyRows` via props/`SharedProps` até `computeMetaKpis` |

---

## Resumo em uma frase

A tabela nova funciona hoje porque o projeto ainda é single-tenant na
prática; ela tem os "ganchos" certos (`workspace_id` na tabela, já
consumida corretamente por `sync-meta-ads`) mas **dois pontos específicos
(`sync-meta-ads-backfill` e a policy de agência) precisam do mesmo
tratamento que o resto do sistema multi-tenant já recebeu antes de vocês
ligarem o segundo workspace com Meta Ads.**
