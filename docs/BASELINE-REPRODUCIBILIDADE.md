# Finding — Schema de produção não é reproduzível pelas migrations

| Campo | Valor |
|-------|-------|
| **Atualizado em** | 2026-07-09 BRT |
| **Status** | Finding aberto (contornado na Fase 0; correção definitiva pendente) |
| **Severidade** | Média (não afeta produção; afeta setup-do-zero, CI e onboarding de devs) |
| **Relacionado** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) · [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) · [`__tests__/ENV-SETUP.md`](../__tests__/ENV-SETUP.md) |

---

## 1. O que foi descoberto

Durante a Fase 0 do plano multi-tenant, foi necessário montar um projeto Supabase de
teste com o **mesmo schema de produção** para provar o isolamento cross-tenant. Ao
tentar reproduzir o schema pelas migrations do repositório, duas falhas apareceram:

1. **Tabelas centrais não são criadas por nenhuma migration.** `contatos` e
   `oportunidades` (e outras) têm apenas uma migration **placeholder vazia**
   (`20260226300000_create_contatos_oportunidades.sql`). O DDL real dessas tabelas
   vive apenas em produção — foi criado fora do fluxo de migrations (SQL Editor /
   iterado manualmente) e nunca foi versionado.

2. ~~Nenhuma migration declara `GRANT`~~ — **CORRIGIDO em 2026-07-09.** Os GRANTs
   **são versionados**: 5 migrations aplicam `GRANT ALL ON ALL TABLES IN SCHEMA
   public TO service_role` e 32 arquivos de migration contêm `GRANT` (por tabela para
   `authenticated`, `EXECUTE` em funções, etc.). A convenção do projeto é declarar os
   privilégios **no fim da migration** que cria o objeto (ver
   `20260225100500_create_meta_ads_sync_infra.sql`). O caminho certo das migrations
   é `supabase/migrations/` (raiz), **não** `eb-dash2/supabase/migrations` (que não
   existe — foi o erro da leitura anterior). O que **não** existe é
   `ALTER DEFAULT PRIVILEGES`: privilégios não são automáticos para tabelas novas,
   logo a reprodutibilidade depende de cada migration GRANTar corretamente.

3. **O buraco real de reprodutibilidade não é GRANT — é DDL faltante + método de
   montagem do teste.** (a) `contatos`/`oportunidades` (e possivelmente outras
   tabelas antigas) não têm DDL versionado — só a migration placeholder vazia — então
   `db push` do zero **não as cria** e qualquer policy/teste/app que as referencie
   quebra. (b) O banco de teste da Fase 0 foi montado via `pg_dump --no-privileges`
   de produção, **não** via `supabase db push` das migrations. Assim, os GRANTs
   versionados nunca foram exercitados e o dump (sem privilégios) também derrubou os
   que existiam em produção → `authenticated` recebeu `42501 insufficient privilege`
   (RLS nem chega a ser avaliado). Contornamos com
   [`__tests__/fixtures/test-db-grants.sql`](../__tests__/fixtures/test-db-grants.sql).

Resultado: **`supabase start` limpo + `supabase db push` NÃO reproduzem o schema de
produção** — primariamente por (a) tabelas sem DDL versionado, secundariamente por
disciplina inconsistente de `GRANT ... TO authenticated` (há migrations que criam
tabela + policy mas esquecem o GRANT de tabela). O setup-do-zero está quebrado.

---

## 2. Como foi contornado na Fase 0

Para a prova de isolamento (Fase 0.2), o projeto de teste
(`fgjbmdsucruvtpywyhhf`) foi populado assim:

1. **Baseline fiel** via `pg_dump --schema-only --schema=public --no-owner
   --no-privileges` de produção → 112 tabelas / 112 com RLS / 386 policies.
2. **Seed de usuário-sistema** (`20260709230000_seed_system_audit_user.sql`) —
   necessário porque os triggers de auditoria fazem fallback para o UUID
   `00000000-0000-0000-0000-000000000000` (o dump é `--schema-only`, sem dados).
3. **Seed de privilégios** — [`__tests__/fixtures/test-db-grants.sql`](../__tests__/fixtures/test-db-grants.sql) —
   repõe os `GRANT`s que o dump (`--no-privileges`) derrubou. Como o teste foi
   montado por dump (e não por `db push`), os GRANTs versionados nas migrations
   também não entraram — este seed cobre os dois.

Com isso a suíte rodou **153/153 verdes, 0 vazamento**. O contorno é suficiente para
a Fase 0 e para o CI (que aponta para o projeto de teste já populado), mas **não**
resolve o problema de raiz.

---

## 3. Riscos do estado atual

- **CI frágil:** a suíte de isolamento (Fase 0.5) depende de um projeto de teste
  pré-populado manualmente. Se ele for recriado, alguém precisa lembrar de aplicar
  dump + 2 seeds à mão.
- **Onboarding de dev:** um dev novo não consegue subir o ambiente local com
  `supabase start` e ter o schema correto.
- **Replicação/provisionamento:** o fluxo de novo cliente
  ([`docs/REPLICACAO-TECNICA.md`](REPLICACAO-TECNICA.md)) presume migrations
  completas; hoje isso é falso para as tabelas mais antigas.
- **Deriva silenciosa:** produção pode divergir das migrations sem ninguém notar,
  porque as migrations não são a fonte de verdade de fato.

---

## 4. Plano de correção (futuro — pré-requisito de hardening)

> Não executado nesta sessão. Exige decisão e uma janela para validar contra
> produção sem risco. Listado aqui para não se perder.

1. **Versionar o DDL das tabelas faltantes.** Extrair o DDL real de produção de
   `contatos`/`oportunidades` (e de qualquer outra tabela que só exista em produção)
   e consolidá-lo como migration re-entrante (ponto de partida versionado em
   `supabase/migrations/` ou `supabase/baseline/`), de forma que `db push` do zero
   suba o schema inteiro.
2. **Auditar e completar GRANTs por tabela (não "declarar do zero").** Os GRANTs já
   são versionados por migration; o trabalho é garantir que **toda** tabela criada por
   migration tenha o `GRANT` necessário para `authenticated`/`anon` (e manter o
   `ALL TABLES TO service_role` já existente). Para as tabelas recém-versionadas no
   item 1, capturar os privilégios reais de produção e incluí-los na mesma migration.
   Como **não há** `ALTER DEFAULT PRIVILEGES`, essa disciplina precisa ser checada
   por tabela (idealmente em CI), não assumida.
3. **Re-entrância.** Garantir que a baseline/migrations sejam idempotentes
   (`CREATE IF NOT EXISTS`, `DROP IF EXISTS` onde fizer sentido) para rodarem em
   banco vazio e em banco já parcial.
4. **Prova de paridade.** Um check (manual ou em CI) que compara o schema de
   produção com o que as migrations produzem (diff de tabelas/policies/grants) e
   falha se divergirem.

**Critério de pronto:** `supabase start` limpo + `supabase db push` reproduzem as
112 tabelas, 386 policies e os GRANTs — e a suíte de isolamento passa contra esse
banco local, sem precisar de dump/seeds manuais.

---

## 5. Referências

- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — log da Fase 0 (onde o finding foi registrado).
- [`__tests__/ENV-SETUP.md`](../__tests__/ENV-SETUP.md) — como o projeto de teste é montado hoje (dump + seeds).
- [`__tests__/fixtures/test-db-grants.sql`](../__tests__/fixtures/test-db-grants.sql) — seed de privilégios (contorno).
