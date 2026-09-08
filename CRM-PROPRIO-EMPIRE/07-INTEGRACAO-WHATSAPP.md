# 07 — Integração: WhatsApp

> **O que este documento cobre:** Configuração e funcionamento das duas integrações de WhatsApp — a API Oficial da Meta (Cloud API) e a UAZAPI (não-oficial). Fluxos completos de recebimento, envio, templates, instâncias, e fallback entre as duas.

---

## Por que duas integrações de WhatsApp?

Esta é uma dúvida comum. A resposta é: **cada uma serve para uma coisa diferente**.

| Aspecto | UAZAPI (não-oficial) | WhatsApp Cloud API (oficial) |
|---------|---------------------|------------------------------|
| **Custo por mensagem** | Zero | Sim (por conversa/24h) |
| **Aprovação da Meta** | Não precisa | Precisa (WABA) |
| **Templates aprovados** | Não precisa | Precisa para iniciar conversa |
| **Responder em 24h** | Sim, qualquer mensagem | Sim, qualquer mensagem |
| **Iniciar conversa** | Qualquer mensagem | Só com template aprovado |
| **Risco de banimento** | Real (Meta pode banir) | Zero (é oficial) |
| **Volume alto (blast)** | Arriscado | Seguro |
| **Estabilidade** | Pode desconectar (QR Code) | Alta disponibilidade |
| **Ideal para** | SDRs respondendo leads quentes | Automações em escala, campanhas |

**Recomendação de uso:**
- **UAZAPI:** Para SDRs respondendo leads um a um, conversas ativas do dia a dia
- **API Oficial:** Para automações de boas-vindas, confirmações de reunião, campanhas outbound

---

## Parte A: UAZAPI (WhatsApp Não-Oficial)

### O que é a UAZAPI?

A UAZAPI é um servidor que "emula" o WhatsApp Web em uma máquina. Você conecta o WhatsApp escaneando um QR Code (como no WhatsApp Web do navegador), e a UAZAPI expõe uma API HTTP para enviar e receber mensagens.

**É como se o WhatsApp Web virasse uma API.**

### A.1 Configuração

**Pré-requisitos:**
- Servidor VPS (Linux) para rodar o UAZAPI
- Número de telefone com WhatsApp ativo
- Domínio para a instância (ex: `wa.empire-crm.app`)

**Configuração no Empire CRM:**

```
Configurações → Integrações → WhatsApp → Adicionar Instância UAZAPI

┌─────────────────────────────────────────────────────────┐
│  Nova Instância UAZAPI                                  │
│  ────────────────────────────────────────────           │
│  Nome da Instância    [SDR Principal                  ] │
│  URL da API           [https://wa.empire-crm.app      ] │
│  Token de Autenticação [xxxxxxxxxxxxxxxxxxxxxxxx       ] │
│  Número de Telefone   [+55 11 99999-9999              ] │
│                                                         │
│  ⚠ Conecte agora escaneando o QR Code abaixo:          │
│                                                         │
│  ████ ██ █ ████████                                     │
│  █  █ ██ █ █  █  █                                     │
│  (QR Code gerado pela UAZAPI)                           │
│                                                         │
│  Status: ○ Aguardando escaneamento                      │
│          ✓ Conectado (muda após escanear)               │
└─────────────────────────────────────────────────────────┘
```

### A.2 Recebimento de Mensagens (Webhook UAZAPI → Empire CRM)

**Fluxo completo:**

