# GHL Conversations API — Documentação

> **Versão:** 2.0 (atualizada 2026-03-11)
> **Base URL:** `https://services.leadconnectorhq.com`
> **Auth Header:** `Authorization: Bearer {api_key}`
> **Version Header:** `Version: 2021-04-15`

---

## Credenciais do Projeto

| Campo | Valor |
|-------|-------|
| `locationId` | `U8FTcw90CB5QELUnbGUu` |
| `apiKey` | `<SUA_GHL_API_KEY_AQUI>` (configure em variável de ambiente `GHL_API_KEY`) |

---

## Rate Limits (medidos via headers reais)

> Medição realizada com `curl -si` inspecionando headers de resposta.

| Header | Valor | Significado |
|--------|-------|-------------|
| `x-ratelimit-max` | `100` | Máximo de requests por janela |
| `x-ratelimit-interval-milliseconds` | `10000` | Janela de 10 segundos |
| `x-ratelimit-remaining` | variável | Requests restantes na janela atual |
| `x-ratelimit-limit-daily` | `200000` | Limite de requests por dia |
| `x-ratelimit-daily-remaining` | variável | Requests restantes hoje |
| `x-ratelimit-daily-reset` | variável (ms) | Tempo até reset do contador diário |

**Taxa máxima segura:** 8 req/s (80% de 10 req/s)

**HTTP 429 Too Many Requests:**
- Retornado quando a janela de 10s se esgota
- Header `Retry-After` indica segundos para aguardar
- A edge function implementa retry automático com backoff exponencial

---

## Endpoints Utilizados

### 1. `GET /conversations/search` — Listar Conversas

Retorna conversas de um location, com suporte a filtros.

**Query Parameters:**

| Param | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `locationId` | string | ✅ | ID do location |
| `limit` | number | — | Itens por página (max: 100) |
| `page` | number | — | Página 1-based (**ver bug abaixo**) |
| `sortBy` | string | — | `last_message_date` |
| `sort` | string | — | `asc` \| `desc` |
| `startAfterDate` | number | — | Unix ms — filtra `lastMessageDate > valor` |
| `contactId` | string | — | Filtrar por contato específico (funciona corretamente) |

**Resposta:**

```json
{
  "conversations": [
    {
      "id": "r970mZyhmroZpFJ6iytt",
      "contactId": "hCAhUwthCl8JUv9snG1S",
      "locationId": "U8FTcw90CB5QELUnbGUu",
      "type": "TYPE_PHONE",
      "fullName": "Guilherme Morais",
      "email": "guilherme@email.com",
      "phone": "+5531994979000",
      "assignedTo": "jchGm76ArLYrmtYcYE8v",
      "lastMessageDate": 1773272571481,
      "lastMessageType": "TYPE_WHATSAPP",
      "lastMessageBody": "Oi, Guilherme...",
      "lastMessageDirection": "outbound",
      "unreadCount": 0,
      "dateAdded": 1772568996935,
      "dateUpdated": 1773272571485
    }
  ],
  "total": 5973,
  "traceId": "..."
}
```

**Notas:**
- `total` = total de conversas no location (ou filtradas)
- `lastMessageDate` / `dateAdded` são Unix timestamps em **milissegundos**
- Paginação: `page * limit < total && conversations.length === limit` → há mais páginas

#### ⚠️ BUG CONFIRMADO: Parâmetro `page` não funciona

Testado em 2026-03-11 com `sort=asc` e `sort=desc`: páginas 1, 2 e 3 retornam **exatamente os mesmos IDs de conversas**. O parâmetro `page` é ignorado pela API.

**Workaround:** Usar `contactId` para buscar conversas por contato individualmente (ver estratégia `backfill_by_contact` na edge function). Funciona corretamente.

---

### 2. `GET /conversations/{id}/messages` — Mensagens de uma Conversa

Retorna mensagens de uma conversa, do mais **recente** para o mais **antigo** (cursor-based).

**Query Parameters:**

| Param | Tipo | Descrição |
|-------|------|-----------|
| `limit` | number | Mensagens por página (max: 100) |
| `lastMessageId` | string | Cursor: buscar mensagens mais antigas que este ID |

**Resposta:**

