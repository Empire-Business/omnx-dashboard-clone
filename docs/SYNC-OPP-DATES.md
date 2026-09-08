# sync-opp-dates — Edge Function

Sincroniza `data_lead_recebido` da tabela `oportunidades` via API GHL.

> Documentação completa de sincronização/backfill de oportunidades por contato:
> [`docs/SYNC-CONTACT-OPPORTUNITIES.md`](./SYNC-CONTACT-OPPORTUNITIES.md)

## Por que existe

`data_lead_recebido` foi historicamente extraída do webhook GHL com fallbacks imprecisos
(campos customizados sujeitos a inversão MM/DD + `date_created` do webhook que podia estar errado).
Resultado: centenas de leads com datas em meses errados, invisíveis nos dashboards.

A API REST do GHL retorna `createdAt` da oportunidade — data imutável, confiável e sem
ambiguidade de formato. Esta edge function busca essa data e popula o banco.

## Endpoint

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{ "batch_size": 100 }
```

**Parâmetros:**
- `batch_size` (opcional, default: 100, máximo: 500) — quantas oportunidades processar por chamada

**Resposta:**
```json
{
  "processed_jobs": 100,
  "updated": 98,
  "dead_jobs": 0,
  "not_found": 1,
  "missing_created_at": 1,
  "invalid_context": 0,
  "enqueued": 100,
  "active_duplicates": 0,
  "remaining": 5207,
  "queue_pending": 100,
  "queue_processing": 0
}
```

## API GHL utilizada

```
GET https://services.leadconnectorhq.com/opportunities/{ghl_opportunity_id}
Headers:
  Authorization: Bearer {GHL_API_KEY}
  Version: 2021-04-15

Resposta: { "opportunity": { "createdAt": "2026-03-12T20:40:11.413Z", ... } }
```

- Sem query params obrigatórios
- Rate limit GHL: 100 req/10s
- `createdAt` já é ISO 8601 UTC — sem conversão necessária, salvo direto como TIMESTAMPTZ

## Fluxo atual via fila central

Desde 2026-03-20, esta função não chama a GHL diretamente. Ela opera em três fases:

1. drena jobs `done` / `dead` de `ghl_api_jobs` ainda sem `handled_at`;
2. enfileira novas oportunidades pendentes em `ghl_api_jobs`;
3. drena de novo antes de responder, para capturar jobs que viraram `done` durante a própria execução.

Quem chama a API de fato é o worker central:

- edge function: `ghl-api-worker`
- cron: `ghl-api-worker-cron`
- schedule: `* * * * *`

Isso concentra o rate limit compartilhado do GHL em um único ponto.

**Ajuste operacional em `2026-03-20 23:03 BRT`:** a função ganhou um segundo `drainCompletedJobs()`
no fim da execução. Motivo: existia uma janela curta em que o worker podia concluir o job após o
primeiro drain, deixando `processed_at` preenchido mas `handled_at` ainda nulo até o próximo cron.

## Disparadores

### 1. **Trigger (Imediato)**

Quando uma oportunidade **nova** chega via webhook com:
- `data_lead_recebido = NULL`
- `ghl_opportunity_id = NOT NULL`

Dispara **instantaneamente** a função `sync_opp_dates_job()`.

```sql
-- Trigger na tabela oportunidades
CREATE TRIGGER tr_sync_opp_dates_on_insert
AFTER INSERT ON oportunidades
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_opp_dates();
```

**Vantagem:** Sincroniza dados novos no mesmo segundo que chegam.

### 2. **Cron (Fallback)**

Executa a cada 10 minutos com `batch_size=100` — pega qualquer oportunidade pendente que:
- Chegou enquanto o trigger estava desativado
- Falhou a primeira sincronização
- É retry automático

```sql
SELECT cron.schedule('sync-opp-dates', '2,12,22,32,42,52 * * * *', 'SELECT sync_opp_dates_job()');
```

**Verificar status:**
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname = 'sync-opp-dates';
```

## Backfill Manual Acelerado

Como o fluxo agora é assíncrono, o teste manual correto é:

```bash
# 1) enfileira pendências e aplica jobs já concluídos
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 500}'

# 2) processa a fila central
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/ghl-api-worker" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json"

# 3) chama sync-opp-dates de novo para aplicar os resultados processados
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-opp-dates" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json"
```

Em produção, o cron do worker roda todo minuto, então na prática basta esperar até 60s entre a
primeira e a segunda chamada.

## Monitoramento

