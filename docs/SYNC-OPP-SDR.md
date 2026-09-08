# sync-opp-sdr — Edge Function

Sincroniza o campo `oportunidades.sdr_name` via API GHL Followers, garantindo que cada oportunidade tenha seu próprio SDR independente do contato.

## Por que existe

Antes desta função, o SDR de um lead era armazenado em `contatos.owner_name` — um único campo por contato. O problema: o mesmo lead pode ter múltiplas oportunidades em pipelines diferentes, cada uma tratada por um SDR diferente. Com um campo único em `contatos`, o histórico era sobrescrito toda vez que o contato mudava de dono.

**Solução:** cada oportunidade tem seu próprio `sdr_name`, populado via `GET /opportunities/{id}/followers` da API GHL. O follower da oportunidade é o SDR responsável por aquela negociação específica.

## Endpoint

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-sdr
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{ "batch_size": 100 }
```

**Parâmetros:**
- `batch_size` (opcional, default: 100, máximo: 500) — quantas oportunidades processar por chamada

**Resposta:**
```json
{
  "processed_jobs": 45,
  "updated": 42,
  "dead_jobs": 0,
  "nodata": 2,
  "not_found": 1,
  "enqueued": 38,
  "remaining": 12,
  "queue_pending": 38,
  "queue_processing": 0
}
```

## API GHL utilizada

```
GET https://services.leadconnectorhq.com/opportunities/{ghl_opportunity_id}/followers
Headers:
  Authorization: Bearer {GHL_API_KEY}
  Version: 2021-04-15

Resposta:
{
  "followers": [
    { "id": "ghl_user_id_abc", "name": "Ana Lima", "email": "ana@empresa.com" }
  ]
}
```

- Rate limit GHL: 100 req/10s (compartilhado via `ghl_api_jobs`)
- A lista pode ser vazia — nesse caso aplica o fallback

## Lógica de resolução do SDR

O sistema tenta em cascata:

1. **`followers[0].id` → `ghl_users.nome`** — resolve o ID GHL do follower para o nome canônico cadastrado no sistema
2. **`followers[0].name`** — usa o nome bruto retornado pela API do GHL
3. **`contatos.owner_name`** — fallback quando a API retorna lista vazia ou sem follower reconhecido

Se nenhum fallback retornar valor, `sdr_name` permanece NULL e o cron tentará novamente na próxima execução.

## Fluxo via fila central (3 fases)

Esta função segue o padrão de todas as sync functions do projeto:

1. **Fase 1 — Drena jobs concluídos:** busca jobs `done`/`dead` em `ghl_api_jobs` com `caller='sync-opp-sdr'` e `handled_at IS NULL`; aplica `sdr_name` nas oportunidades
2. **Fase 2 — Enfileira pendências:** busca oportunidades com `sdr_name IS NULL` e `ghl_opportunity_id IS NOT NULL`; enfileira `GET /opportunities/{id}/followers` na fila central
3. **Fase 3 — Drena novamente:** repete a fase 1 para capturar jobs que terminaram durante a própria execução (elimina janela entre `processed_at` e `handled_at`)

## Disparadores

### 1. Webhook em tempo real (urgente)

A função `extrair_dados_ghl()` no banco inclui um **PASSO 2.6** que enfileira o job de followers para cada oportunidade processada. Este job usa `priority=1` (urgente) e é idempotente via `idempotency_key = 'sync-opp-sdr:{opp.id}'`.

O bloco só executa se `p_webhook_id IS NOT NULL` — evita flood em operações de backfill em massa.

Migration: `20260327100002_extrair_dados_ghl_enqueue_followers_job.sql`

### 2. Cron automático (a cada 10 minutos)

```sql
SELECT cron.schedule(
  'sync-opp-sdr-cron',
  '6,16,26,36,46,56 * * * *',  -- offset :06
  -- chama POST à edge function com batch_size=100
);
```

**Stagger de crons (offset dentro de cada ciclo de 10 min):**

| Cron | Offset |
|------|--------|
| `sync-ghl-conversations-incremental` | `:00` |
| `sync-opp-dates` | `:02` |
| `sync-opp-pipelines-cron` | `:04` |
| `sync-opp-sdr-cron` | `:06` ← NOVO |

Migration: `20260327100004_cron_sync_opp_sdr.sql`

### 3. Manual (backfill ou validação)

```bash
# 1) enfileira oportunidades sem SDR
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-sdr \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 500}'