```json
{
  "messages": {
    "messages": [
      {
        "id": "fDKGdWqxB1NFexbzWYXH",
        "conversationId": "r970mZyhmroZpFJ6iytt",
        "contactId": "hCAhUwthCl8JUv9snG1S",
        "locationId": "U8FTcw90CB5QELUnbGUu",
        "type": 19,
        "messageType": "TYPE_WHATSAPP",
        "direction": "outbound",
        "status": "delivered",
        "body": "Oi, Guilherme. Conseguiu concluir?",
        "dateAdded": "2026-03-11T23:42:51.065Z",
        "dateUpdated": "2026-03-11T23:42:54.720Z",
        "attachments": [],
        "userId": "QSj8OZzn4AhSk3DZmrW3",
        "source": "app",
        "from": "+55 11 5195-1497",
        "to": "+5531994979000",
        "altId": "wamid.HBgMNTUzMTk0...",
        "error": null
      }
    ],
    "lastMessageId": "xw95QZTcIWS6TfTYZZ3K",
    "nextPage": true
  },
  "traceId": "..."
}
```

**Mapeamento completo de campos → `comunicacoes`:**

| Campo GHL | Coluna `comunicacoes` | Notas |
|-----------|----------------------|-------|
| `id` | `ghl_message_id` | Chave de deduplicação (UNIQUE) |
| `conversationId` | `ghl_conversation_id` | Grupo de mensagens com o contato |
| `messageType` | `channel` (mapeado) | `TYPE_WHATSAPP` → `whatsapp`, etc. |
| `direction` | `direction` | `inbound` / `outbound` |
| `status` | `msg_status` | `sent`, `delivered`, `read`, `failed`, `pending` |
| `body` | `mensagem_body` | Texto da mensagem |
| `dateAdded` | `data_comunicacao` | Timestamp real da mensagem |
| `dateUpdated` | `ghl_date_updated` | Quando o status foi atualizado |
| `attachments` | `attachments` | Array de URLs (JSONB) |
| `userId` | `usuario_ghl_id` | Quem enviou (null = IA/automação) |
| `source` | `ghl_source` | `app` / `api` / `workflow` — **detecção de IA** |
| `from` | `msg_from` + `phone_call_from` | Remetente (todos os canais) |
| `to` | `msg_to` + `phone_call_to` | Destinatário (todos os canais) |
| `altId` | `alt_id` | ID externo (wamid WhatsApp, etc.) |
| `error` | `error_msg` | Descrição do erro quando failed |
| `meta.email.subject` | `mensagem_subject` | Assunto de email |
| `meta.call.duration` | `phone_call_duration` | Duração em segundos |
| `meta.call.status` | `phone_call_status` | Status da ligação |
| `conv.assignedTo` | `ghl_assigned_to` | Responsável pela conversa |

**Paginação de Mensagens (funciona corretamente):**
1. Primeira chamada: sem `lastMessageId` → retorna mensagens mais recentes
2. `nextPage: true` + `lastMessageId` preenchido → há mensagens mais antigas
3. Passar `lastMessageId` para obter o próximo lote (mais antigo)
4. `nextPage: false` ou `lastMessageId: null` → chegou ao início da conversa

---

## Tipos de Mensagem

### Mensagens salvas em `comunicacoes`

| `messageType` | `channel` | `tipo` | Notas |
|---------------|-----------|--------|-------|
| `TYPE_WHATSAPP` | `whatsapp` | `mensagem` | Mais comum. `type=19` |
| `TYPE_SMS` | `sms` | `mensagem` | |
| `TYPE_CUSTOM_SMS` | `sms` | `mensagem` | SMS via provedor customizado |
| `TYPE_EMAIL` | `email` | `mensagem` | |
| `TYPE_CUSTOM_EMAIL` | `email` | `mensagem` | |
| `TYPE_CALL` | `call` | `ligacao` | Ver campos de call abaixo |
| `TYPE_VOICEMAIL` | `call` | `ligacao` | Caixa postal |
| `TYPE_FACEBOOK` | `facebook` | `mensagem` | |
| `TYPE_FACEBOOK_COMMENT` | `facebook` | `mensagem` | |
| `TYPE_INSTAGRAM` | `instagram` | `mensagem` | |
| `TYPE_INSTAGRAM_STORY_MENTION` | `instagram` | `mensagem` | |
| `TYPE_GMB` | `gmb` | `mensagem` | Google My Business |
| `TYPE_LIVE_CHAT` | `webchat` | `mensagem` | |
| `TYPE_TYPEBOT` | `webchat` | `mensagem` | |

### Mensagens ignoradas (sistema/atividade)

| `messageType` | Motivo |
|---------------|--------|
| `TYPE_ACTIVITY_OPPORTUNITY` | Atualização de oportunidade (sistema) |
| `TYPE_ACTIVITY_CONTACT` | Atualização de contato (sistema) |
| `TYPE_NOTE` | Nota interna |
| `TYPE_INTERNAL_NOTE` | Nota interna |
| `TYPE_LIVE_CHAT_INFO_MESSAGES` | Mensagem informativa do chat |
| `TYPE_CUSTOM_PROVIDER_SMS` | Mensagem de roteamento de sistema |
| `TYPE_CUSTOM_PROVIDER_EMAIL` | Mensagem de roteamento de sistema |
| `TYPE_ACTIVITY_*` (qualquer) | Qualquer evento de sistema |

