# Sincronização de Comunicações GHL → Supabase

> **Data de criação:** 2026-03-11
> **Edge function:** `supabase/functions/sync-ghl-conversations/`
> **Tabela de destino:** `comunicacoes`
> **Tabela de log:** `ghl_conversations_sync_log`

## Estado validado em produção (2026-03-20 22:20 BRT)

- cron `sync-ghl-conversations-incremental` ativo com schedule real `*/10 * * * *`
- última execução observada no log:
  - `started_at`: `2026-03-20 22:10:01 BRT`
  - `finished_at`: `2026-03-20 22:11:09 BRT`
  - `status`: `success`
  - `messages_upserted`: `3440`
- validação de saúde deve ser feita por `ghl_conversations_sync_log`, não por `comunicacoes.created_at`

---

## O que este sistema faz

Puxa **todas** as comunicações de todos os contatos da GHL para a tabela `comunicacoes` no Supabase:

- **WhatsApp** (inbound e outbound)
- **SMS** (inbound e outbound)
- **Email** (inbound e outbound)
- **Ligações** (inbound e outbound)
- **Facebook, Instagram, Google My Business, Webchat**

O campo `direction` indica quem enviou:
- `inbound` = lead enviou para o SDR
- `outbound` = SDR enviou para o lead

Isso permite reconstruir conversas completas e analisar o comportamento dos SDRs.

---

## Arquitetura

```
GHL API (Conversations)
        │
        ▼
Edge Function: sync-ghl-conversations
  ├── Mode: incremental  ──► busca conversas novas desde último sync
  ├── Mode: backfill_by_contact ──► itera por contato (backfill histórico)
  └── Mode: full_backfill ──► DEPRECADO (paginação GHL é quebrada)
        │
        ▼
Tabela: comunicacoes
  ├── ghl_message_id (UNIQUE — chave de dedup)
  ├── direction: inbound | outbound
  ├── channel: whatsapp | sms | email | call | facebook | instagram | gmb | webchat
  ├── tipo: mensagem | ligacao
  └── campos desnormalizados: contato_nome, sdr_name, etc.
        │
        ▼
Tabela: ghl_conversations_sync_log
  └── log de cada execução (modo, status, contagens, erros)
```

---

## Modos de Operação

### 1. Incremental (automático — pg_cron a cada 10 min + trigger por webhook)

Busca **apenas conversas com novas mensagens** desde o último sync bem-sucedido.
Usa `startAfterDate = último_sync − 1h_buffer` para não perder mensagens atrasadas.

**Dois mecanismos complementares disparam este modo:**

1. **Webhook trigger (tempo real — sync direcionado por contactId):** Cada vez que o GHL envia um webhook de mensagem (`InboundMessage`, `OutboundMessage`, ou qualquer payload com `conversationId`), a edge function `webhook-ghl` dispara o sync imediatamente em **fire & forget**.

   - Se o payload traz `contactId` (caso normal): dispara `{ mode: 'backfill_by_contact', contactId, batch_size: 1 }` — busca **somente aquele contato** na API do GHL, ignorando o resto.
   - Se não tiver `contactId` (edge case raro): cai no `{ mode: 'incremental' }` como fallback.

   Resultado: mensagens aparecem no dashboard em **~5 segundos**, em vez de aguardar o cron.

2. **Cron de 10 minutos (fallback):** Garante que mensagens não cobertas pelo webhook (erros de entrega, fluxos automáticos, etc.) sejam sincronizadas no máximo em 10 minutos.

O `UPSERT ON CONFLICT (ghl_message_id)` garante que syncs simultâneos dos dois mecanismos não geram duplicatas.

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-ghl-conversations" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "incremental"}'
```

**Resposta:**
```json
{
  "success": true,
  "mode": "incremental",
  "conversations_processed": 42,
  "messages_processed": 318,
  "messages_upserted": 87
}
```

### Monitoramento correto

Para validar saúde do sync incremental, use a tabela `ghl_conversations_sync_log`.
**Não use `comunicacoes.created_at` como proxy de "último sync"**: esse campo mostra quando a
linha foi criada no Supabase, não quando ela foi reprocessada por um `UPSERT`.

Consulta recomendada:

```sql
SELECT
  started_at,
  finished_at,
  status,
  mode,
  messages_upserted,
  error_message
