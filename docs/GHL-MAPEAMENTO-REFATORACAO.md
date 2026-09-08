# GHL Mapeamento — Refatoração da Extração (Fase 4)

> Documentação da Fase 4: refatoração da extração de webhooks GHL para usar mapeamentos configuráveis por workspace (`ghl_field_mappings`), preservando o comportamento atual do sistema.

---

## 🎯 Objetivo

O `extrair_dados_ghl()` original (v1) possui todas as chaves GHL hard-coded. Isso funciona para a conta Empire atual, mas impede a replicação do sistema para outros workspaces/com contas GHL diferentes. A Fase 4 criou uma **nova função `extrair_dados_ghl_v2`** que consulta os mapeamentos por workspace, mantendo equivalência com a v1 para o template `Empire Default`.

---

## 🏗️ Arquitetura

```
webhooks_ghl.payload (imutável)
        │
        ▼
get_workspace_id_by_ghl_location_id(locationId)
        │
        ▼
apply_ghl_field_mappings(workspace_id, payload)
        │
        ▼
resolve_ghl_field_value(payload, variations)
        │
        ▼
extrair_dados_ghl_v2(webhook_id)
        │
        ├──► contatos (INSERT / UPDATE)
        ├──► oportunidades (INSERT / UPDATE)
        └──► enqueue_ghl_api_job (sync SDR / followers)
```

---

## 📦 Funções e Helpers

### `resolve_ghl_field_value(p_payload jsonb, p_variations jsonb)`

Extrai um valor do payload tentando cada variação de chave em ordem.

**Suporta:**
- Chaves simples: `utm_source` → `payload->>'utm_source'`
- Caminhos aninhados: `lastAttributionSource.utmSource` → `payload #>> '{lastAttributionSource,utmSource}'`
- Campos customizados: `{{opportunity.mqlconectado}}` → `payload->'customData'->>'{{opportunity.mqlconectado}}'`
- Fallback compacto para `{{...}}` (remove espaços internos)

**Retorno:** primeiro valor não-nulo e não-vazio, ou `NULL`.

### `apply_ghl_field_mappings(p_workspace_id uuid, p_payload jsonb)`

Retorna `jsonb` com `{ logical_name: valor }` para todos os mapeamentos ativos do workspace.

### `get_workspace_id_by_ghl_location_id(p_location_id text)`

Resolve o workspace a partir do `locationId` do payload. Na Fase A (instância isolada), faz fallback para o workspace mais antigo caso não haja match.

### `extrair_dados_ghl_v2(p_webhook_id uuid DEFAULT NULL)`

Nova função de extração. Mesma assinatura de retorno da v1:

```sql
RETURNS TABLE(
    contatos_inseridos integer,
    contatos_atualizados integer,
    oportunidades_inseridas integer,
    oportunidades_atualizadas integer,
    vendas_inseridas integer,
    comunicacoes_inseridas integer,
    reunioes_inseridas integer
)
```

---

## ⚠️ Regras Críticas Preservadas

| Regra | Implementação na v2 |
|-------|---------------------|
| UTM sempre sobrescreve | Variações no template incluem `lastAttributionSource.*` como fallback |
| `pipeline_id` nunca NULL | `COALESCE(mapped->>'pipeline_id_opp', o.pipeline_id)` no UPDATE |
| `data_lead_recebido` não vem do webhook | `NULL::TIMESTAMPTZ` no INSERT; omitido no UPDATE |
| Cache nome/email em oportunidades | `full_name` e `email` mapeados para `nome_contato` / `email_contato` |
| Enfileirar sync SDR | Passo 2.6 mantido, idêntico à v1 |
| Webhook payload imutável | Nunca lê/escreve em `webhooks_ghl.payload` além de SELECT |

---

## 🗃️ Migrations Criadas

| Arquivo | Descrição |
|---------|-----------|
| `supabase/migrations/20260708000000_update_empire_default_template_full.sql` | Atualiza o template `Empire Default` com todos os campos necessários para equivalência v1/v2 |
| `supabase/migrations/20260708000001_create_ghl_field_mapping_helpers.sql` | Cria `resolve_ghl_field_value`, `apply_ghl_field_mappings`, `get_workspace_id_by_ghl_location_id` |
| `supabase/migrations/20260708000002_seed_ghl_field_mappings_for_workspaces.sql` | Faz seed de `ghl_field_mappings` para workspaces existentes e cria trigger para novos workspaces |
| `supabase/migrations/20260708000003_create_extrair_dados_ghl_v2.sql` | Cria `extrair_dados_ghl_v2` |
| `supabase/migrations/20260708000004_create_test_extrair_dados_ghl_v2.sql` | Cria `test_extrair_dados_ghl_v2_equivalence()` |
| `supabase/migrations/20260708000005_switch_trigger_to_extrair_dados_ghl_v2.sql` | Substitui `trigger_extrair_dados_ghl()` para chamar v2 |

---

## 🧪 Testes

### Teste sintético (ROLLBACK)

```bash
psql <database> -f tests/sql/test_extrair_dados_ghl_v2_equivalence.sql
```

Cria webhooks de teste, processa v1 e v2 em cópias idênticas e verifica equivalência dentro de uma transação com `ROLLBACK`.

### Teste em webhooks reais

```sql
BEGIN;
SELECT * FROM test_extrair_dados_ghl_v2_equivalence(50);
ROLLBACK;
```

Se todas as linhas retornarem `status = 'OK'`, v1 e v2 são equivalentes para essa amostra.

---

## 🔄 Trigger Final

A trigger `auto_extrair_dados_ghl` passa a executar `extrair_dados_ghl_v2(NEW.id)` e, em seguida, `sync_tags_from_webhook_target()` para garantir que as tags do contato reflitam o webhook mais recente com tags.

---

## 📝 Backfill / Seed

Workspaces existentes recebem automaticamente o template `Empire Default` em `ghl_field_mappings`. Novos workspaces recebem o seed via trigger `trg_new_workspace_ghl_field_mappings`.

---

## 🔒 Segurança

- As funções seguem o mesmo padrão de permissões da v1 (`SECURITY INVOKER`).
- `ghl_api_key` não é armazenada no banco. Ela é lida do secret `GHL_API_KEY` das edge functions do Supabase e nunca exposta no frontend.
- RLS das tabelas de mapeamento é respeitado.

---

## 📁 Arquivos Relacionados

- `docs/GHL-MAPEAMENTO-CAMPOS.md` — fundação das tabelas de mapeamento (Fase 1)
- `docs/GHL-CONFIG-UI.md` — interface de configuração (Fase 3)
- `tests/sql/test_extrair_dados_ghl_v2_equivalence.sql` — teste sintético

---

*Última atualização: 2026-07-08 BRT*
