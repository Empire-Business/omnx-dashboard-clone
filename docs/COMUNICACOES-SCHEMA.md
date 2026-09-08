# Tabela `comunicacoes` — Guia Completo

> **API source:** [`APIS-DOCS/ghl-conversations-api.md`](../APIS-DOCS/ghl-conversations-api.md)
> **Sync técnico:** [`COMUNICACOES-GHL-SYNC.md`](../COMUNICACOES-GHL-SYNC.md)

---

## O que é esta tabela

`comunicacoes` é o **histórico completo de toda interação** entre o time comercial e os leads: cada mensagem de WhatsApp, SMS, email, ligação, DM de Instagram/Facebook, chat do site. Vem da GHL Conversations API e é sincronizado a cada 30 minutos.

Três tipos de remetente:
- **Lead** — mandou mensagem pro time (`direction = 'inbound'`)
- **Humano** — SDR/Closer digitou manualmente no app GHL (`direction = 'outbound'`, `ghl_source = 'app'`)
- **Automação/IA** — workflow, bot ou sistema disparou a mensagem (`direction = 'outbound'`, `ghl_source = 'workflow'` ou `'api'`)

---

## Guia de Interpretação — Campo a Campo

### `direction` — Quem iniciou a mensagem

| Valor | Significado | Quando ocorre |
|-------|-------------|---------------|
| `inbound` | Lead enviou pro time | Lead respondeu, tirou dúvida, pediu info |
| `outbound` | Time/sistema enviou pro lead | SDR abordou, IA disparou sequência, sistema notificou |
| `NULL` | Direção desconhecida | Histórico anterior a 2026-03-11 (antes do sync via API) |

**Armadilha:** não filtre `WHERE direction = 'outbound'` sem também verificar `ghl_source` se quiser separar humano de automação.

---

### `ghl_source` — Quem dentro do "outbound" enviou

Só relevante quando `direction = 'outbound'`.

| Valor | Quem enviou | Exemplo prático |
|-------|-------------|-----------------|
| `app` | Humano digitou no app GHL | SDR abriu o GHL e mandou "Oi, tudo bem?" |
| `workflow` | Workflow/bot do GHL disparou | Sequência automática de follow-up, IA de atendimento |
| `api` | Sistema externo via API GHL | Integração, automação via Zapier/Make, sistema próprio |
| `NULL` | Não registrado | Dados históricos (antes de 2026-03-12) — usar fallback |

**Fallback para dados históricos (`ghl_source IS NULL`):**
- `usuario_ghl_id IS NOT NULL` → provavelmente humano
- `usuario_ghl_id IS NULL` → provavelmente automação

---

### `msg_status` — Status de entrega da mensagem

| Valor | Significado | O que fazer |
|-------|-------------|-------------|
| `sent` | Enviada pelo GHL, aguardando entrega | Normal — esperar virar `delivered` |
| `delivered` | Chegou no dispositivo do destinatário | Normal |
| `read` | Lead abriu e leu (WhatsApp confirma leitura) | Lead viu — se não respondeu, é objeção silenciosa |
| `failed` | Falha no envio — checar `error_msg` | Número inválido, bloqueado, fora de área |
| `pending` | Na fila, ainda não enviado | Pode indicar problema no GHL |
| `completed` | Ligação completada | Específico de `channel = 'call'` |
| `NULL` | Status desconhecido | Mensagem inbound ou histórico sem status |

`msg_status` só é confiável para mensagens `outbound`. Para `inbound`, geralmente vem `NULL`.

---

### `ghl_date_updated` — Quando o status mudou

Diferente de `data_comunicacao` (quando a mensagem foi criada), `ghl_date_updated` é quando o GHL atualizou o status.

**Uso prático:** calcular tempo entre envio e entrega/leitura:
```sql
ghl_date_updated - data_comunicacao AS tempo_ate_status
```

---

### `alt_id` — ID externo da mensagem na plataforma de origem

