# BUG FIX: Tags NULL em contatos — MQLs invisíveis no dashboard

**Data:** 2026-04-06
**Severidade:** CRÍTICO
**Impacto:** 92 contatos com `tags = NULL`, sendo 78 MQLs completamente invisíveis em todos os painéis

---

## Sintoma

Leads que chegaram com a tag "mql" no webhook GHL não apareciam como MQL no dashboard. Campo `contatos.tags` estava `NULL` mesmo com webhooks contendo tags válidas.

**Caso que expôs o bug:** `henriquefilho@sieg.com` — chegou em 06/04/2026, tinha a tag `mql` nos dois webhooks, mas `contatos.tags = NULL`.

---

## Causa Raiz: Ambiguidade de overload no PostgreSQL

### O que aconteceu

A migration `20260326000001` criou a função:
```sql
CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook()
-- sem parâmetros
```

A migration `20260326000002` recriou a função com novo parâmetro:
```sql
CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(
  p_days_back INT DEFAULT 90
)
```

**Problema:** `CREATE OR REPLACE` com assinatura diferente **cria um novo overload** em vez de substituir. O PostgreSQL passou a ter dois candidatos para a chamada sem parâmetros:
1. `sync_tags_from_latest_webhook()` — versão original sem parâmetro
2. `sync_tags_from_latest_webhook(INT DEFAULT 90)` — nova versão com DEFAULT

Quando o cron chama `SELECT sync_tags_from_latest_webhook()`, o PostgreSQL não consegue escolher qual usar e lança:
```
ERROR: function sync_tags_from_latest_webhook() is not unique
HINT: Could not choose a best candidate function.
```

### Resultado
- **3.130 execuções com falha** entre 2026-03-26 e 2026-04-06
- **0 tags atualizadas** pelo cron em 11 dias
- **92 contatos** acumularam `tags = NULL` ou `tags = ''` incorretos
- **78 leads** com oportunidade em pipeline MQL tornaram-se invisíveis no dashboard

### Causas agravantes

1. **`extrair_dados_ghl` não atualiza tags:** O INSERT de novos contatos não inclui a coluna `tags`. O UPDATE posterior foi removido em migrations mais recentes. Contatos nasciam com `tags = NULL` e dependiam 100% do cron para ter tags.

2. **`tags = ''` por edge function:** `sync-contact-tags` (edge function) escrevia string vazia quando a API GHL não retornava tags. Isso sobrescrevia possíveis valores corretos.

3. **Sem monitoramento:** Não havia alerta para falhas consecutivas do cron, tornando o problema silencioso.

---

## Solução Aplicada

### Migration 1: `20260406000001_fix_sync_tags_ambiguity_and_backfill.sql`

**O que faz:**
1. `DROP FUNCTION public.sync_tags_from_latest_webhook()` — remove o overload ambíguo
2. Backfill completo com janela de 365 dias para todos os contatos afetados
3. Fix adicional para `tags = ''` (string vazia)
4. Reagendamento do cron (garante que está ativo)

**Resultado esperado:** todos os 92 contatos com tags NULL corrigidos em uma execução.

### Migration 2: `20260406000002_fix_extrair_dados_ghl_tags_on_trigger.sql`

**O que faz:** modifica `trigger_extrair_dados_ghl()` para chamar `sync_tags_from_webhook_target()` após cada webhook ser processado.

**Por que é necessário:** mesmo com o cron funcionando, há uma janela de até 5 minutos onde um lead recém-chegado pode não ter tags. A trigger garante sincronização imediata (tempo real, sem esperar o cron).

**Como funciona:**
```
Webhook chega
→ extrair_dados_ghl(NEW.id)          -- processa contato/opp/vendas (sem tocar tags)
→ sync_tags_from_webhook_target(ghl_id) -- busca o webhook mais recente COM tags e atualiza
```

`sync_tags_from_webhook_target` usa o índice `idx_webhooks_ghl_contact_id_created` para busca eficiente (sem full scan em `webhooks_ghl`).

---

## Verificação

Após aplicar as migrations, execute:

```sql
-- Verificar se ainda há contatos com tags NULL que têm webhooks com tags
SELECT COUNT(DISTINCT c.id) as contatos_tags_null_com_webhook_tags
FROM contatos c
JOIN webhooks_ghl w ON TRIM(w.payload->>'contact_id') = c.ghl_id
WHERE c.tags IS NULL
  AND payload->'tags' IS NOT NULL
  AND jsonb_typeof(payload->'tags') != 'null'
  AND jsonb_array_length(payload->'tags') > 0;
-- Esperado: 0

-- Verificar scope total
SELECT
  COUNT(*) FILTER (WHERE tags IS NULL) AS tags_null,
  COUNT(*) FILTER (WHERE tags = '')    AS tags_vazias,
  COUNT(*) FILTER (WHERE tags IS NOT NULL AND tags != '') AS tags_ok,
  COUNT(*)                             AS total
FROM contatos;
-- tags_null e tags_vazias devem ser próximos de zero

-- Verificar que o overload foi removido (deve retornar apenas 1 linha)
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname = 'sync_tags_from_latest_webhook';
-- Esperado: 1 linha com "p_days_back integer DEFAULT 90"

-- Verificar que o cron está ativo e sem erros recentes
SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'sync-tags-from-webhook';
```

---

## Prevenção Futura

1. **Nunca use `CREATE OR REPLACE FUNCTION` para mudar a assinatura** — sempre `DROP FUNCTION` antes de recriar com parâmetros diferentes.

2. **Monitorar falhas de cron:** considerar adicionar alertas quando `cron.job_run_details` acumula erros consecutivos para jobs críticos.

3. **Defense in depth implementada:**
   - Trigger: sincroniza tags imediatamente a cada webhook
   - Cron: re-sincroniza a cada 5 minutos (fallback)
   - `sync_tags_from_webhook_target`: disponível para reparo manual/operacional por contato

---

## Arquivos Modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `supabase/migrations/20260406000001_fix_sync_tags_ambiguity_and_backfill.sql` | Migration | Remove overload + backfill 365 dias |
| `supabase/migrations/20260406000002_fix_extrair_dados_ghl_tags_on_trigger.sql` | Migration | Trigger atualiza tags em tempo real |