```sql
-- Progresso do backfill
SELECT
  COUNT(*) FILTER (WHERE data_lead_recebido IS NOT NULL) AS preenchidos,
  COUNT(*) FILTER (WHERE data_lead_recebido IS NULL)     AS pendentes,
  COUNT(*) AS total
FROM oportunidades;

-- Distribuição por mês (verificar se faz sentido após backfill)
SELECT
  DATE_TRUNC('month', data_lead_recebido AT TIME ZONE 'America/Sao_Paulo') AS mes,
  COUNT(*) AS leads
FROM oportunidades
WHERE data_lead_recebido IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
```

## Política de Falha

Se a API GHL:
- retornar `404`,
- responder sem `createdAt`,
- ou falhar por rate limit/rede,

a função **não grava data fake** em `data_lead_recebido`.

O registro permanece com `data_lead_recebido = NULL` para:
- ficar visível no backlog real,
- permitir retry automático pelo cron,
- permitir investigação manual sem contaminar o cohort com data inventada.

As contagens `not_found`, `missing_created_at`, `dead_jobs` e `invalid_context` aparecem na resposta da função
para facilitar o diagnóstico operacional.

**Regra crítica:** `data_lead_recebido` só pode refletir `opportunity.createdAt` da API GHL.
Qualquer fallback para "agora", `created_at` do Supabase ou `date_created` do contato quebra o cohort.

## Validação em produção

Auditoria concluída em `2026-03-20 23:07 BRT`:

- jobs reais de `sync-opp-dates` foram enfileirados em `ghl_api_jobs`
- `ghl-api-worker` processou os jobs com sucesso
- a própria `sync-opp-dates` aplicou os resultados e marcou `handled_at`
- a pendência residual observada durante a auditoria anterior foi eliminada com o segundo drain no
  fim da request
- backlog final: `data_lead_recebido IS NULL = 0`

## Backlog Persistente

Se uma oportunidade continuar pendente após múltiplas execuções, investigar com:

```sql
SELECT
  id,
  ghl_opportunity_id,
  nome_contato,
  email_contato,
  pipeline_name,
  updated_at
FROM oportunidades
WHERE data_lead_recebido IS NULL
ORDER BY updated_at DESC;
```

## Relacionamento com extrair_dados_ghl()

A função `extrair_dados_ghl()` (webhook) foi modificada:
- **INSERT:** `data_lead_recebido = NULL` (deixa para sync-opp-dates preencher)
- **UPDATE:** não toca em `data_lead_recebido` (não sobrescreve o que a API já populou)

---

# sync-contact-opportunities — Resumo

> A documentação operacional completa desta rotina e da nova reconciliação noturna foi movida para
> [`docs/SYNC-CONTACT-OPPORTUNITIES.md`](./SYNC-CONTACT-OPPORTUNITIES.md).

Sincroniza **TODAS as oportunidades** de um contato quando um `ContactCreate` webhook chega.

## Por que existe

O webhook GHL envia apenas **1 oportunidade por evento** `ContactCreate`. Se um contato já existe no GHL
com múltiplas oportunidades (ex: importado em massa, lead antigo reativado, re-contato), as outras
opps ficavam **invisíveis no banco** — apenas a primeira chegava via webhook.

**Exemplo:** Contato importado com 5 oportunidades em estágios diferentes. Webhook traz apenas 1.
As outras 4 desaparecem do dashboard até que um webhook delas chegar naturalmente (se chegar).

Esta edge function resolve isso sincronizando **todas** as opps via API GHL.

## Endpoint

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-opportunities
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json

{ "batch_size": 50, "max_batches": 2 }
```

**Parâmetros:**
- `batch_size` (opcional, default efetivo: 50, máximo: 50) — tamanho de cada lote interno
- `max_batches` (opcional, default: 2, máximo: 3) — quantos lotes internos a função processa por execução
- `exact_batch_size` (opcional, default: `false`) — respeita lotes pequenos só para teste manual

**Resposta:**
```json
{
  "processed": 100,
  "batches_run": 2,
  "batch_size": 50,
  "done": 100,
  "errored": 0,
  "remaining": 6985
}
```

## Fluxo Completo

```
ContactCreate webhook → webhooks_ghl INSERT
          ↓
     trigger enqueue_contact_opp_sync()
          ↓
contact_opp_sync_queue.status='pending' (deduplicado)
          ↓ (cron a cada 5 min, até 100 contatos por execução efetiva)
sync-contact-opportunities (edge function)
          ↓
GET /opportunities?contact_id=X (API GHL, paginado até 100/página)
          ↓
