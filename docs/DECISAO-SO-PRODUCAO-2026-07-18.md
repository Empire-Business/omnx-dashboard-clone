# Decisão: operar apenas com o banco de PRODUÇÃO (2026-07-18)

> **Atualizado em:** 2026-07-18 BRT
> **Prioridade:** CRÍTICO
> **Decisão do dono:** sim, explícita (2026-07-18)

## A decisão

Os bancos de **TESTE** e **STAGING** serão **deletados**. A partir de agora o projeto
usa **somente o banco de produção** (`qzesffnkqgelmtfblzkr`).

Isso encerra o processo de 3 fases descrito em
[`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`](PIPELINE-TESTE-STAGING-PRODUCAO.md)
(agora HISTÓRICO).

## O que muda na prática

| Antes | Agora |
|---|---|
| Migration validada em teste → ensaiada em staging → aplicada em prod | Migration aplicada **direto em produção** |
| `supabase db reset` local + cópia de dados para testar | Sem ambiente de ensaio |
| Rollback ensaiado em staging antes de prod | Rollback só é testável na própria produção |
| `.env.test` / `.env.staging.local` com `TEST_PROJECT_REF` | Referências a esses projetos ficam órfãs (limpar) |

## Risco assumido (registrado para honestidade)

**Não há mais rede de segurança pré-produção.** Um erro de migration (DROP indevido,
ALTER que trunca, backfill que corrompe) passa a ser um incidente de produção direto,
sem chance de pegar no teste antes. A própria validação da migration
`20261001000000_user_dashboard_prefs` que acabou de ser feita usou o banco de teste —
esse recurso deixa de existir.

## Regras obrigatórias do novo modo (mitigação)

1. **Toda migration idempotente** — `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`, `ON CONFLICT DO NOTHING`. Reexecutar não pode quebrar.
2. **Backup/snapshot de produção antes de DDL destrutivo** — qualquer `DROP`, `ALTER COLUMN ... TYPE`, ou migration com backfill exige snapshot do Supabase (Dashboard → Database → Backups) imediatamente antes, e confirmação de que o point-in-time recovery está ativo.
3. **Preferir mudanças aditivas e reversíveis** — coluna nova nullable + backfill + constraint depois, nunca `DROP` seguido de recriar.
4. **Aval explícito do dono por janela** para qualquer migration destrutiva.
5. **Migration continua obrigatória** — nada de SQL manual solto; toda mudança de schema vira arquivo em `supabase/migrations/` e é registrada em `schema_migrations`.

## Limpeza pendente (referências órfãs a test/staging)

Após deletar os projetos, remover/atualizar:
- `.env.test`, `.env.staging.local` (contêm `TEST_PROJECT_REF` que deixa de existir).
- Config de Playwright/testes que aponte para teste (o dev server já aponta para produção).
- Menções a "banco de teste/staging" nos docs de processo (marcar histórico).

## Como as migrations são aplicadas agora (a IA aplica direto, sem CI)

Decisão do dono (2026-07-18): **não usar GitHub Actions**. A IA aplica cada migration
diretamente em produção, na mesma sessão em que a escreve, rodando um script local que
lê o `SUPABASE_ACCESS_TOKEN` do `.env.local`:

- **Uma migration específica:**
  `node scripts/apply-migration.mjs <arquivo.sql>` (destrutiva exige `--allow-destructive` + backup antes).
- **Todas as pendentes de uma vez:**
  `node scripts/apply-pending-migrations.mjs` (aplica só as ainda não registradas em `schema_migrations`; destrutiva exige o marcador `-- @auto-apply-destructive`).

Cada script confere se a migration já consta em `schema_migrations` (idempotente),
aplica o SQL via Supabase Management API e registra a versão.

**Credencial:** o `SUPABASE_ACCESS_TOKEN` vive só no `.env.local` (gitignored) — nunca
no git, nunca no bundle. É um **Access Token** do Supabase (revogável/expirável no
Dashboard → Account → Access Tokens), **não** a `service_role`. Recomendado: expiração
curta (7 dias) e rotação periódica.

**Trava de segurança:** migration destrutiva (`DROP`/`ALTER TYPE`/backfill) é **bloqueada
por padrão** — exige a flag `--allow-destructive` (apply-migration) ou o marcador
`-- @auto-apply-destructive` na migration (apply-pending), forçando revisão humana +
snapshot de produção antes de rodar algo irreversível.

> Não há CI de migrations. O workflow `apply-migrations.yml` que existia foi removido.