```
1. Lead envia mensagem no WhatsApp para +55 11 99999-9999
   ↓
2. WhatsApp entrega à instância UAZAPI
   ↓
3. UAZAPI dispara webhook para:
   POST https://[supabase-project].supabase.co/functions/v1/webhook-whatsapp
   Headers:
     Content-Type: application/json
     x-uazapi-secret: [secret configurado]
   Body:
   {
     "instance": "sdr-principal",
     "event": "messages.upsert",
     "data": {
       "key": {
         "remoteJid": "5511999999999@s.whatsapp.net",
         "fromMe": false,
         "id": "BAE5F2A1234..."
       },
       "pushName": "João Silva",
       "message": {
         "conversation": "Oi, quero saber mais sobre a consultoria"
       },
       "messageTimestamp": 1714000000,
       "status": "DELIVERY_ACK"
     }
   }
   ↓
4. Edge Function processa:
   a) Valida x-uazapi-secret
   b) Armazena raw em webhooks_raw (imutável)
   c) Extrai: telefone = "5511999999999", mensagem = "Oi...", id_externo = "BAE5..."
   d) Busca contato pelo telefone
   e) Se não encontrado: cria contato + oportunidade
   f) INSERT em comunicacoes (UPSERT por external_message_id)
   g) Dispara trigger auto-tag "conectado" se necessário
   h) Notifica frontend via Supabase Realtime
```

**Eventos UAZAPI que processamos:**
| Evento | O que significa | Ação |
|--------|----------------|------|
| `messages.upsert` | Nova mensagem (inbound ou outbound) | INSERT em comunicacoes |
| `messages.update` | Status atualizado (delivered, read) | UPDATE delivery_status |
| `connection.update` | Status da conexão mudou | Atualizar status da instância |
| `qrcode.updated` | Novo QR Code gerado | Exibir na interface |

### A.3 Envio de Mensagens (Empire CRM → UAZAPI)

```typescript
// Edge Function: send-message/index.ts

async function sendWhatsAppUazapi(params: {
  instance: string,
  telefone: string,    // "5511999999999" (sem @s.whatsapp.net)
  mensagem: string,
  attachmentUrl?: string,
}) {
  const url = `${UAZAPI_URL}/message/sendText/${params.instance}`
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': UAZAPI_TOKEN,
    },
    body: JSON.stringify({
      number: `${params.telefone}@s.whatsapp.net`,
      text: params.mensagem,
    }),
  })
  
  const result = await response.json()
  return result.key.id  // ID da mensagem no WhatsApp
}
```

**Tipos de mensagem suportados:**
| Tipo | Endpoint UAZAPI | Parâmetros |
|------|----------------|------------|
| Texto | `/message/sendText/{instance}` | `number`, `text` |
| Imagem | `/message/sendMedia/{instance}` | `number`, `mediatype: "image"`, `media` (base64 ou URL) |
| Áudio | `/message/sendMedia/{instance}` | `number`, `mediatype: "audio"`, `media` |
| Documento | `/message/sendMedia/{instance}` | `number`, `mediatype: "document"`, `filename` |
| Vídeo | `/message/sendMedia/{instance}` | `number`, `mediatype: "video"`, `media` |

### A.4 Monitoramento de Conexão

**RF-WA-001:** O sistema verifica o status de cada instância UAZAPI a cada 5 minutos.

**RF-WA-002:** Se uma instância desconectar (QR Code expirado):
1. Status da instância muda para `"disconnected"`
2. Alerta vermelho aparece no painel do workspace
3. Email de notificação é enviado para o owner do workspace
4. Mensagens enviadas para este número ficam em fila com status `"queued"`
5. Quando reconectar: fila processa automaticamente

**RF-WA-003:** A reconexão é feita pelo admin escaneando o novo QR Code na interface.

### A.5 Multi-Instância

**RF-WA-004:** Um workspace pode ter múltiplas instâncias UAZAPI:
- Ex: uma por SDR, ou uma por número de WhatsApp diferente

**RF-WA-005:** Ao enviar mensagem, o sistema escolhe qual instância usar:
1. Se o contato tem uma instância preferida: usa ela
2. Se há uma instância padrão configurada: usa ela
3. Se há múltiplas instâncias ativas: faz round-robin (distribuição balanceada)

---

## Parte B: WhatsApp Cloud API (Oficial Meta)

### O que é a Meta Cloud API?

É a API oficial do WhatsApp fornecida pela Meta (Facebook). Para usar, você precisa:
1. Ter uma conta no Meta Business Manager
2. Criar uma WABA (WhatsApp Business Account)
3. Aprovar um número de telefone
4. Configurar um app no Meta for Developers

**É mais burocrático de configurar, mas é 100% seguro e oficial.**

### B.1 Configuração

