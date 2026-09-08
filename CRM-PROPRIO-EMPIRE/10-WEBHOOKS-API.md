# 10 — Webhooks & API Pública

> **O que este documento cobre:** O sistema completo de API REST pública e webhooks do Empire CRM — como criar API keys, todos os endpoints disponíveis, webhooks de entrada e saída, rate limiting, logs e retry.

---

## Por que "ilimitados"?

No GHL, webhooks são limitados por plano — você tem um número fixo. Isso força você a escolher quais integrações ativar.

No Empire CRM, webhooks e API keys são **ilimitados por workspace**. Você pode criar quantos quiser. A única limitação é técnica (volume de requests), não artificial.

---

## Parte A: API REST Pública

### A.1 Autenticação

**Todas as chamadas autenticadas** usam API Keys no header:

```
Authorization: Bearer emp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Formato das chaves:**
- `emp_live_xxx...` — Chave de produção
- `emp_test_xxx...` — Chave de teste (dados de sandbox)

**Como criar uma API Key:**
```
Configurações → API & Webhooks → API Keys → Nova Chave

┌─────────────────────────────────────────────────────────┐
│  Nova API Key                                           │
│  ────────────────────────────────────────────           │
│  Nome          [Integração Site Principal            ]  │
│  Permissões    [✓ Read]  [✓ Write]  [✗ Delete]        │
│  Expiração     [○ Nunca  ● Em: 31/12/2026            ]  │
│                                                         │
│  ⚠ A chave só é exibida UMA VEZ. Copie e salve agora! │
│                                                         │
│  [Gerar Chave]                                          │
└─────────────────────────────────────────────────────────┘
```

**Segurança:** A chave é exibida UMA VEZ ao ser criada. O banco armazena apenas o hash SHA-256 da chave, nunca o valor original.

### A.2 Endpoints Disponíveis

**Base URL:** `https://api.empire-crm.app/v1`

---

#### CONTACTS (Contatos)

```
GET    /contacts
GET    /contacts/:id
POST   /contacts
PUT    /contacts/:id
DELETE /contacts/:id
POST   /contacts/:id/tags
DELETE /contacts/:id/tags/:tag_name
```

**GET /contacts — Parâmetros de Query:**
```
page=1             (padrão: 1)
limit=50           (padrão: 50, máximo: 1000)
search=joão        (busca por nome, email, telefone)
tags=mql,conectado (filtrar por tags — AND entre elas)
utm_source=facebook
created_after=2026-01-01
created_before=2026-12-31
has_opportunity=true|false
pipeline_id=uuid
sort=created_at    (campo para ordenar)
order=asc|desc     (padrão: desc)
```

**Exemplo de resposta GET /contacts:**
```json
{
  "data": [
    {
      "id": "abc-123",
      "nome": "João Silva",
      "email": "joao@email.com",
      "telefone": "5511999999999",
      "tags": ["mql", "conectado"],
      "utm_source": "facebook",
      "utm_campaign": "cdav-jan-2026",
      "owner_name": "Karina SDR",
      "lead_quality_score": 72.5,
      "created_at": "2026-01-15T10:30:00Z",
      "opportunities_count": 1
    }
  ],
  "pagination": {
    "total": 4792,
    "page": 1,
    "limit": 50,
    "has_more": true,
    "next_cursor": "abc-124"
  }
}
```

---

#### OPPORTUNITIES (Oportunidades)

```
GET    /opportunities
GET    /opportunities/:id
POST   /opportunities
PUT    /opportunities/:id
DELETE /opportunities/:id
POST   /opportunities/:id/stage    (mover de stage)
POST   /opportunities/:id/close    (fechar venda)
POST   /opportunities/:id/lose     (marcar como perdido)
```