FROM ghl_conversations_sync_log
ORDER BY started_at DESC
LIMIT 10;
```

Se houver `status='success'` recente com `messages_upserted > 0`, o sync está operacional mesmo
que os registros mais recentes de `comunicacoes` tenham `created_at` antigo.

Na auditoria de 2026-03-20, este critério mostrou que o cron estava saudável mesmo após uma janela
anterior de instabilidade. O wrapper SQL e o schedule efetivo de produção ficaram alinhados em
`*/10 * * * *`.

**Parâmetro opcional `daysBack`:** no primeiro run (sem histórico de sync), define quantos dias retroativos buscar (padrão: 1 dia).

```bash
-d '{"mode": "incremental", "daysBack": 30}'
```

---

### 2. Backfill por Contato (backfill histórico)

**Este é o modo correto para popular o histórico completo.**

Itera pela tabela `contatos` do Supabase, buscando conversas de cada contato via `contactId` na GHL API. Evita o bug de paginação da API (ver seção de bugs conhecidos).

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-ghl-conversations" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "backfill_by_contact", "offset": 0, "batch_size": 20}'
```

**Parâmetros:**

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `offset` | `0` | Posição inicial na tabela `contatos` (para retomar backfill) |
| `batch_size` | `20` | Quantos contatos processar por chamada |

**Resposta:**
```json
{
  "success": true,
  "mode": "backfill_by_contact",
  "offset": 0,
  "contacts_processed": 20,
  "conversations_processed": 34,
  "messages_processed": 1450,
  "messages_upserted": 1320,
  "total_contacts": 7675,
  "has_more": true,
  "next_offset": 20
}
```

**Script de backfill completo** (`/tmp/backfill_by_contact.sh`):

```bash
#!/bin/bash
SERVICE_KEY="{SERVICE_ROLE_KEY}"
URL="https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-ghl-conversations"
BATCH_SIZE=20
offset=${1:-0}    # argumento opcional: offset de retomada
total_upserted=0

echo "Iniciando backfill offset=$offset | $(date)"

while true; do
  response=$(curl -s -m 180 -X POST "$URL" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"mode\": \"backfill_by_contact\", \"offset\": $offset, \"batch_size\": $BATCH_SIZE}")

  upserted=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('messages_upserted', 0))")
  total_contacts=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('total_contacts', '?'))")
  has_more=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('has_more', False))")
  next_offset=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('next_offset', ''))")

  total_upserted=$((total_upserted + ${upserted:-0}))
  echo "offset=$offset | upserted=$upserted | total=$total_upserted | progresso: $((offset+20))/$total_contacts"

  [ "$has_more" != "True" ] && break
  offset=$next_offset
  sleep 5   # buffer entre batches
done

echo "Concluído! Total upserted: $total_upserted | $(date)"
```

**Para retomar após interrupção:**

```sql
-- Ver último offset processado com sucesso
SELECT page_processed AS last_offset, started_at, messages_upserted
FROM ghl_conversations_sync_log
WHERE mode = 'backfill_by_contact'
ORDER BY started_at DESC LIMIT 10;
```

Então rodar: `./backfill_by_contact.sh {last_offset + batch_size}`

---

### 3. Full Backfill por Página — DEPRECADO ⚠️

> **Não use este modo.** A paginação da GHL API está quebrada: `page=2`, `page=3`, etc. retornam os mesmos resultados de `page=1`. Use `backfill_by_contact` no lugar.

---

## Rate Limits — Protocolo de Proteção

### Limites Reais (medidos via response headers)

