# sync-ghl-conversations — Edge Function

Sincroniza **todas** as mensagens (inbound do lead + outbound do SDR) da API GHL para a tabela `comunicacoes`.
Captura: WhatsApp, SMS, Email, Ligações — em ambas as direções — permitindo reconstrução completa de conversas.

## Modos

### Incremental (pg_cron a cada 30 minutos)

Busca apenas conversas com novas mensagens desde o último sync bem-sucedido (com buffer de 1h para recuperar mensagens atrasadas).

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-ghl-conversations" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "incremental"}'
```

### Backfill por Contato (modo correto para backfill histórico)

Itera pela tabela `contatos` usando `contactId` por contato. Evita o bug de paginação da GHL API
onde `page=N` sempre retorna as mesmas conversas independente do N.

```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-ghl-conversations" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "backfill_by_contact", "offset": 0, "batch_size": 20}'
```

**Script de backfill completo** (salvo em `/tmp/backfill_by_contact.sh`):

```bash
#!/bin/bash
SERVICE_KEY="{SERVICE_ROLE_KEY}"
URL="{SUPABASE_URL}/functions/v1/sync-ghl-conversations"
BATCH_SIZE=20
offset=${1:-0}  # aceita offset inicial como argumento

while true; do
  response=$(curl -s -m 180 -X POST "$URL" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"mode\": \"backfill_by_contact\", \"offset\": $offset, \"batch_size\": $BATCH_SIZE}")

  echo "$response" | python3 -m json.tool

  has_more=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('has_more', False))")
  next_offset=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('next_offset', ''))")

  [ "$has_more" != "True" ] && break
  offset=$next_offset
  sleep 5
done
```

Para retomar após interrupção, consulte o último offset nos logs:
```sql
SELECT page_processed AS last_offset, started_at
FROM ghl_conversations_sync_log
WHERE mode = 'backfill_by_contact'
ORDER BY started_at DESC LIMIT 5;
```

### Por contato específico (debug)
```bash
curl -X POST "{SUPABASE_URL}/functions/v1/sync-ghl-conversations" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"mode": "backfill_by_contact", "offset": 0, "batch_size": 1}'
```

## Rate Limit — Protocolo de proteção

GHL API tem dois limites (medidos via response headers):

| Header | Valor | Significado |
|--------|-------|-------------|
| `x-ratelimit-max` | 100 | Requests por janela |
| `x-ratelimit-interval-milliseconds` | 10.000 | Janela de 10 segundos |
| `x-ratelimit-limit-daily` | 200.000 | Limite diário |

**Taxa segura de uso:** máx 8 req/s (80% do teto de 10 req/s)

### Estratégia implementada na edge function

1. **Delay base de 130ms** entre requests → ~7,7 req/s (abaixo do limite)
2. **Leitura dinâmica de `x-ratelimit-remaining`** a cada resposta:
   - `remaining < 20` → pausa extra de 500ms
   - `remaining < 5`  → pausa até janela renovar (~1s)
3. **Retry automático no 429** com backoff exponencial:
   - Lê header `Retry-After` e aguarda o tempo indicado + 500ms de buffer
   - Até 4 tentativas: 1s → 2s → 4s → 8s
4. **Sem loop de polling**: erros 4xx sem retry infinito

### Consumo estimado

| Operação | Requests estimados |
|----------|--------------------|
| Incremental (30 min, ~50 conversas ativas) | ~100 req/ciclo |
| 48 ciclos/dia | ~4.800 req/dia (2,4% do limite diário) |
| Backfill completo (7.675 contatos) | ~23.000 req total |

## Direção das mensagens

O campo `direction` em `comunicacoes` indica quem enviou:

| `direction` | Quem enviou |
|-------------|-------------|
| `inbound`   | Lead → SDR (mensagem recebida) |
| `outbound`  | SDR → Lead (mensagem enviada pelo time) |
| `NULL`      | Histórico anterior (antes da migração) |

## Canais capturados

| Canal | `channel` em `comunicacoes` | `tipo` |
|-------|---------------------------|--------|
| WhatsApp | `whatsapp` | `mensagem` |
| SMS | `sms` | `mensagem` |
| Email | `email` | `mensagem` |
| Ligação / Voicemail | `call` | `ligacao` |
| Facebook | `facebook` | `mensagem` |
| Instagram | `instagram` | `mensagem` |
| Google My Business | `gmb` | `mensagem` |
| Webchat / Typebot | `webchat` | `mensagem` |

## Deduplicação

Upsert usa `ghl_message_id` como UNIQUE constraint.
Qualquer batch pode ser re-executado sem criar duplicatas.

## Secrets necessários

```bash
supabase secrets set GHL_API_KEY=<SUA_GHL_API_KEY_AQUI>
supabase secrets set GHL_LOCATION_ID=U8FTcw90CB5QELUnbGUu
# SB_URL e SB_SERVICE_ROLE_KEY já devem estar configurados
```

> ⚠️ Nunca commite a chave real. Configure via `supabase secrets set` ou variável de ambiente.