**POST /opportunities — Body:**
```json
{
  "contact_id": "abc-123",
  "pipeline_id": "uuid",
  "stage_id": "uuid",
  "titulo": "João Silva - CDAV Jan/26",
  "valor": 15000,
  "sdr_name": "Karina",
  
  // Alternativa: criar/encontrar contato inline
  "contato": {
    "nome": "João Silva",
    "email": "joao@email.com",
    "telefone": "11999999999",
    "utm_source": "facebook"
  }
}
```

**POST /opportunities/:id/stage — Mover de Stage:**
```json
{
  "stage_id": "uuid-stage-qualificado",
  "nota": "Lead muito engajado, agenda perfeita"
}
```

**POST /opportunities/:id/close — Registrar Venda:**
```json
{
  "data_pagamento_entrada": "2026-04-15T14:00:00Z",
  "valor_entrada": 3000,
  "numero_parcelas": 6,
  "valor_parcela": 2000,
  "produto_vendido": "Consultoria CDAV",
  "forma_pagamento": "pix"
}
```

---

#### PIPELINES

```
GET    /pipelines
GET    /pipelines/:id
GET    /pipelines/:id/stages
POST   /pipelines
PUT    /pipelines/:id
DELETE /pipelines/:id
POST   /pipelines/:id/stages
PUT    /pipelines/:id/stages/:stage_id
DELETE /pipelines/:id/stages/:stage_id
```

---

#### COMMUNICATIONS (Comunicações)

```
GET    /communications              (histórico de mensagens)
GET    /communications?contact_id=  (mensagens de um contato)
POST   /communications              (enviar mensagem)
```

**POST /communications — Enviar Mensagem:**
```json
{
  "contact_id": "abc-123",
  "canal": "whatsapp",
  "mensagem": "Olá João, tudo bem? Quando podemos conversar?",
  "instance_id": "uuid-instancia-uazapi"  // opcional
}
```

---

#### TAGS

```
GET    /tags          (listar todas as tags do workspace)
POST   /tags          (criar nova tag)
DELETE /tags/:id      (deletar tag — remove de todos os contatos)
```

---

#### FORMS (Formulários)

```
GET    /forms                     (listar formulários)
GET    /forms/:id                 (detalhes do formulário)
POST   /forms/:id/submit          (submeter formulário — público, sem auth)
GET    /forms/:id/submissions     (listar submissões)
```

---

### A.3 Paginação Cursor-Based

Para grandes volumes de dados, usamos paginação por cursor (mais eficiente que paginação por número de página):

```
Primeira página:
GET /contacts?limit=100

Resposta:
{
  "data": [...],
  "pagination": {
    "total": 4792,
    "limit": 100,
    "has_more": true,
    "next_cursor": "abc-100"  ← ID do último registro retornado
  }
}

Próxima página:
GET /contacts?limit=100&cursor=abc-100

E assim por diante até has_more = false
```

---

### A.4 Rate Limiting

| Tipo de Key | Limite |
|------------|--------|
| Padrão | 1.000 req/min |
| Alta performance | 10.000 req/min (configurável pelo workspace) |
| Formulário público (sem auth) | 100 req/min por IP |