```
x-ratelimit-max:                   100  req por janela
x-ratelimit-interval-milliseconds: 10000  (10 segundos)
x-ratelimit-limit-daily:           200000
x-ratelimit-daily-remaining:       varia
x-ratelimit-daily-reset:           ms até reset
```

**Taxa segura:** máx **8 req/s** (80% de 10 req/s para ter margem).

### Estratégia implementada na edge function

Toda chamada à GHL API passa pela função `ghlFetch()` que implementa:

#### 1. Delay base obrigatório
- **130ms** entre requests → 7,7 req/s consistente

#### 2. Delay adaptativo por `x-ratelimit-remaining`
- `remaining >= 20` → delay base normal (130ms)
- `remaining < 20` → pausa extra de 500ms
- `remaining < 5` → pausa até janela renovar (~1s extra)

#### 3. Retry automático no HTTP 429
- Lê o header `Retry-After` (segundos indicados pela GHL)
- Aguarda esse tempo + 500ms de buffer
- Backoff exponencial se `Retry-After` não estiver presente: 1s → 2s → 4s → 8s
- Até **4 tentativas** antes de falhar

```typescript
// Implementação em pseudocódigo
async function ghlFetch(url, label) {
  for attempt in 0..4:
    if remaining < 5:  await delay(resetInMs + 200)
    elif remaining < 20:  await delay(500)
    else:  await delay(130)  // base

    res = await fetch(url)
    update(remaining, resetInMs from headers)

    if res.status == 429:
      wait = retryAfter * 1000 + 500  // ou backoff exponencial
      await delay(wait)
      continue

    return res
}
```

### Consumo estimado por modo

| Operação | Requests por execução | Por dia |
|----------|----------------------|---------|
| Incremental (30 min, ~50 conversas) | ~100–200 req | ~5.000–10.000 |
| Backfill completo (7.675 contatos) | ~23.000 req total | — (operação única) |
| **Limite diário disponível** | — | **200.000** |
| **Uso típico (%)** | — | **< 5%** |

---

## Tabela `comunicacoes` — Colunas Relevantes

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK gerado pelo Supabase |
| `ghl_message_id` | text UNIQUE | ID único da mensagem na GHL (chave de dedup) |
| `ghl_conversation_id` | text | ID da conversa na GHL |
| `contato_id` | uuid NULLABLE | FK → `contatos.id` (null se contato não está no DB) |
| `tipo` | text | `mensagem` \| `ligacao` |
| `channel` | text | `whatsapp` \| `sms` \| `email` \| `call` \| `facebook` \| `instagram` \| `gmb` \| `webchat` |
| `direction` | text | `inbound` (lead→SDR) \| `outbound` (SDR→lead) \| null (histórico) |
| `mensagem_body` | text | Corpo da mensagem |
| `mensagem_subject` | text | Assunto (apenas emails) |
| `data_comunicacao` | timestamptz | Quando foi enviada (ISO 8601 da GHL) |
| `attachments` | jsonb | Lista de URLs de anexos |
| `usuario_ghl_id` | text | ID do usuário GHL que enviou (outbound) |
| `phone_call_from` | text | Número de origem (ligações) |
| `phone_call_to` | text | Número de destino (ligações) |
| `phone_call_duration` | int | Duração em segundos (null se não completou) |
| `phone_call_status` | text | `completed` \| `failed` \| `no-answer` \| `busy` \| `canceled` |
| `contato_nome` | text | Nome do contato (desnormalizado) |
| `contato_email` | text | Email do contato (desnormalizado) |
| `contato_telefone` | text | Telefone do contato (desnormalizado) |
| `sdr_name` | text | Nome do SDR responsável pelo contato (desnormalizado) |
| `created_at` | timestamptz | Quando o registro foi criado no Supabase |

### Campos desnormalizados (para evitar JOINs)

Os campos `contato_nome`, `contato_email`, `contato_telefone` e `sdr_name` são copiados do registro em `contatos` no momento do sync. Isso torna as queries de pré-vendas mais simples:

```sql
-- Sem JOIN: histórico completo de mensagens do lead
SELECT direction, channel, mensagem_body, data_comunicacao
FROM comunicacoes
WHERE contato_nome ILIKE '%João Silva%'
ORDER BY data_comunicacao;
```

---

## Consultas Úteis

### Reconstruir conversa completa de um contato

```sql
-- Por nome do contato
SELECT
  data_comunicacao AT TIME ZONE 'America/Sao_Paulo' AS horario,
  direction,
  channel,
  CASE direction
    WHEN 'inbound'  THEN '← LEAD: '
    WHEN 'outbound' THEN '→ SDR:  '
    ELSE               '? '
  END || COALESCE(mensagem_body, '[ligação ' || phone_call_status || ']') AS mensagem
FROM comunicacoes
WHERE contato_nome ILIKE '%Nome do Lead%'
ORDER BY data_comunicacao;
```

### Volume de mensagens por direção e canal

```sql
SELECT
  direction,
  channel,
  COUNT(*) AS total
FROM comunicacoes
WHERE channel IS NOT NULL
  AND data_comunicacao >= '2026-03-01'
GROUP BY direction, channel
ORDER BY direction, total DESC;
```

### SDR com mais mensagens enviadas

```sql
SELECT
  sdr_name,
  COUNT(*) AS mensagens_enviadas,
  COUNT(DISTINCT ghl_conversation_id) AS conversas
FROM comunicacoes
WHERE direction = 'outbound'
  AND channel IS NOT NULL
  AND sdr_name IS NOT NULL
  AND data_comunicacao >= '2026-03-01'
GROUP BY sdr_name
ORDER BY mensagens_enviadas DESC;
```

### Leads que responderam (inbound) após contato do SDR

```sql
-- Contatos com pelo menos 1 mensagem inbound após outbound
WITH responderam AS (
  SELECT DISTINCT contato_id
  FROM comunicacoes
  WHERE direction = 'inbound'
    AND channel IN ('whatsapp', 'sms')
    AND data_comunicacao >= '2026-03-01'
    AND contato_id IS NOT NULL
)
SELECT COUNT(*) FROM responderam;
```

### Tempo médio de resposta do SDR

```sql
-- Para cada mensagem inbound, encontrar o próximo outbound do mesmo contato
WITH inbound_msgs AS (
  SELECT
    contato_id,
    data_comunicacao AS inbound_at
  FROM comunicacoes
  WHERE direction = 'inbound'
    AND channel = 'whatsapp'
    AND data_comunicacao >= '2026-03-01'
    AND contato_id IS NOT NULL
),
next_outbound AS (
  SELECT
    i.contato_id,
    i.inbound_at,
    MIN(o.data_comunicacao) AS first_reply_at
  FROM inbound_msgs i
  JOIN comunicacoes o ON
    o.contato_id = i.contato_id
    AND o.direction = 'outbound'
    AND o.data_comunicacao > i.inbound_at
  GROUP BY i.contato_id, i.inbound_at
)
SELECT
  AVG(EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60) AS tempo_medio_resposta_min,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (first_reply_at - inbound_at)) / 60
  ) AS mediana_resposta_min
FROM next_outbound;
```

---

## Deduplicação

- O campo `ghl_message_id` tem constraint `UNIQUE` na tabela.
- O upsert usa `ON CONFLICT (ghl_message_id) DO UPDATE`, atualizando campos como `direction`, `status`, `phone_call_status` caso mudem.
- Re-executar qualquer batch é 100% seguro — não cria duplicatas.

---

## Bugs Conhecidos da GHL API

### Bug #1: Paginação page-based não funciona

O parâmetro `page` do endpoint `GET /conversations/search` está quebrado:
páginas 1, 2, 3, etc. retornam **exatamente os mesmos resultados** independente do número.

**Workaround implementado:** O modo `backfill_by_contact` usa o parâmetro `contactId` para buscar conversas de cada contato individualmente, contornando a paginação completamente.

