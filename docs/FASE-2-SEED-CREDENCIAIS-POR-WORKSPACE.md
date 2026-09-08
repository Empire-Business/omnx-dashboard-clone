# Fase 2 — Cadastro de credenciais por workspace (runbook do operador)

> Onde ficam as credenciais por tenant e como cadastrar sem colocar segredo no git.
> Rode com `service_role` (psql). Nunca execute em produção sem antes validar no banco de teste.

## Tabela

`public.workspace_integration_credentials`
| coluna | uso |
|--------|-----|
| `workspace_id` | dono da credencial (obrigatório) |
| `provider` | `'ghl'`, `'meta'` ou `'notion'` |
| `secret_key_id` | uuid do segredo no **vault** (nunca plaintext) |
| `metadata` | jsonb com campos por provider (abaixo) |
| `rotation_version` | inteiro; incrementar invalida o cache do edge (revogação) |

> OpenClaw é à parte: usa `public.outbound_webhooks` + `register_outbound_webhook(...)`
> (ver `docs/FASE-2-FATIA-7-OUTBOUND-WEBHOOKS.md`).

## Metadata por provider

| provider | metadata obrigatório |
|----------|----------------------|
| `ghl` | `{ "location_id": "<GHL location id>" }` |
| `meta` | `{ "ad_account_id": "act_<id>" }` |
| `notion` | `{ "notion_database_id_paid": "<db id>", "notion_database_id_organic": "<id1,id2>" }` |

## Cadastrar UMA credencial — Meta/Notion (modelo genérico)

```sql
-- parâmetros (preencher): :WS :PROVIDER :SECRET :METADATA
WITH s AS (
  SELECT vault.create_secret(:SECRET, :PROVIDER || '@' || :WS::text, 'workspace credential') AS id
)
INSERT INTO public.workspace_integration_credentials
  (workspace_id, provider, secret_key_id, metadata, rotation_version)
SELECT :WS::uuid, :PROVIDER, s.id, :METADATA::jsonb, 1
FROM s
ON CONFLICT (workspace_id, provider) DO UPDATE
  SET secret_key_id = EXCLUDED.secret_key_id,
      metadata      = EXCLUDED.metadata,
      rotation_version = public.workspace_integration_credentials.rotation_version + 1;
```

> Sem essa linha, as funções por workspace falham **fechado**: crons viram no-op e
> chamadas manuais retornam 400. Cadastre **antes** do deploy/cutover em produção.

## Cutover da chave GHL (env global -> Vault) — RPC dedicada

**Item 3 do plano de segurança pós-Fase 3 (2026-07-11):** o bloco genérico acima
funciona, mas exige montar `vault.create_secret` à mão a cada rotação. Para o GHL
especificamente (o provider mais crítico — todas as edge functions de sync já
resolvem por workspace desde a Fase 2), existe uma RPC dedicada,
`seed_workspace_ghl_credential_service_role`, criada pela migration
`20260809000000_fase2_seed_ghl_credential_env_cutover.sql`:

```sql
-- Rodar com conexão service_role (NUNCA anon/authenticated — GRANT restringe isso).
-- O valor da chave NUNCA vai para um arquivo versionado — só entra aqui, em
-- tempo de execução, vindo de onde o operador guarda o segredo (cofre de senhas,
-- variável de ambiente local, etc.).
SELECT seed_workspace_ghl_credential_service_role(
  '<workspace-uuid>'::uuid,
  '<GHL_API_KEY real>',
  '<GHL_LOCATION_ID real>'
);
```

Idempotente (mesmo padrão de `save_workspace_credential`): rodar de novo com uma
chave nova rotaciona (`rotation_version` sobe, cache do edge expira em ≤10s).
Validado no banco de TESTE com valores sintéticos em
`__tests__/integration/ghl-credential-env-cutover.test.ts` (7/7) — nunca com a
chave real do GHL.

**Pré-requisito para aplicar em produção:** descobrir o `workspace_id` único
desta instância (Single-Tenant Lock — `docs/SINGLE-TENANT-LOCK.md`) via
`SELECT id FROM public.workspaces;` e ter a `GHL_API_KEY`/`GHL_LOCATION_ID` reais
em mãos (hoje configuradas como secret `GHL_API_KEY` nas edge functions, conforme
`CLAUDE.md`). Depois de rodar o `SELECT seed_workspace_ghl_credential_service_role(...)`
acima em produção, o secret `GHL_API_KEY` do ambiente das edge functions pode ser
removido (nenhuma function lê mais essa env var — confirmado por grep em
`supabase/functions/`).

## Revogar / rotacionar

Trocar o segredo e subir `rotation_version` (o bloco acima já faz isso no `ON CONFLICT`).
O cache no edge expira em ≤10s, então a troca propaga quase na hora. Para revogar de vez:
`DELETE FROM public.workspace_integration_credentials WHERE workspace_id = :WS AND provider = :P;`
— a partir daí o provider fica fail-closed para aquele workspace.

## Residual conhecido (não crítico)

`sync-meta-ads-backfill` (carga **histórica** do Meta Ads) ainda é single-tenant: grava
insights com `workspace_id` NULL. É uma ferramenta de recuperação de passado, de uso raro;
o fluxo **pra frente** (sync horário/diário, permalinks, Notion) já está 100% por workspace.
Isolar o backfill exige propagar `workspace_id` dentro da função SQL `processar_meta_ads_raw`
— fica como próxima etapa dedicada, de baixo risco, sem bloquear o multi-tenant do dia a dia.