| Canal | Formato típico | Para que serve |
|-------|---------------|----------------|
| WhatsApp | `wamid.HBgMNTUzMTk0...` | Rastrear mensagem direto na API do WhatsApp Business |
| Facebook/Instagram | ID numérico longo | Cruzar com dados do Meta |
| SMS | ID da operadora | Auditoria de entrega |
| `NULL` | — | GHL não recebeu o ID externo ou canal não fornece |

---

### `error_msg` — Descrição do erro de entrega

Só preenchido quando `msg_status = 'failed'`.

**Exemplos de erros comuns:**
- `"Invalid destination number or unreachable"` → número errado ou desligado
- `"Blocked by user"` → lead bloqueou o número
- `"HSM template not approved"` → template de WhatsApp não aprovado pela Meta

```sql
-- Checar saúde de entrega
SELECT error_msg, COUNT(*) AS ocorrencias
FROM comunicacoes
WHERE msg_status = 'failed'
  AND data_comunicacao >= NOW() - INTERVAL '7 days'
GROUP BY error_msg ORDER BY ocorrencias DESC;
```

---

### `msg_from` e `msg_to` — Remetente e destinatário

Disponível para todos os canais.

| Canal | `msg_from` | `msg_to` |
|-------|-----------|---------|
| WhatsApp/SMS | Número do remetente (`+5531...`) | Número do destinatário |
| Email | Endereço de email | Endereço de email |
| Call | Número que ligou | Número que recebeu |
| Facebook/Instagram | ID do perfil | ID do perfil |

`phone_call_from`/`phone_call_to` existem por compatibilidade e só têm valor em `channel = 'call'`.

---

### `usuario_ghl_id` — Quem no time enviou (outbound)

| Valor | Significa |
|-------|-----------|
| Preenchido | Um usuário humano do GHL enviou — cruzar com `ghl_users.ghl_id` |
| `NULL` em outbound | Automação/IA enviou (sem usuário associado) |
| `NULL` em inbound | Normal — lead não tem usuário GHL |

---

### `ghl_assigned_to` — Responsável pela conversa

Diferente de `usuario_ghl_id` (quem enviou **essa mensagem**), `ghl_assigned_to` é quem está **atribuído à conversa** no momento do sync.

| Quando usar | Como usar |
|-------------|-----------|
| Identificar de quem é a responsabilidade do lead | `WHERE ghl_assigned_to = '{ghl_user_id}'` |
| `NULL` | Conversa não atribuída a ninguém |

---

### `channel` — Canal de comunicação

| Valor | Canal | Particularidades |
|-------|-------|-----------------|
| `whatsapp` | WhatsApp Business | `msg_status` rico (read/delivered), `alt_id` = wamid |
| `sms` | SMS | `msg_status` menos confiável, sem confirmação de leitura |
| `email` | Email | `mensagem_subject` preenchido |
| `call` | Ligação telefônica | `phone_call_*` preenchidos, `mensagem_body` é transcrição se houver |
| `facebook` | Facebook Messenger | `alt_id` = ID Meta |
| `instagram` | Instagram DM | `alt_id` = ID Meta |
| `gmb` | Google My Business | Mensagens da ficha do Google |
| `webchat` | Chat do site (GHL) | Mensagens do widget de chat |

---

### `data_comunicacao` — Timestamp real da mensagem

**Sempre use este campo para análise temporal.** Corresponde ao campo `dateAdded` da GHL API.

**Nunca use `created_at`** — esse é quando o registro entrou no Supabase.

**Timezone:** armazenado em UTC. Converter ao exibir:
```sql
data_comunicacao AT TIME ZONE 'America/Sao_Paulo'
```

---

### `attachments` — Arquivos enviados

JSONB com array de URLs das mídias enviadas:
```json
["https://storage.ghl.com/arquivo1.jpg", "https://storage.ghl.com/audio.ogg"]
```

---

### Campos desnormalizados

`contato_nome`, `contato_email`, `contato_telefone`, `sdr_name` — copiados de `contatos` no momento do sync para evitar JOINs em queries de análise. Refletem dados do momento do último sync, não o estado atual.

### `contato_id` — Link para tabela contatos

