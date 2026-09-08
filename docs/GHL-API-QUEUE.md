# Fila Centralizada de API GHL (`ghl_api_jobs`)

> **Criado em:** 2026-03-20
> **Migrations principais:** `20260320100002_create_ghl_api_queue.sql`, `20260324000000_harden_ghl_api_queue_and_fix_conversations_cron.sql`
> **Edge function:** `supabase/functions/ghl-api-worker/index.ts`
> **Cron:** `ghl-api-worker-cron` — todo minuto (`* * * * *`)

---

## Por que existe essa fila?

O sistema tem **6+ edge functions** que chamam a GHL API de forma independente:

- `sync-ghl-conversations` — mensagens e ligações
- `sync-opp-dates` — data_lead_recebido via API
- `sync-opp-pipelines` — pipeline_id/name NULL
- `sync-opp-sdr` — sdr_name via followers da oportunidade
- `sync-contact-tags` — sincroniza tags dos contatos
- `sync-contact-opportunities` — oportunidades por contato

**Problema:** O limite da GHL é **100 req/10 segundos, compartilhado** entre todas as chamadas. Cada função mantinha seu próprio estado de rate limit local — quando disparavam ao mesmo tempo (thundering herd), nenhuma sabia que as outras já tinham consumido boa parte do limite.

**Duas correções implementadas:**

### 1. Escalonamento de crons (imediato, migration `20260320100001`)

Antes: todas as funções de 10 min disparavam em `:00, :10, :20...` ao mesmo tempo.

Depois (horários dentro de cada ciclo de 10 min):
| Cron | Offset | Exemplo |
|------|--------|---------|
| `sync-ghl-conversations-incremental` | `:00` (inalterado) | 14:00, 14:10... |
| `sync-opp-dates` | `:02` (+2 min) | 14:02, 14:12... |
| `sync-opp-pipelines-cron` | `:04` (+4 min) | 14:04, 14:14... |
| `sync-opp-sdr-cron` | `:06` (+6 min) | 14:06, 14:16... |
| `sync-contact-tags` | `*/15` (inalterado) | offset natural |

### 2. Fila centralizada (robusto, migration `20260320100002`)

Um único worker (`ghl-api-worker`) processa todas as chamadas GHL em ordem, com rate limit centralizado. Jobs nunca se perdem.

---

## Arquitetura

```
Edge functions (callers)
  │
  ▼
Tabela: ghl_api_jobs
  ├── priority 1  → urgente (webhook tempo real)
  ├── priority 5  → normal (cron)
  └── priority 10 → backfill lento
  │
  ▼
Edge function: ghl-api-worker  (cron: */1 * * * *)
  ├── claim_ghl_api_jobs() — SKIP LOCKED (atômico, sem race condition)
  ├── executa HTTP → GHL API  (com rate limit local)
  ├── 429  → retry agendado (next_retry_at = agora + Retry-After)
  ├── done → salva result
  └── dead → status='dead' (auditável, não deletado)
```

---

## Tabela `ghl_api_jobs`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGSERIAL | PK autoincrement |
| `url` | TEXT | URL completa da API GHL |
| `method` | TEXT | `GET` (padrão) ou `POST` / `PUT` |
| `body` | JSONB | Body da requisição (apenas para POST/PUT) |
| `priority` | INT | `1`=urgente / `5`=normal / `10`=backfill |
| `status` | TEXT | `pending` / `processing` / `done` / `dead` |
| `attempts` | INT | Tentativas já realizadas |
| `max_attempts` | INT | Máximo antes de marcar como `dead` (padrão: 4) |
| `result` | JSONB | Resposta da API quando status=`done` |
| `error` | TEXT | Último erro (útil para debug) |
| `caller` | TEXT | Qual função enfileirou (ex: `sync-opp-dates`) |
| `idempotency_key` | TEXT | Evita duplicatas ativas (índice parcial, não conflita com histórico já tratado) |
| `context` | JSONB | Metadados do caller para aplicar o resultado depois (`opportunity_id`, `contato_id`, etc.) |
| `created_at` | TIMESTAMPTZ | Quando o job foi criado |
| `claimed_at` | TIMESTAMPTZ | Quando o worker pegou o job para processar |
| `processed_at` | TIMESTAMPTZ | Quando terminou (done ou dead) |
| `handled_at` | TIMESTAMPTZ | Quando o caller já aplicou o resultado no banco local |
| `next_retry_at` | TIMESTAMPTZ | Quando pode ser reprocessado (para retries) |