**Pré-requisitos:**
- Meta Business Manager ativo e verificado
- WABA aprovada
- Número de telefone aprovado (pode ser o mesmo do UAZAPI? Não — números diferentes)
- App no Meta for Developers com permissão `whatsapp_business_messaging`

**Configuração no Empire CRM:**
```
Configurações → Integrações → WhatsApp → Adicionar Número Oficial

┌─────────────────────────────────────────────────────────┐
│  WhatsApp API Oficial (Meta)                            │
│  ────────────────────────────────────────────           │
│  Phone Number ID    [1234567890123456                 ] │
│  WABA ID            [9876543210987654                 ] │
│  Access Token       [EAAxxxx...                      ] │
│  Verify Token       [meu-secret-123                  ] │
│  Número de Telefone [+55 11 98888-8888               ] │
│                                                         │
│  URL do Webhook (configurar no Meta for Developers):    │
│  https://[projeto].supabase.co/functions/v1/           │
│  webhook-whatsapp-official                              │
│                                                         │
│  Status: ✓ Configurado e ativo                         │
└─────────────────────────────────────────────────────────┘
```

### B.2 Templates HSM (Mensagens para Iniciar Conversa)

Para **iniciar** uma conversa com um lead via API Oficial (sem ele ter mandado mensagem nos últimos 24h), você precisa de um template aprovado pela Meta.

**O que é um template?** Uma mensagem pré-aprovada com slots de variáveis.

**Exemplo de template:**
```
Nome do template: boas_vindas_cdav
Categoria: MARKETING
Idioma: pt_BR
Corpo:
"Olá, {{1}}! Vi que você se inscreveu na nossa consultoria. 
Sou {{2}}, da Empire Business. Posso falar agora?"

Variáveis:
{{1}} = nome do lead
{{2}} = nome do SDR
```

**RF-WA-006:** O Empire CRM tem uma interface para:
1. Criar/visualizar templates
2. Enviar para aprovação da Meta
3. Ver status: "Pendente", "Aprovado", "Rejeitado"
4. Usar templates aprovados no envio de mensagens

**RF-WA-007:** Após aprovação, o template fica disponível para:
- Envio manual pelo SDR no inbox
- Automações (ex: enviar template de boas-vindas quando lead criar)

### B.3 Janela de 24 Horas

**Regra da Meta:** Quando um lead manda mensagem, abre uma "janela" de 24 horas. Dentro desta janela, você pode enviar qualquer mensagem. Fora da janela, apenas templates aprovados.

**Como o Empire CRM gerencia isso:**
```sql
-- Tabela: whatsapp_conversations
-- Registra quando foi a última mensagem inbound de cada contato
-- para determinar se a janela está aberta

SELECT 
  CASE 
    WHEN MAX(data_comunicacao) > NOW() - INTERVAL '24 hours'
    THEN 'janela_aberta'
    ELSE 'apenas_templates'
  END as status_janela
FROM comunicacoes
WHERE contato_id = $1
  AND canal = 'whatsapp'
  AND direction = 'inbound'
```

**Na interface do SDR:** Se a janela estiver fechada, mostra aviso "Esta conversa requer template aprovado" e lista os templates disponíveis.

### B.4 Recebimento de Mensagens (Webhook Meta → Empire CRM)

```
1. Lead envia mensagem no WhatsApp
   ↓
2. Meta envia webhook para a URL configurada:
   POST https://[projeto].supabase.co/functions/v1/webhook-whatsapp-official
   
   {
     "object": "whatsapp_business_account",
     "entry": [{
       "id": "WABA_ID",
       "changes": [{
         "value": {
           "messaging_product": "whatsapp",
           "metadata": {
             "display_phone_number": "15551234567",
             "phone_number_id": "PHONE_NUMBER_ID"
           },
           "contacts": [{
             "profile": { "name": "João Silva" },
             "wa_id": "5511999999999"
           }],
           "messages": [{
             "from": "5511999999999",
             "id": "wamid.xxx",
             "timestamp": "1714000000",
             "type": "text",
             "text": { "body": "Oi, quero saber mais" }
           }]
         },
         "field": "messages"
       }]
     }]
   }
   ↓
3. Edge Function processa (mesmo fluxo que UAZAPI)
```