---

## Cron Job (pg_cron)

O incremental roda **a cada 10 minutos** automaticamente via pg_cron (fallback para o webhook trigger):

```sql
-- Ver schedule atual
SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'sync-ghl%';
-- Retorna: sync-ghl-conversations-incremental | */10 * * * *
```

Chamada via `net.http_post` para a edge function com `{"mode":"incremental"}`.

**Consumo estimado:** 144 ciclos/dia × ~160 req/ciclo = ~23k req/dia (11,5% do limite de 200k).

> **Antes era 30 min.** A redução para 10 min foi feita junto com o webhook trigger — o cron é apenas a rede de segurança.

### Escalonamento de offsets (2026-03-20)

O cron `sync-ghl-conversations-incremental` **permanece em `*/10`** (disparo em `:00, :10, :20...`), pois é o mais crítico para a atualidade dos dados. Os outros crons de 10 min foram movidos para offsets diferentes para evitar colisão:

| Cron | Offset | Resultado |
|------|--------|-----------|
| `sync-ghl-conversations-incremental` | `:00` | inalterado |
| `sync-opp-dates` | `:02` | nunca dispara junto com conversations |
| `sync-opp-pipelines-cron` | `:04` | nunca dispara junto com conversations |

Ver detalhes: [`docs/GHL-API-QUEUE.md`](GHL-API-QUEUE.md)

---

## Log de Execuções

Cada execução grava um registro em `ghl_conversations_sync_log`:

```sql
-- Últimas 10 execuções
SELECT
  mode,
  started_at AT TIME ZONE 'America/Sao_Paulo' AS inicio,
  status,
  contacts_processed,
  conversations_processed,
  messages_processed,
  messages_upserted,
  error_message
FROM ghl_conversations_sync_log
ORDER BY started_at DESC
LIMIT 10;
```

---

## Migrations Relacionadas

| Arquivo | O que faz |
|---------|-----------|
| `20260311200000_add_ghl_conversation_columns_to_comunicacoes.sql` | Adiciona `ghl_message_id`, `ghl_conversation_id`, `channel`, `data_comunicacao`, `attachments`, `usuario_ghl_id` |
| `20260311200001_create_ghl_conversations_sync_log.sql` | Cria tabela de log de sync |
| `20260311200002_schedule_ghl_conversations_sync_cron.sql` | Cria cron job inicial (2h) |
| `20260311200003_make_contato_id_nullable_in_comunicacoes.sql` | `contato_id` vira nullable (GHL tem comunicações de contatos que não estão no nosso DB) |
| `20260311200004_fix_ghl_message_id_unique_constraint.sql` | Troca partial index por UNIQUE constraint full (necessário para `ON CONFLICT`) |
| `20260311200005_reload_postgrest_schema_cache.sql` | `NOTIFY pgrst` para recarregar schema cache |
| `20260311200006_ensure_comunicacoes_denormalized_columns.sql` | Garante colunas desnormalizadas: `contato_nome`, `contato_email`, `contato_telefone`, `sdr_name` |
| `20260311220000_update_ghl_sync_cron_to_30min.sql` | Atualiza cron de 2h para 30 minutos |
| `20260313250000_update_ghl_sync_cron_to_10min.sql` | Atualiza cron de 30 min para 10 min (fallback para webhook trigger) |

---

## Status do Backfill (2026-03-11)

Backfill histórico completo em andamento via `backfill_by_contact`:

| Métrica | Valor |
|---------|-------|
| Total de contatos no DB | 7.675 |
| Mensagens inbound (lead → SDR) | 1.318+ |
| Mensagens outbound (SDR → lead) | 6.162+ |
| Total na tabela `comunicacoes` com `channel` | 9.883+ |
| Progresso | ~15% concluído e subindo |

O backfill continua em background e é idempotente — pode ser reiniciado a qualquer momento com o offset correto sem perder ou duplicar dados.