**Como é preenchido:**
1. **Primeiro:** Preenchido pela edge function `sync-ghl-conversations` fazendo lookup de `ghl_contact_id` em `contatos`
2. **Fallback automático (trigger):** Se chegar com `contato_id=NULL` mas `contato_email` ou `contato_telefone` preenchidos, um BEFORE INSERT trigger (`tr_fill_comunicacao_contato_id`) tenta preencher automaticamente:
   - Primeiro tenta lookup por `contato_email = contatos.email`
   - Fallback por `contato_telefone = contatos.telefone`
3. **Resultado:** Praticamente todas as comunicações têm `contato_id` preenchido (55.408 registros em produção, 0% NULL)

**Quando pode ser NULL:**
- Comunicação de um contato que não existe em `contatos` (raro — contatos são criados no primeiro webhook)
- Comunicação sem email/telefone desnormalizados (muito raro — sync sempre copia)

**Query segura com LEFT JOIN:**
```sql
SELECT c.*, ct.nome, ct.email
FROM comunicacoes c
LEFT JOIN contatos ct ON ct.id = c.contato_id
WHERE ... -- seus filtros
```

---

## View `comunicacoes_com_remetente`

Faz LEFT JOIN com `ghl_users` e adiciona:

| Campo extra | Tipo | Como interpretar |
|-------------|------|-----------------|
| `remetente_nome` | TEXT | Nome do usuário GHL que enviou. NULL se lead ou automação |
| `remetente_papeis` | TEXT[] | Array de papéis: `['sdr']`, `['closer']`, etc. NULL se não há usuário |
| `remetente_email` | TEXT | Email do usuário GHL |
| `is_automatico` | BOOLEAN | `true` = workflow/bot/api. `false` = humano ou lead |
| `autor` | TEXT | Rótulo calculado — ver tabela abaixo |

**Valores do campo `autor`:**

| Valor | Quando ocorre |
|-------|---------------|
| `'lead'` | `direction = 'inbound'` |
| `'automacao'` | `ghl_source IN ('workflow','api','bot')` ou outbound sem userId |
| `'sdr'` | Outbound, usuário GHL com papel `sdr` |
| `'closer'` | Outbound, usuário GHL com papel `closer` |
| `'social_seller'` | Outbound, usuário GHL com papel `social_seller` |
| `'gestor'` | Outbound, usuário GHL com papel `gestor` |
| `'sistema'` | Outbound, usuário GHL com papel `sistema` |
| `'time'` | Outbound, usuário GHL sem papel definido |
| `'desconhecido'` | direction NULL ou estado indeterminado |

---

## Armadilhas e Anti-Patterns

**Usar `created_at` como data da mensagem:**
```sql
-- ERRADO
WHERE created_at >= '2026-03-01'
-- CORRETO
WHERE data_comunicacao >= '2026-03-01'
```

**Assumir que todo outbound sem userId é IA:**
```sql
-- IMPRECISO — dados pré-2026-03-12 não têm ghl_source
WHERE direction = 'outbound' AND usuario_ghl_id IS NULL

-- ROBUSTO — cobre histórico e dados novos
WHERE direction = 'outbound'
  AND (ghl_source IN ('workflow', 'api', 'bot')
       OR (ghl_source IS NULL AND usuario_ghl_id IS NULL))
```

**Contar mensagens sem considerar direction:**
```sql
-- ERRADO — mistura leads respondendo e SDR abordando
SELECT sdr_name, COUNT(*) FROM comunicacoes GROUP BY sdr_name

-- CORRETO — só o que o SDR enviou, manualmente
SELECT sdr_name, COUNT(*) FROM comunicacoes
WHERE direction = 'outbound' AND ghl_source = 'app'
GROUP BY sdr_name
```

---

## Queries prontas para uso

