# Fase 2 — Runbook de revogação e kill-switch

| Campo | Valor |
|-------|-------|
| **Atualizado em** | 2026-07-10 BRT |
| **Escopo** | Operar a troca/revogação de credenciais por workspace e o critério de abandono (kill-switch) da Fase 2 |
| **Onde roda** | Sempre com `service_role` (psql). Validar no banco de **teste** antes de produção. |
| **Referências** | `docs/PLANO-FASE-2-ISOLAMENTO-CREDENCIAIS.md` (seções 5.3.3 e 10.2), `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md` |

> Em uma frase: **trocar a chave de verdade no fornecedor (GHL/Meta/Notion) é o passo principal**; o banco só precisa saber a chave nova e que ela mudou. O cache das edge functions expira sozinho em **até 10 segundos**.

---

## 1. Onde fica cada coisa

- O **segredo** (a chave de verdade) fica no **Vault** do Supabase (`vault.secrets`), nunca em texto no banco.
- A tabela `public.workspace_integration_credentials` guarda, por `workspace_id` + `provider`, só:
  - `secret_key_id` → ponteiro para o segredo no Vault;
  - `metadata` → dados não sensíveis (`location_id`, `ad_account_id`, ids de database);
  - `rotation_version` → número que, quando sobe, invalida o cache das edge functions.
- A leitura do segredo é feita **só** por `service_role` (RPCs `get_workspace_credential_meta` e `get_decrypted_secret`). Nem o dono do workspace lê.

---

## 2. Rotacionar uma chave (troca planejada)

Use quando o fornecedor trocar a chave, ou por rotina de segurança.

**Passo 1 — no fornecedor (GHL/Meta/Notion):** gere a chave nova e anote. Só depois mexa no banco.

**Passo 2 — no banco (`service_role`):** rode o bloco abaixo trocando `:WS`, `:PROVIDER`, `:SECRET`, `:METADATA`. Ele cria o segredo novo no Vault e **sobe `rotation_version` automaticamente** no `ON CONFLICT`.

```sql
WITH s AS (
  SELECT vault.create_secret(:SECRET, :PROVIDER || '@' || :WS::text, 'workspace credential') AS id
)
INSERT INTO public.workspace_integration_credentials
  (workspace_id, provider, secret_key_id, metadata, rotation_version)
SELECT :WS::uuid, :PROVIDER, s.id, :METADATA::jsonb, 1
FROM s
ON CONFLICT (workspace_id, provider) DO UPDATE
  SET secret_key_id    = EXCLUDED.secret_key_id,
      metadata         = EXCLUDED.metadata,
      rotation_version = public.workspace_integration_credentials.rotation_version + 1;
```

**Passo 3 — confirmar a propagação (≤10s):**

```sql
SELECT rotation_version, updated_at
FROM public.workspace_integration_credentials
WHERE workspace_id = :WS::uuid AND provider = :PROVIDER;
```

O `rotation_version` novo é o sinal que as edge functions releem a cada request; o segredo antigo sai do cache em até 10s. Depois disso, **revogue a chave velha no fornecedor**.

> Sem essa linha cadastrada, as funções por workspace **falham fechado**: crons viram no-op e chamadas manuais retornam 400. Cadastre **antes** do cutover em produção.

---

## 3. Revogar de vez (kill-switch por workspace + provider)

Use quando um cliente sair, uma chave vazar, ou você quiser **desligar um provedor de um workspace** imediatamente.

```sql
DELETE FROM public.workspace_integration_credentials
WHERE workspace_id = :WS::uuid AND provider = :PROVIDER;
```

Efeito: a partir do próximo request (≤10s), qualquer chamada daquele workspace para aquele provedor **falha fechado** (erro, sem chamar a API externa), e os crons daquele provedor param de disparar para ele. Nenhum outro workspace é afetado.

**Para voltar:** cadastre de novo com o bloco da seção 2.

> Para desligar **só os webhooks de saída (OpenClaw)**, apague a linha em `public.outbound_webhooks` do workspace — mecanismo separado (`docs/FASE-2-FATIA-7-OUTBOUND-WEBHOOKS.md`).

---

## 4. Kill-switch da Fase 2 (critério de abandono — seção 10.2)

Este é o freio de emergência **do projeto**, não de um cliente.

A Fase 2 é declarada **inviável** se, depois de **2 ciclos completos de correção**, a suite de isolamento ainda mostrar **qualquer** um destes problemas:

- **(a)** vazamento de leitura entre tenants (um workspace lê dado/credencial de outro);
- **(b)** uso de chave de um workspace em chamada feita em nome de outro.

Se isso acontecer: **pausar**, **não avançar** para a Fase 3+, e **manter o modelo de instância isolada** (1 instância = 1 empresa) como padrão.

**Como medimos hoje (no banco de teste):**

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
```

O arquivo `__tests__/integration/credential-isolation.test.ts` (31 provas) agrega as garantias da Fase 2, e a suite completa (`workspace-isolation`, `agency-*`, etc.) cobre leitura cross-tenant. **Verde = sem vazamento conhecido.** Qualquer vermelho aqui bloqueia o avanço até correção.

---

## 5. Checklist rápido do operador

Antes de ligar um workspace novo (ou fazer cutover em produção):

- [ ] A credencial do workspace está cadastrada (seção 2) e `rotation_version >= 1`.
- [ ] Sei revogar (seção 3) sem derrubar os outros workspaces.
- [ ] A suite de isolamento está verde no banco de teste.
- [ ] Em produção, só aplico migration versionada via `docs/PIPELINE-TESTE-STAGING-PRODUCAO.md` — nunca SQL manual.

---

## 6. Residual conhecido (não bloqueia)

`sync-meta-ads-backfill` (carga **histórica** do Meta Ads) ainda é single-tenant: grava insights com `workspace_id` NULL. É ferramenta de recuperação de passado, de uso raro; o fluxo **pra frente** (sync horário/diário, permalinks, Notion) já está 100% por workspace. Isolar o backfill exige propagar `workspace_id` dentro da função SQL `processar_meta_ads_raw` — próxima etapa dedicada, de baixo risco.