---

## Fluxo de vida de um job

```
[INSERT] status='pending', attempts=0, next_retry_at=NOW()
         ↓
[claim_ghl_api_jobs()] status='processing', attempts=1
         ↓
  [Chamada GHL API]
         ↓
   ┌─────────────────────────────────────────────────────────┐
   │ Sucesso (2xx)  → status='done', result=JSON             │
   │ 429            → status='pending', next_retry_at=+Retry │
   │ Outro erro     → status='pending', next_retry_at=+backoff│
   │ attempts>=max  → status='dead'                          │
   └─────────────────────────────────────────────────────────┘
```

**Jobs mortos (`dead`):** ficam na tabela para auditoria. Nunca são deletados automaticamente. Investigar com:
```sql
SELECT id, url, error, attempts, caller, created_at
FROM ghl_api_jobs
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Callers já migrados para a fila

Em produção, estes fluxos já usam `ghl_api_jobs` no caminho real:

| Caller | O que enfileira | Quem aplica o resultado |
|--------|------------------|-------------------------|
| `sync-opp-dates` | `GET /opportunities/{id}` | a própria `sync-opp-dates` grava `data_lead_recebido` |
| `sync-opp-pipelines` | `GET /opportunities/{id}` | a própria `sync-opp-pipelines` grava `pipeline_id` / `pipeline_name` |
| `sync-opp-sdr` | `GET /opportunities/{id}/followers` | a própria `sync-opp-sdr` grava `oportunidades.sdr_name` |
| `sync-contact-tags` | `GET /contacts/{id}` | a própria `sync-contact-tags` grava `contatos.tags` |

Fluxo operacional:

1. a edge function busca registros pendentes no banco local;
2. ela enfileira jobs em `ghl_api_jobs` com `idempotency_key` + `context`;
3. o cron `ghl-api-worker-cron` consome a fila com rate limit centralizado;
4. a edge function drena jobs `done` / `dead` ainda sem `handled_at`;
5. depois de enfileirar novas pendências, ela drena de novo antes de responder para capturar jobs
   que terminaram durante a própria execução;
6. depois de aplicar o resultado, marca `handled_at`.

`sync-ghl-conversations` continua fora desta fila por enquanto. Ele foi estabilizado no cron/log, mas ainda usa o fluxo próprio da Conversations API.

---

## Como enfileirar um job

Qualquer edge function pode inserir na fila:

```typescript
// Exemplo: enfileirar busca de oportunidade com idempotência
await supabase.from('ghl_api_jobs').insert({
  url:             `https://services.leadconnectorhq.com/opportunities/${oppId}`,
  method:          'GET',
  priority:        5,           // normal (cron)
  caller:          'sync-opp-dates',
  idempotency_key: `sync-opp-dates:${oppId}`,  // evita duplicata
});

// Job urgente (webhook trigger) — processado em até 60s
await supabase.from('ghl_api_jobs').insert({
  url:      `https://services.leadconnectorhq.com/conversations/search?contactId=${contactId}`,
  priority: 1,                  // urgente
  caller:   'webhook-trigger',
});
```

**ON CONFLICT:** se o `idempotency_key` já existe, o INSERT falha silenciosamente — use `onConflict: 'idempotency_key', ignoreDuplicates: true` para ser idempotente.

---

## Worker: `ghl-api-worker`

### Funcionamento

1. Recebe POST com `{ max_jobs?: number }` (padrão: 50)
2. Chama `claim_ghl_api_jobs(max_jobs)` — atômico via `FOR UPDATE SKIP LOCKED`
3. Para cada job: executa HTTP com rate limiting local
4. Atualiza status na tabela
5. Retorna `{ processed, succeeded, retried, dead }`

### Rate limit no worker

O worker é o **único ponto de saída** para a GHL API neste modelo, então o estado local é suficiente:
- `remaining >= 20` → delay base de 130ms
- `remaining < 20` → pausa 500ms
- `remaining < 5` → pausa até janela renovar (~1s)
- `429` → aguarda Retry-After + 500ms buffer

### Teste manual

```bash
# Verificar fila atual
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/ghl-api-worker \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"max_jobs": 5}'