**Headers retornados em toda resposta:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1714000060
```

**Quando limite atingido:**
```json
HTTP 429 Too Many Requests
{
  "error": "rate_limit_exceeded",
  "message": "Você atingiu o limite de 1000 requisições por minuto",
  "retry_after": 32
}
```

---

## Parte B: Webhooks de Saída

### B.1 O que são webhooks de saída?

Webhooks de saída são "notificações automáticas" que o Empire CRM envia para URLs externas quando eventos acontecem.

**Analogia:** É como se o sistema dissesse "ei, aconteceu uma coisa, vou te avisar" para sistemas externos que precisam saber.

**Exemplo de uso:**
- Quando um novo lead chega → notificar o sistema interno de BI
- Quando uma venda é fechada → notificar o sistema financeiro
- Quando um lead vira MQL → disparar automação no n8n

### B.2 Eventos Disponíveis

| Evento | Quando ocorre |
|--------|--------------|
| `contato.criado` | Novo contato inserido |
| `contato.atualizado` | Campos do contato alterados |
| `contato.deletado` | Contato removido (soft delete) |
| `contato.tag.adicionada` | Tag adicionada ao contato |
| `contato.tag.removida` | Tag removida do contato |
| `oportunidade.criada` | Nova oportunidade aberta |
| `oportunidade.atualizada` | Campos da oportunidade alterados |
| `oportunidade.stage.mudou` | Oportunidade movida de stage |
| `oportunidade.fechada` | Oportunidade marcada como ganha |
| `oportunidade.perdida` | Oportunidade marcada como perdida |
| `mensagem.recebida` | Mensagem inbound recebida |
| `mensagem.enviada` | Mensagem outbound enviada |
| `formulario.submetido` | Submissão de formulário processada |
| `reuniao.criada` | Reunião agendada |
| `reuniao.realizada` | Reunião marcada como realizada |

### B.3 Criação de Webhook

```
Configurações → API & Webhooks → Webhooks de Saída → Novo Webhook

