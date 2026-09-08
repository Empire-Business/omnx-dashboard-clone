# Setup de ambiente — testes de integração (isolamento multi-tenant)

Os testes em `__tests__/integration/` rodam contra um Supabase via PostgREST, usando o helper
`__tests__/helpers/supabase-test-client.ts`. Há **duas formas** de fornecer o banco de teste.

## Variáveis necessárias

| Var | Descrição |
|-----|-----------|
| `SUPABASE_URL` | URL do projeto (local ou de teste) |
| `SUPABASE_ANON_KEY` | Chave pública `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave `service_role` (só setup/teardown de teste) |
| `TEST_PROJECT_REF` | Ref do projeto de teste — usado pela trava anti-produção (Fase 0.4) |

Já existe um `.env.test` na raiz para o banco remoto de testes. Para staging, use
`.env.staging.local` (também **gitignorado**) e mantenha os dois ambientes separados.

---

## Opção A — Supabase LOCAL (Docker, grátis, offline)

```bash
# 1) Ligue o Docker Desktop e suba o Supabase local
supabase start

# 2) Exporte as chaves locais para o shell (sem commitar nada)
eval "$(supabase status -o env | sed 's/^/export /')"

# 3) Rode a suite a partir da raiz
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
```

## Opção B — Projeto Supabase de TESTE remoto (mais fiel à produção)

Pré-requisito: o projeto de teste precisa estar **com o schema aplicado** (as 120 tabelas +
políticas RLS), mesmo que sem dados. Se estiver 100% vazio, aplicar as migrations antes
(`supabase db push` apontando para ele — só em projeto de teste, nunca em produção).

1. No Supabase Dashboard do projeto **de teste**: *Project Settings → API*.
2. Para o banco de testes, preencha `.env.test` (raiz). Para staging, preencha
   `.env.staging.local` com `Project URL`, `anon public`, `service_role secret`,
   `Project ID` e a string de conexão do *Session pooler*. Nunca use a senha da
   sua conta Supabase; ela não é uma variável do projeto.
3. **Aplique os GRANTs de teste** (obrigatório uma vez por projeto). O schema de
   teste é reproduzido por dump de produção sem privilégios, e nenhuma migration
   declara `GRANT`; sem eles o role `authenticated` recebe `42501` em todo SELECT.
   ```bash
   psql "$TEST_DB_URL" -v ON_ERROR_STOP=0 -f __tests__/fixtures/test-db-grants.sql
   ```
   (`TEST_DB_URL` = connection string do projeto de teste; use a *Session pooler*
   se a *Direct* travar por IPv6. Isto **não** afrouxa RLS — só libera a entrada
   na tabela; a policy continua filtrando linha a linha.)
4. Rode a suite a partir da raiz. Sem variável adicional, o config carrega
   `.env.test`:

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
```

Para staging, o config carrega `.env.staging.local` e rejeita qualquer modo
que não seja `test` ou `staging`:

```bash
TEST_ENV_MODE=staging ./eb-dash2/node_modules/.bin/vitest \
  -c eb-dash2/vitest.integration.config.ts run
```

> Resultado esperado (2026-07-11, contra `fgjbmdsucruvtpywyhhf`): **376/376 verdes**
> (fixture ampliada para 79 tabelas com `workspace_id` + 41 sem, suite genérica de
> isolamento em 132 provas, `workspace_deletion_requests` com suite dedicada nova),
> **0 vazamento** cross-tenant.

---

## Sanidade da fixture (não precisa de Supabase)

Valida o mapa de tabelas RLS sem banco:

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts \
  run __tests__/integration/rls-fixture.test.ts
```

## Fase 3 — POC da Agency API do GHL (staging não provisionado)

Decisão do dono (2026-07-11): o ambiente de staging não vai ser provisionado — a POC da
Fase 3 (`docs/PLANO-MULTI-TENANT-AGENCY.md`, seção 6.2) roda contra este mesmo banco de
TESTE (`fgjbmdsucruvtpywyhhf`), com chamadas **reais** à API do GHL usando um token de
nível agência. Isso é válido porque a POC responde "o endpoint/consentimento/webhook/campo
de admin funcionam de verdade?" — uma pergunta de comportamento da API GHL, não de volume/
performance (isso sim exigiria staging de verdade e continua pendente).

`.env.test` já tem uma seção própria com os campos em branco: `GHL_AGENCY_API_TOKEN`,
`GHL_AGENCY_COMPANY_ID`, `GHL_TEST_LOCATION_ID_1/2/3_CRIADA_DEPOIS` (a 3ª precisa ser
criada **depois** de gerar o token, para testar descoberta contínua). Preencha lá — nunca
commitar, arquivo já gitignorado.

## Regra de segurança

- **NUNCA** aponte `SUPABASE_URL` para o projeto de produção.
- **NUNCA** commite `.env.test` ou `.env.staging.local` (já estão no `.gitignore`).
- A `service_role` é usada **apenas** para preparar/limpar o cenário de teste; as checagens de
  isolamento usam a `anon key` autenticada como usuário A/B (sujeita a RLS).
- A Fase 0.4 adiciona uma guarda (`__tests__/helpers/safe-guard.ts`) que recusa a execução se a
  URL não for local nem o projeto de teste declarado em `TEST_PROJECT_REF`.