```sql
-- 1. Reconstruir conversa completa com um lead
SELECT
  data_comunicacao AT TIME ZONE 'America/Sao_Paulo' AS horario,
  autor, channel, ghl_source, msg_status,
  COALESCE(mensagem_body, '[ligação ' || COALESCE(phone_call_status,'') || ' ' || COALESCE(phone_call_duration::text,'') || 's]') AS conteudo
FROM comunicacoes_com_remetente
WHERE contato_id = '{uuid-do-contato}'
ORDER BY data_comunicacao;

-- 2. Volume por autor e canal (últimos 30 dias)
SELECT autor, channel, COUNT(*) AS total
FROM comunicacoes_com_remetente
WHERE data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY autor, channel ORDER BY total DESC;

-- 3. Ranking de SDRs por mensagens humanas enviadas
SELECT sdr_name, COUNT(*) AS mensagens
FROM comunicacoes
WHERE direction = 'outbound'
  AND ghl_source = 'app'
  AND data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY sdr_name ORDER BY mensagens DESC;

-- 4. Mensagens com falha de entrega (últimos 7 dias)
SELECT contato_nome, channel, mensagem_body, error_msg,
       data_comunicacao AT TIME ZONE 'America/Sao_Paulo' AS horario
FROM comunicacoes
WHERE msg_status = 'failed'
  AND data_comunicacao >= NOW() - INTERVAL '7 days'
ORDER BY data_comunicacao DESC;

-- 5. Leads que enviaram inbound mas não tiveram resposta humana em 24h
SELECT DISTINCT c.contato_id, c.contato_nome,
  MAX(c.data_comunicacao) AT TIME ZONE 'America/Sao_Paulo' AS ultima_msg_lead
FROM comunicacoes c
WHERE c.direction = 'inbound'
  AND c.data_comunicacao >= NOW() - INTERVAL '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM comunicacoes r
    WHERE r.contato_id = c.contato_id
      AND r.direction = 'outbound'
      AND r.ghl_source = 'app'
      AND r.data_comunicacao > c.data_comunicacao
  )
GROUP BY c.contato_id, c.contato_nome;

-- 6. Taxa de leitura das mensagens WhatsApp
SELECT
  msg_status,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM comunicacoes
WHERE channel = 'whatsapp'
  AND direction = 'outbound'
  AND msg_status IN ('sent', 'delivered', 'read', 'failed')
  AND data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY msg_status;

-- 7. Proporção automação vs humano por canal
SELECT
  channel,
  COUNT(*) FILTER (WHERE is_automatico = false AND autor = 'lead') AS lead,
  COUNT(*) FILTER (WHERE is_automatico = false AND autor != 'lead') AS humano,
  COUNT(*) FILTER (WHERE is_automatico = true) AS automacao
FROM comunicacoes_com_remetente
WHERE data_comunicacao >= NOW() - INTERVAL '30 days'
GROUP BY channel ORDER BY (humano + automacao) DESC;

-- 8. Tempo médio de resposta do SDR
WITH inbounds AS (
  SELECT contato_id, data_comunicacao AS t_inbound,
    LEAD(data_comunicacao) OVER (PARTITION BY contato_id ORDER BY data_comunicacao) AS t_next
  FROM comunicacoes WHERE direction = 'inbound'
),
respostas AS (
  SELECT i.contato_id,
    MIN(o.data_comunicacao - i.t_inbound) AS tempo_resposta
  FROM inbounds i
  JOIN comunicacoes o ON o.contato_id = i.contato_id
    AND o.direction = 'outbound' AND o.ghl_source = 'app'
    AND o.data_comunicacao > i.t_inbound
    AND (i.t_next IS NULL OR o.data_comunicacao < i.t_next)
  GROUP BY i.contato_id
)
SELECT
  AVG(EXTRACT(EPOCH FROM tempo_resposta)/3600) AS media_horas,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM tempo_resposta)/3600) AS mediana_horas
FROM respostas;
```

---

## Cron de atualização

| Modo | Frequência | O que faz |
|------|-----------|-----------|
| `incremental` | A cada 30 min (pg_cron) | Busca conversas com mensagens novas desde último sync |
| `backfill_by_contact` | Manual | Itera todos os contatos, atualiza campos retroativamente |

O sync é **idempotente** — deduplicação por `ghl_message_id` (UNIQUE constraint).

```sql
-- Checar último sync
SELECT mode, status, started_at, messages_upserted
FROM ghl_conversations_sync_log
ORDER BY started_at DESC LIMIT 5;
```