### B.5 Botões e Listas Interativas

A API Oficial suporta mensagens ricas:

**Botões de resposta rápida (Quick Reply):**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Você tem interesse em saber mais?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "sim", "title": "Sim, tenho!" } },
        { "type": "reply", "reply": { "id": "nao", "title": "Não, obrigado" } }
      ]
    }
  }
}
```

**Mensagem de lista (para múltiplas opções):**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Como prefere ser atendido?" },
    "action": {
      "button": "Ver opções",
      "sections": [{
        "rows": [
          { "id": "reuniao", "title": "Reunião online" },
          { "id": "whatsapp", "title": "Pelo WhatsApp" },
          { "id": "ligacao", "title": "Ligação" }
        ]
      }]
    }
  }
}
```

---

## Parte C: Configurações Compartilhadas

### C.1 Instância Padrão por Pipeline

**RF-WA-008:** Cada pipeline pode ter uma instância de WhatsApp padrão associada:
- "Pré-Vendas MQL" → Instância UAZAPI "SDR Principal"  
- "Vendas SQL" → Instância UAZAPI "Closers"
- "Inbound Automação" → API Oficial

### C.2 Horário de Atendimento

**RF-WA-009:** O workspace pode configurar horário de atendimento:
```
Segunda a Sexta: 09h - 18h
Sábado: 09h - 13h
Domingo: Fechado

Fora do horário: resposta automática "Recebemos sua mensagem! 
Em breve um especialista da Empire Business entrará em contato."
```

### C.3 Mensagem de Boas-vindas Automática

**RF-WA-010:** Quando um lead manda a primeira mensagem (nunca teve contato antes), o sistema pode enviar automaticamente uma mensagem de boas-vindas antes de notificar o SDR.

---

## D. Tabelas do Banco para WhatsApp

```sql
-- Instâncias UAZAPI por workspace
CREATE TABLE whatsapp_instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  tipo              TEXT NOT NULL,    -- "uazapi" | "official"
  nome              TEXT NOT NULL,   -- "SDR Principal"
  instance_id       TEXT,            -- ID da instância no UAZAPI
  phone_number_id   TEXT,            -- Para API Oficial
  waba_id           TEXT,            -- Para API Oficial  
  numero_telefone   TEXT NOT NULL,   -- "+5511999999999"
  api_url           TEXT,            -- URL base da UAZAPI
  status            TEXT DEFAULT 'disconnected',  -- "connected" | "disconnected"
  ultimo_ping       TIMESTAMPTZ,
  is_default        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Templates de mensagem
CREATE TABLE whatsapp_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  instance_id       UUID REFERENCES whatsapp_instances(id),
  nome              TEXT NOT NULL,       -- "boas_vindas_cdav"
  categoria         TEXT,                -- "MARKETING" | "UTILITY" | "AUTHENTICATION"
  idioma            TEXT DEFAULT 'pt_BR',
  corpo             TEXT NOT NULL,
  variaveis         JSONB,               -- ["nome_lead", "nome_sdr"]
  status_meta       TEXT DEFAULT 'draft', -- "draft" | "pending" | "approved" | "rejected"
  meta_template_id  TEXT,               -- ID após aprovação
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## E. Critérios de Aceite

- [ ] QR Code para conexão UAZAPI aparece na interface e atualiza automaticamente
- [ ] Mensagem recebida no WhatsApp aparece no inbox em < 3 segundos
- [ ] Envio de texto, imagem e documento funciona via UAZAPI
- [ ] Alerta de desconexão aparece imediatamente quando instância cai
- [ ] Template HSM pode ser criado e enviado para aprovação Meta
- [ ] Janela de 24h é respeitada: mostra aviso quando fechada
- [ ] Multi-instância distribui mensagens por round-robin
- [ ] Configuração de horário de atendimento funciona corretamente

---

*Próximo: [08 — Integração ActiveCampaign](./08-INTEGRACAO-ACTIVECAMPAIGN.md)*