# Inserir job de teste
# (via SQL no Supabase dashboard ou psql)
INSERT INTO ghl_api_jobs (url, caller, priority)
VALUES (
  'https://services.leadconnectorhq.com/locations/{LOCATION_ID}',
  'teste-manual',
  1
);
```

---

## Estado atual (2026-03-20 23:07 BRT)

A fila deixou de ser “infra opcional” e passou a carregar tráfego real em produção.

Validação manual feita em produção:

- `sync-opp-dates` enfileirou e aplicou jobs reais; backlog final de `data_lead_recebido = NULL` ficou em `0`
- `sync-opp-pipelines` enfileirou e aplicou jobs reais; backlog final de `pipeline_id = NULL` ficou em `0`
- `sync-contact-tags` enfileirou e aplicou jobs reais; backlog final de `contatos.tags IS NULL` ficou em `0`
- `ghl-api-worker` processou lotes reais retornando `{"processed":4,"succeeded":4,"retried":0,"dead":0,"stale_requeued":0}`
- `requeue_stale_ghl_api_jobs()` foi validada em produção com job sintético preso em `processing`
- `sync-opp-pipelines` e `sync-opp-dates` ganharam segundo drain no fim da request para eliminar o
  gap entre `processed_at` e `handled_at`

Snapshot final da auditoria:

```json
{
  "oppDateNull": 0,
  "pipelineIdNull": 0,
  "pipelineNameNull": 0,
  "tagsNull": 0,
  "queuePending": 0,
  "queueProcessing": 0,
  "terminalUnhandled": 1
}
```

O único registro em `terminal_unhandled` observado na auditoria final de `23:07 BRT` é um job
sintético antigo de `test-stale`, não tráfego real de produção. Dois registros `dead` continuam na
tabela apenas como histórico de auditoria e já estão com `handled_at` preenchido.

### Hardening aplicado no worker

- reclaim de jobs presos em `processing` via `requeue_stale_ghl_api_jobs()`
- `claimed_at` limpo corretamente ao sair de `processing`
- `handled_at` separado de `processed_at`
- `401/403` vão para `dead`
- `404` e `400` com mensagem de “not found” viram `done` com `_meta.not_found`
- retries e contadores `retried` / `dead` coerentes com `max_attempts`

---

## Monitoramento

```sql
-- Situação atual da fila
SELECT
  status,
  COUNT(*)           AS jobs,
  MIN(created_at)    AS mais_antigo,
  MAX(created_at)    AS mais_recente
FROM ghl_api_jobs
GROUP BY status
ORDER BY status;

-- Jobs concluídos mas ainda não aplicados pelo caller
SELECT id, caller, status, handled_at, processed_at, context
FROM ghl_api_jobs
WHERE status IN ('done', 'dead')
  AND handled_at IS NULL
ORDER BY processed_at DESC;

-- Jobs mortos (investigação)
SELECT id, url, error, attempts, caller, created_at
FROM ghl_api_jobs
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;

-- Jobs presos em 'processing' por mais de 5 min (worker falhou no meio)
SELECT id, url, caller, attempts, created_at
FROM ghl_api_jobs
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '5 minutes';

-- Limpar jobs processados com mais de 7 dias (manutenção)
DELETE FROM ghl_api_jobs
WHERE status IN ('done', 'dead')
  AND processed_at < NOW() - INTERVAL '7 days';
```

---

## Migrations Relacionadas

| Migration | O que faz |
|-----------|-----------|
| `20260320100001_stagger_ghl_cron_schedules.sql` | Escalona offsets dos crons (thundering herd fix) |
| `20260320100002_create_ghl_api_queue.sql` | Cria tabela `ghl_api_jobs` + função `claim_ghl_api_jobs()` |
| `20260320100003_schedule_ghl_api_worker_cron.sql` | Cria cron `ghl-api-worker-cron` (todo minuto) |
| `20260324000000_harden_ghl_api_queue_and_fix_conversations_cron.sql` | Adiciona `context`, `claimed_at`, `handled_at`, reclaim de stale e alinha cron de conversas |