---

## Estrutura de Ligação (`TYPE_CALL`)

```json
{
  "messageType": "TYPE_CALL",
  "direction": "outbound",
  "status": "failed",
  "from": "+551150283379",
  "to": "+5531993881550",
  "error": "Invalid destination number or unreachable",
  "meta": {
    "call": {
      "duration": null,
      "status": "failed"
    }
  }
}
```

**Status possíveis:** `completed` | `failed` | `no-answer` | `busy` | `canceled`

**Mapeamento para `comunicacoes`:**

| Campo GHL | Coluna `comunicacoes` |
|-----------|-----------------------|
| `from` | `phone_call_from` |
| `to` | `phone_call_to` |
| `meta.call.duration` | `phone_call_duration` (segundos, null se não completou) |
| `meta.call.status` | `phone_call_status` |

---

## Campo `direction`

| Valor | Significado |
|-------|-------------|
| `inbound` | Lead enviou mensagem (lead → SDR) |
| `outbound` | SDR/sistema enviou mensagem (SDR/IA → lead) |

Este campo permite:
- Reconstruir a conversa completa com alternância de vozes
- Analisar tempo de resposta do SDR
- Medir volume de tentativas de contato por SDR
- Identificar leads que respondem vs. que ficam silenciosos

---

## Campo `source` — Detecção de IA/Automação

| Valor | Significado | Quem enviou |
|-------|-------------|-------------|
| `app` | Enviado manualmente no app GHL | Humano (SDR, Closer, Gestor) |
| `api` | Enviado via API externa | Automação/sistema externo |
| `workflow` | Enviado por workflow ou bot do GHL | IA / automação GHL |
| `null` | Não informado | Dados históricos ou mensagem inbound |

**Regra para detectar automação/IA:**
```sql
-- Na view comunicacoes_com_remetente: usar is_automatico = true
-- Ou diretamente na tabela:
WHERE direction = 'outbound'
  AND (
    ghl_source IN ('workflow', 'api', 'bot')
    OR (ghl_source IS NULL AND usuario_ghl_id IS NULL)  -- fallback histórico
  )
```

**Regra para garantir que foi humano:**
```sql
WHERE direction = 'outbound'
  AND ghl_source = 'app'
  AND usuario_ghl_id IS NOT NULL
```

---

## Estratégias de Sync

### Incremental (cron 30 min)

```
startAfterDate = último_sync_bem_sucedido − 1h
→ GET /conversations/search?startAfterDate=X&sort=desc
→ Para cada conversa: GET /conversations/{id}/messages
→ Upsert em comunicacoes por ghl_message_id
```

### Backfill por Contato (correto para histórico completo)

```
Para cada contato em contatos (paginado pelo nosso DB, não pela GHL API):
  → GET /conversations/search?contactId={ghl_id}
  → Para cada conversa retornada: GET /conversations/{id}/messages
  → Upsert em comunicacoes por ghl_message_id
```

Vantagem: não depende da paginação da GHL API (que está quebrada).
Ver documentação completa em `docs/COMUNICACOES-GHL-SYNC.md`.

---

## Dados de Escala (2026-03-11)

| Métrica | Valor |
|---------|-------|
| Total de conversas no location | ~5.973 |
| Total de contatos no Supabase | 7.675 |
| Tipo de mensagem mais comum | `TYPE_WHATSAPP` |
| Direção mais comum | `outbound` (SDR → Lead) |
| Mensagens inbound (lead→SDR) | ~1.300+ |
| Mensagens outbound (SDR→lead) | ~6.100+ |

---

## Decisões de Design

| Decisão | Motivo |
|---------|--------|
| Usar `messageType` (string), não `type` (int) | String é estável entre versões; int varia |
| Upsert por `ghl_message_id` com UNIQUE constraint | Idempotência total — pode re-executar sem duplicar |
| `direction` inbound/outbound | Distinguir mensagens do lead vs. SDR |
| Filtrar `TYPE_ACTIVITY_*` | Eventos de sistema, não comunicações reais |
| `ghlFetch()` centraliza todos os calls | Rate limit handling em um único lugar |
| Delay base 130ms | 7,7 req/s — abaixo do teto de 10 req/s |
| `contato_id` nullable | GHL tem comunicações de contatos que não estão no nosso DB |
| Campos desnormalizados (`contato_nome`, `sdr_name`) | Evitar JOINs nas queries de análise de pré-vendas |
| `backfill_by_contact` em vez de `full_backfill` | Paginação da API está quebrada; contactId funciona |

---

*Documentação atualizada em 2026-03-11*