# 2) processa a fila central (ou aguardar o worker em */1)
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/ghl-api-worker \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"

# 3) roda sync-opp-sdr de novo para aplicar os resultados
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-sdr \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

## Trigger de reprocessamento automático

Quando o `owner_name` de um contato muda (novo webhook chega com SDR diferente), o trigger `trg_reset_sdr_name_on_owner_change` reseta `sdr_name = NULL` em **todas** as oportunidades daquele contato. O cron então as re-enfileira automaticamente para buscar o SDR atualizado via API.

```sql
-- Trigger definido em: 20260327100001_sdr_name_index_and_reprocess_trigger.sql
CREATE TRIGGER trg_reset_sdr_name_on_owner_change
AFTER UPDATE OF owner_name ON contatos
FOR EACH ROW EXECUTE FUNCTION reset_sdr_name_on_owner_change();
```

**Regra:** o trigger usa apenas `UPDATE oportunidades SET sdr_name = NULL` — sem `pg_net`, sem HTTP dentro do trigger. Limpo e seguro.

## Backfill inicial

A migration `20260327100003_backfill_sdr_name_from_owner_name.sql` pre-popula `sdr_name` a partir de `contatos.owner_name` para todas as oportunidades existentes. Isso evita que o cron suba com um flood massivo de requests à API no primeiro run.

O cron progressivamente refina os dados: cada vez que a API retorna um follower, o `sdr_name` é sobrescrito com o valor canônico mais preciso.

## Índice parcial para eficiência

```sql
CREATE INDEX IF NOT EXISTS idx_oportunidades_sdr_name_null
  ON oportunidades (id)
  WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL;
```

Permite que o cron encontre oportunidades pendentes sem escanear a tabela inteira (~4700+ registros).

## Monitoramento

```sql
-- Progresso do backfill
SELECT
  COUNT(*) FILTER (WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL) AS pendentes,
  COUNT(*) FILTER (WHERE sdr_name IS NOT NULL)                                 AS preenchidos,
  COUNT(*)                                                                      AS total
FROM oportunidades;
-- Saúde esperada: pendentes = 0

-- Jobs na fila para este caller
SELECT status, COUNT(*)
FROM ghl_api_jobs
WHERE caller = 'sync-opp-sdr'
GROUP BY status
ORDER BY status;

-- Jobs mortos (investigação)
SELECT id, url, error, attempts, context, created_at
FROM ghl_api_jobs
WHERE status = 'dead'
  AND caller = 'sync-opp-sdr'
ORDER BY created_at DESC
LIMIT 20;

-- Verificar trigger de reprocessamento
-- (teste: mudar owner_name de um contato → esperar sdr_name = NULL nas opps)
SELECT COUNT(*) FROM oportunidades WHERE sdr_name IS NULL AND ghl_opportunity_id IS NOT NULL;
```

## Migrations relacionadas

| Migration | O que faz |
|-----------|-----------|
| `20260327100000_add_sdr_name_to_oportunidades.sql` | Adiciona coluna `sdr_name TEXT` em `oportunidades` |
| `20260327100001_sdr_name_index_and_reprocess_trigger.sql` | Índice parcial + trigger de reset em `contatos.owner_name` |
| `20260327100002_extrair_dados_ghl_enqueue_followers_job.sql` | PASSO 2.6 em `extrair_dados_ghl()` — enfileira job por webhook |
| `20260327100003_backfill_sdr_name_from_owner_name.sql` | Backfill inicial de `sdr_name` via `contatos.owner_name` |
| `20260327100004_cron_sync_opp_sdr.sql` | Cron `sync-opp-sdr-cron` no offset `:06` |

## Relação com `contatos.owner_name`

O campo `contatos.owner_name` **é mantido** — ele serve como:

1. **Fallback** no `sync-opp-sdr`: quando a API GHL retorna `followers: []`, usa `owner_name` do contato
2. **Trigger de reprocessamento**: mudança em `owner_name` → reset das opps → cron re-busca SDR atualizado

`contatos.owner_name` não é mais a fonte primária de exibição do SDR em nenhum componente do dashboard.