UPSERT cada opp em oportunidades (ON CONFLICT ghl_opportunity_id DO UPDATE)
          ↓
queue.status → 'done' ou 'error'
```

## Tabela de Fila: `contact_opp_sync_queue`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `ghl_contact_id` | TEXT | ID do contato no GHL |
| `status` | TEXT | `pending` \| `processing` \| `done` \| `error` |
| `attempts` | INT | Número de tentativas (máx 3) |
| `last_error` | TEXT | Mensagem de erro se status=`error` |
| `created_at` | TIMESTAMPTZ | Quando foi enfileirado |
| `processed_at` | TIMESTAMPTZ | Quando foi finalizado |

**Deduplicação:** Índice único `(ghl_contact_id) WHERE status='pending'` — mesmo contato não entra
2x na fila durante importação em massa. Contatos com `status='done'` ou `status='error'` podem ser
re-enfileirados se um novo webhook chegar.

## Trigger: `tr_enqueue_contact_opp_sync`

```sql
CREATE TRIGGER tr_enqueue_contact_opp_sync
AFTER INSERT ON webhooks_ghl
FOR EACH ROW
EXECUTE FUNCTION enqueue_contact_opp_sync();
```

Quando um webhook de `type='ContactCreate'` é inserido, a função `enqueue_contact_opp_sync()`
extrai `contact_id` e insere em `contact_opp_sync_queue` com `ON CONFLICT DO NOTHING`.

## Cron Schedule

```
*/5 * * * *  →  Executa a cada 5 minutos
batch_size efetivo=50  →  cada lote interno usa 50 contatos
max_batches=2  →  até 100 contatos por execução do cron
```

Capacidade efetiva padrão: 100 contatos/exec × 12 exec/h = ~1200 contatos/h.

## API GHL Utilizada

```
GET https://services.leadconnectorhq.com/opportunities/search?contact_id={id}&limit=100
    &pageUrl={next}  (para paginação)

Headers:
  Authorization: Bearer {GHL_API_KEY}
  Version: 2021-04-15
```

Resposta: `{ "opportunities": [...], "pageInfo": { "nextPageUrl": "..." } }`

## Rate Limiting

Idêntico ao `sync-opp-dates`:

| Situação | Delay |
|----------|-------|
| Normal | 130ms entre requests (~7.7 req/s) |
| `x-ratelimit-remaining < 20` | 500ms |
| `x-ratelimit-remaining < 5` | ~1s |
| HTTP 429 | Backoff: 1s, 2s, 4s, 8s (máx 4 tentativas) |

## Proteções contra Importação em Massa

1. **Deduplicação SQL:** `UNIQUE INDEX WHERE status='pending'` — contato entra na fila apenas 1x
2. **Batch controlado:** 20 contatos/exec (máximo 50)
3. **Retry automático:** até 3 tentativas, depois `status='error'` (não trava a fila)
4. **Rate limit adaptativo:** respeita header `x-ratelimit-remaining` da API GHL

## Monitoramento

```sql
-- Status atual da fila
SELECT
  status,
  COUNT(*) AS count
FROM contact_opp_sync_queue
GROUP BY status
ORDER BY status;

-- Contatos com erro (para troubleshooting)
SELECT
  ghl_contact_id,
  last_error,
  attempts,
  processed_at
FROM contact_opp_sync_queue
WHERE status = 'error'
ORDER BY processed_at DESC
LIMIT 10;

-- Histórico de processamento
SELECT
  DATE_TRUNC('hour', processed_at) AS hora,
  COUNT(*) FILTER (WHERE status = 'done') AS sucesso,
  COUNT(*) FILTER (WHERE status = 'error') AS erros
FROM contact_opp_sync_queue
WHERE processed_at IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
```

## Campos Populados do GHL

Para cada oportunidade retornada pela API, a função popula:

- `ghl_opportunity_id` = `id`
- `nome_contato` = `contact.name`
- `email_contato` = `contact.email`
- `titulo` = `name`
- `valor` = `value`
- `status` = `status`
- `pipeline_id` = `pipeline.id`
- `pipeline_stage_id` = `stage.id`
- `pipeline_name` = `pipeline.name`
- `vendedor_closer` = `customData.{{opportunity.assignedToUsersName}}`
- `opportunity_source`, `lost_reason`, `resumo_ia`, `percepcao_closer` = customData parsing

**Importante:** `data_lead_recebido` é deixado **NULL** — preenchido **exclusivamente** por
`sync-opp-dates` via chamada individual `GET /opportunities/{id}` que retorna `createdAt` confiável.