┌─────────────────────────────────────────────────────────────────┐
│  Novo Webhook de Saída                                          │
│  ─────────────────────────────────────────────────────          │
│  Nome          [Notificar n8n — Novo Lead MQL               ]   │
│  URL Destino   [https://n8n.meudominio.com/webhook/abc123   ]   │
│  Secret        [gerado automaticamente — copie agora!       ]   │
│                                                                  │
│  Eventos:                                                        │
│  [✓] contato.tag.adicionada                                     │
│  [✗] oportunidade.criada                                        │
│  (selecione todos os eventos relevantes)                         │
│                                                                  │
│  Filtros (opcional):                                             │
│  Apenas disparar se:                                             │
│  Campo: [tag adicionada ▾]  Operador: [é igual a ▾]  Valor: [mql]│
│                                                                  │
│  Máximo de tentativas: [5]  Timeout: [10s]                      │
│                                                                  │
│  [Testar Webhook]  [Salvar]                                      │
└─────────────────────────────────────────────────────────────────┘
```

### B.4 Payload do Webhook

```json
{
  "event": "contato.tag.adicionada",
  "timestamp": "2026-04-15T14:32:17.123Z",
  "webhook_id": "wh-uuid",
  "delivery_id": "del-uuid",
  "workspace_id": "ws-uuid",
  
  "data": {
    "contato": {
      "id": "contact-uuid",
      "nome": "João Silva",
      "email": "joao@email.com",
      "telefone": "5511999999999",
      "tags": ["mql", "conectado"],
      "utm_source": "facebook",
      "utm_campaign": "cdav-jan-2026"
    },
    "tag": "mql",
    "adicionada_por": "Sistema — auto-classificação"
  }
}
```

**Assinatura HMAC-SHA256** (para verificar que o webhook veio do Empire CRM):
```
Header: X-Empire-Signature: sha256=abc123...
Calcular: HMAC-SHA256(secret, payload_body)
```

### B.5 Retry Automático

Quando um webhook falha (timeout, HTTP 4xx/5xx), o sistema retenta automaticamente:

| Tentativa | Delay |
|-----------|-------|
| 1ª (imediata) | — |
| 2ª | 1 minuto |
| 3ª | 5 minutos |
| 4ª | 30 minutos |
| 5ª | 2 horas |
| Desistir | — |

Se todas as tentativas falharem, o webhook fica com status `failed` no log.

### B.6 Log de Entregas

```
Configurações → Webhooks → [Nome do Webhook] → Log

┌──────────┬──────────────────┬────────┬────────────┐
│ Data     │ Evento           │ Status │ HTTP       │
├──────────┼──────────────────┼────────┼────────────┤
│ 15/04 14h│ contato.tag...   │ ✓ 200  │ 200 OK     │
│ 15/04 13h│ contato.tag...   │ ✓ 200  │ 200 OK     │
│ 15/04 12h│ oportunidade...  │ ✗ Fail │ 500 Error  │
│ 15/04 12h│ oportunidade...  │ ↺ Retry│ — (2ª tent)│
│ 15/04 12h│ oportunidade...  │ ✓ 200  │ 200 OK     │
└──────────┴──────────────────┴────────┴────────────┘
```

Cada log inclui: payload enviado, resposta recebida, tempo de resposta.

---

## Parte C: Webhooks de Entrada (Enriquecimento)

### C.1 Para que servem os webhooks de entrada?

**Importante:** Webhooks de entrada não são a forma principal de criar leads no Empire CRM. Leads são criados via **formulários** ou via **API REST** (Partes A e B do documento 09).

Webhooks de entrada servem para **enriquecer dados de contatos e oportunidades já existentes** a partir de eventos em sistemas externos.

**Analogia:** É como receber uma notificação de outro aplicativo que diz "aconteceu algo com esse contato que você já tem cadastrado". O CRM então atualiza as informações desse contato.

**Casos de uso reais:**

| Sistema externo | Evento | O que o CRM faz |
|----------------|--------|----------------|
| **Calendly** | Lead agendou uma reunião | Atualiza `data_reuniao_agendada` na oportunidade |
| **Hotmart** | Lead comprou um produto | Move para pipeline "Compradores", adiciona tag "comprador" |
| **Typeform externo** | Lead respondeu pesquisa | Atualiza campos de qualificação do contato |
| **Assinatura digital** | Contrato assinado | Atualiza `op_link_contrato_assinado` na oportunidade |
| **ActiveCampaign** | Lead entrou em automação | Adiciona tag correspondente no contato |

**Não é para:** criar leads do zero vindos de anúncios ou sites externos — para isso, usar os formulários nativos ou a API REST diretamente.

### C.2 URL e Configuração

**URL de entrada por workspace:**
```
https://api.empire-crm.app/webhooks/in/{workspace_id}/{secret}
```

**Configuração:**
```
Configurações → API & Webhooks → Webhooks de Entrada → Novo

Nome:     [Webhook do Calendly                         ]
Secret:   [gerado automaticamente                      ]
Mapear:   Como identificar o contato e o que atualizar?

Identificar contato por:
"invitee.email"  → contato.email   (busca o contato existente)

O que atualizar:
"event.start_time" → oportunidade.data_reuniao_agendada
"event.location"   → oportunidade.link_reuniao

Tags ao receber: [reuniao-agendada]
Ação: mover oportunidade para stage [Agendado ▾]
```

**Como o sistema localiza o contato:**
1. Busca contato por email ou telefone no payload
2. Se encontrar: aplica as atualizações configuradas
3. Se não encontrar: salva em `webhooks_raw` para revisão manual (não cria contato automaticamente — esse comportamento pode ser configurado)

### C.3 Aceita JSON e Form-urlencoded

```bash
# JSON:
curl -X POST https://api.empire-crm.app/webhooks/in/ws-id/secret \
  -H "Content-Type: application/json" \
  -d '{"invitee": {"email": "joao@email.com"}, "event": {"start_time": "2026-04-20T14:00:00Z"}}'

# Form-urlencoded:
curl -X POST https://api.empire-crm.app/webhooks/in/ws-id/secret \
  -d "email=joao@email.com&event_date=2026-04-20"
```

**Rastreabilidade:** Todo webhook recebido é salvo em `webhooks_raw` antes de ser processado. Se o mapeamento estiver errado, o dado original está preservado e pode ser reprocessado.

---

## Parte D: Monitoramento de API

### Monitoramento de API

```
Configurações → API & Webhooks → Monitoramento

┌────────────────────────────────────────────────────────┐
│  Uso da API — Últimos 30 dias                          │
│                                                        │
│  Total de Requests:  48.392                            │
│  Erros (4xx/5xx):    127 (0.26%)                      │
│  Taxa de Sucesso:    99.74%                            │
│  Latência Média:     42ms                              │
│                                                        │
│  Endpoints mais usados:                                │
│  1. POST /forms/*/submit    → 38.221 (79%)             │
│  2. GET  /contacts          → 6.843 (14%)              │
│  3. PUT  /contacts/*        → 1.872 (4%)               │
│  4. POST /opportunities     → 1.456 (3%)               │
└────────────────────────────────────────────────────────┘
```

---

### A.4 API Versioning

**A URL já inclui a versão:** `https://api.empire-crm.app/v1`. Mudanças breaking (remoção de campos, mudança de tipos) exigem bump para `/v2`. Mudanças non-breaking (adição de campos novos) são feitas na mesma versão sem aviso prévio.

**Política de versionamento:**
- **v1** é a versão atual e será mantida por pelo menos 24 meses após o lançamento de v2
- Novos campos podem ser adicionados a qualquer momento (non-breaking)
- Campos deprecated são marcados com header `Deprecation: true` por 6 meses antes de serem removidos
- Clientes podem enviar header `Accept-Version: 2026-04-15` para receber respostas compatíveis com a data

---

### A.5 Idempotency Keys

**Problema:** Chamadas POST que falham por timeout ou erro de rede podem ser retentadas, causando criação de registros duplicados.

**Solução:** Clientes podem enviar header `Idempotency-Key: <uuid>` em chamadas POST. O servidor guarda o resultado da primeira chamada por 24h. Se a mesma chave for enviada novamente, o servidor retorna o resultado original sem executar de novo.

```http
POST /api/v1/contacts
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{ "nome": "João Silva", "email": "joao@email.com" }
```

**Implementação:**
```sql
CREATE TABLE idempotency_keys (
  key             TEXT PRIMARY KEY,  -- UUID fornecido pelo cliente
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  endpoint        TEXT NOT NULL,     -- '/api/v1/contacts'
  response_status INTEGER NOT NULL, -- 200, 201, etc.
  response_body   JSONB,            -- Corpo da resposta original
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
-- pg_cron limpa chaves expiradas a cada hora
```

---

### A.6 Batch Operations

**POST /contacts/bulk** — Criar ou atualizar múltiplos contatos em uma chamada:

```json
{
  "contacts": [
    { "nome": "João", "email": "joao@email.com", "telefone": "11999999999" },
    { "nome": "Maria", "email": "maria@email.com", "telefone": "21988888888" }
  ],
  "upsert": true
}
```

**Resposta:**
```json
{
  "data": [
    { "id": "uuid-1", "nome": "João", "created": true },
    { "id": "uuid-2", "nome": "Maria", "created": false }
  ],
  "errors": [],
  "summary": { "created": 1, "updated": 1, "failed": 0 }
}
```

**POST /opportunities/bulk-stage** — Mover múltiplas oportunidades de stage:

```json
{
  "opportunity_ids": ["uuid-1", "uuid-2", "uuid-3"],
  "stage_id": "uuid-stage-conectado",
  "nota": "Conexão confirmada via WhatsApp"
}
```

**Limites:** Máximo 100 itens por request batch. Para volumes maiores, usar paginação ou job assíncrono.

---

## Critérios de Aceite

- [ ] API Key gerada aparece apenas uma vez (segurança)
- [ ] Todos os endpoints CRUD funcionam para contatos e oportunidades
- [ ] Rate limit retorna 429 com `retry_after` correto
- [ ] Webhook de saída entrega payload com assinatura HMAC-SHA256
- [ ] Retry automático funciona: 5 tentativas com backoff exponencial
- [ ] Log de entregas mostra payload enviado e resposta recebida
- [ ] Webhook de entrada mapeia campos corretamente e cria contato/oportunidade
- [ ] Paginação cursor-based funciona para bases com 10k+ registros
- [ ] Teste de webhook na interface confirma entrega

---

*Próximo: [12 — Módulo Automações](./12-MODULO-AUTOMACOES.md)*
