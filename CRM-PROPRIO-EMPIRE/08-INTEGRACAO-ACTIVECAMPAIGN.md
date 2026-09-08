# 08 — Integração: ActiveCampaign

> **O que este documento cobre:** Sincronização bidirecional entre o Empire CRM e o ActiveCampaign — o que é, por que usar junto, como configurar, quais dados são sincronizados, e os fluxos de dados em ambas as direções.

---

## O que é o ActiveCampaign?

O **ActiveCampaign (AC)** é uma plataforma de e-mail marketing e automações. Enquanto o Empire CRM gerencia o relacionamento ativo com leads (WhatsApp, ligações, pipeline), o ActiveCampaign é especialista em:
- Sequências de e-mail automatizadas
- Nutrição de leads via e-mail ao longo de semanas/meses
- Segmentação avançada por comportamento (abriu email, clicou em link)
- Lead scoring baseado em interações com emails

**Por que usar os dois juntos?**

Pense assim: o SDR conversa com o lead pelo WhatsApp (Empire CRM). Mas o lead que ainda não está pronto para comprar precisa receber emails de nutrição ao longo de 3 meses (ActiveCampaign). As duas ferramentas se complementam.

---

## 1. O que sincronizamos

### Do Empire CRM para o ActiveCampaign:

| Evento no CRM | Ação no ActiveCampaign |
|---------------|----------------------|
| Contato criado | Criar/atualizar contato no AC |
| Tag "mql" adicionada | Adicionar tag "mql" no AC + entrar na automação "Nurturing MQL" |
| Lead movido para stage "Reunião Agendada" | Tag "reuniao_agendada" no AC |
| Lead fechado (venda) | Tag "cliente" no AC + sair de automações de nutrição |
| Lead perdido | Tag "perdido" no AC + entrar na automação de reengajamento |
| UTMs atualizados | Atualizar campos personalizados no AC |

### Do ActiveCampaign para o Empire CRM:

| Evento no AC | Ação no CRM |
|-------------|-------------|
| Contato abre email específico | Registrar como atividade na timeline |
| Contato clica em link de agendamento | Criar reunião no CRM |
| Automação marca contato como "quente" | Adicionar tag "quente_email" no CRM |
| Lead responde email | Criar comunicação no CRM (canal: email) |

---

## 2. Configuração

**Pré-requisitos:**
- Conta ativa no ActiveCampaign
- API Key (gerada em Configurações → Desenvolvedor no AC)
- URL da conta AC: `https://[nome-da-conta].api-us1.com`

**Configuração no Empire CRM:**
```
Configurações → Integrações → ActiveCampaign

┌─────────────────────────────────────────────────────────┐
│  ActiveCampaign                                         │
│  ────────────────────────────────────────────           │
│  URL da API     [https://minha-empresa.api-us1.com    ] │
│  API Key        [xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   ] │
│                                                         │
│  [Testar Conexão]                                       │
│  ✓ Conectado! 1.247 contatos encontrados               │
│                                                         │
│  ─── Mapeamento de Listas ───                           │
│  Leads MQL → Lista [Leads MQL Empire Business      ▾]  │
│  Clientes   → Lista [Clientes CDAV                 ▾]  │
│                                                         │
│  ─── Automações (disparar ao evento) ───               │
│  Lead criado     → [Boas-vindas Nurturing          ▾]  │
│  Tag MQL         → [Sequência MQL Quente           ▾]  │
│  Lead perdido    → [Reengajamento 90 dias          ▾]  │
│                                                         │
│  ─── Sync ───                                           │
│  ○ Sync automático (a cada 10 min)                      │
│  ○ Sync manual                                          │
│                                                         │
│  Último sync: 15/04/2026 às 14:32 — 48 contatos        │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Fluxo: Empire CRM → ActiveCampaign

### 3.1 Criação/Atualização de Contato

```
Evento: Contato criado no Empire CRM
         ↓
Edge Function: sync-to-activecampaign
         ↓
Verificar: contato.activecampaign_contact_id existe?

SE NÃO (contato novo no AC):
  POST https://[conta].api-us1.com/api/3/contacts
  {
    "contact": {
      "email": "joao@email.com",
      "firstName": "João",
      "lastName": "Silva",
      "phone": "+5511999999999",
      "fieldValues": [
        { "field": "utm_source_id", "value": "facebook" },
        { "field": "utm_campaign_id", "value": "cdav-jan-2026" },
        { "field": "pipeline_id", "value": "Pré-Vendas MQL" }
      ]
    }
  }
  → Salvar o ID retornado em contatos.activecampaign_contact_id

SE SIM (atualizar contato existente):
  PUT https://[conta].api-us1.com/api/3/contacts/{ac_contact_id}
  { ... campos atualizados ... }
         ↓
Se configurado: adicionar à lista padrão de leads
  POST /api/3/contactLists
  { "contactList": { "list": LISTA_ID, "contact": AC_CONTACT_ID, "status": 1 } }
```

### 3.2 Sync de Tags

```
Evento: Tag "mql" adicionada ao contato no Empire CRM
         ↓
Edge Function: sync-tags-to-activecampaign
         ↓
POST https://[conta].api-us1.com/api/3/contactTags
{
  "contactTag": {
    "contact": AC_CONTACT_ID,
    "tag": TAG_ID_MQL    ← ID da tag no AC (mapeado na config)
  }
}
         ↓
Se configurado: disparar automação "Sequência MQL Quente"
POST /api/3/contactAutomations
{
  "contactAutomation": {
    "contact": AC_CONTACT_ID,
    "automation": AUTOMACAO_ID
  }
}
```

---

## 4. Fluxo: ActiveCampaign → Empire CRM

O ActiveCampaign envia webhooks para o Empire CRM quando eventos acontecem lá.

### 4.1 Configuração do Webhook no AC

```
No ActiveCampaign:
Configurações → Desenvolvedor → Webhooks → Adicionar

URL: https://[projeto].supabase.co/functions/v1/webhook-activecampaign
Eventos: contact_add, contact_update, contact_tag_added, deal_stage_changed
```

### 4.2 Processamento do Webhook AC

```typescript
// Edge Function: webhook-activecampaign/index.ts

interface ACWebhookPayload {
  type: string          // "contact_add" | "contact_tag_added" | ...
  contact: {
    id: string          // ID no ActiveCampaign
    email: string
    first_name: string
    last_name: string
  }
  tag?: {
    name: string        // "mql", "cliente", "quente_email"
  }
}

async function handleACWebhook(payload: ACWebhookPayload) {
  // 1. Salvar raw
  await supabase.from('webhooks_raw').insert({
    source: 'activecampaign',
    payload: payload
  })
  
  // 2. Encontrar contato no Empire CRM pelo AC ID ou email
  const { data: contato } = await supabase
    .from('contatos')
    .select('id, tags')
    .or(`activecampaign_contact_id.eq.${payload.contact.id},email.eq.${payload.contact.email}`)
    .single()
  
  if (!contato) return  // Contato não existe no Empire CRM
  
  // 3. Processar o evento
  if (payload.type === 'contact_tag_added' && payload.tag) {
    const tagName = payload.tag.name.toLowerCase()
    
    // Adicionar a tag ao contato no Empire CRM
    const currentTags = contato.tags?.split(',').map(t => t.trim()) ?? []
    if (!currentTags.includes(tagName)) {
      await supabase
        .from('contatos')
        .update({ tags: [...currentTags, tagName].join(',') })
        .eq('id', contato.id)
    }
    
    // Registrar na timeline do contato
    await supabase.from('comunicacoes').insert({
      contato_id: contato.id,
      tipo: 'nota',
      canal: 'sistema',
      direction: 'inbound',
      mensagem_body: `Tag "${tagName}" adicionada pelo ActiveCampaign`,
      data_comunicacao: new Date().toISOString(),
      nota_privada: true
    })
  }
}
```

---

## 5. Mapeamento de Campos

Tabela de mapeamento entre campos do Empire CRM e campos do ActiveCampaign:

| Empire CRM (`contatos`) | ActiveCampaign | Tipo de sync |
|------------------------|----------------|-------------|
| `nome` | `firstName + lastName` | Bidirecional |
| `email` | `email` | Bidirecional |
| `telefone` | `phone` | CRM → AC |
| `utm_source` | Campo personalizado "UTM Source" | CRM → AC |
| `utm_campaign` | Campo personalizado "UTM Campaign" | CRM → AC |
| `utm_term` | Campo personalizado "UTM Term" | CRM → AC |
| `tags` | Tags do AC | Bidirecional |
| `pipeline_name` | Campo personalizado "Pipeline" | CRM → AC |
| `stage_name` | Campo personalizado "Stage" | CRM → AC |
| `sdr_name` | Campo personalizado "SDR" | CRM → AC |
| `lead_quality_score` | Campo personalizado "Quality Score" | CRM → AC |

---

## 6. Deduplicação entre sistemas

**Problema:** O mesmo lead pode existir no ActiveCampaign (criado por um formulário do AC) e ser criado novamente no Empire CRM (por um formulário do CRM). Como evitar duplicatas?

**Solução: email como chave de deduplicação**

```
1. Lead preenche formulário do ActiveCampaign → criado no AC com ID: 12345
   ↓
2. Posteriormente, lead preenche formulário do Empire CRM
   ↓
3. Empire CRM verifica: existe contato com esse email?
   → Encontra contato existente
   → NÃO cria duplicata
   → Busca o ID do AC: GET /api/3/contacts?filters[email]=joao@email.com
   → Encontra ID: 12345
   → Atualiza contatos.activecampaign_contact_id = "12345"
   → Sincroniza dados (UTMs, pipeline, etc.) do CRM para o AC
```

---

## 7. Tabela de Configuração no Banco

```sql
CREATE TABLE activecampaign_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) UNIQUE,
  
  api_url         TEXT NOT NULL,    -- "https://empresa.api-us1.com"
  api_key         TEXT NOT NULL,    -- Criptografado em repouso
  
  -- Mapeamento de listas
  lista_leads_id      TEXT,         -- ID da lista de leads no AC
  lista_clientes_id   TEXT,
  
  -- Mapeamento de automações
  automacao_novo_lead_id   TEXT,
  automacao_mql_id         TEXT,
  automacao_perdido_id     TEXT,
  
  -- Mapeamento de campos personalizados
  field_utm_source_id  TEXT,
  field_utm_campaign_id TEXT,
  field_pipeline_id    TEXT,
  field_sdr_id         TEXT,
  
  -- Controle
  sync_ativo      BOOLEAN DEFAULT TRUE,
  ultimo_sync     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Critérios de Aceite

- [ ] Configuração de API key e URL funciona, botão "Testar Conexão" valida
- [ ] Novo contato criado no Empire CRM aparece no ActiveCampaign em < 30 segundos
- [ ] Tag "mql" adicionada no CRM dispara automação no AC
- [ ] Webhook do AC recebido atualiza tags do contato no CRM
- [ ] Deduplicação por email funciona entre os dois sistemas
- [ ] Mapeamento de campos customizados é configurável por workspace
- [ ] Histórico de sincronização visível na interface

---

*Próximo: [09 — Construtor de Formulários](./09-CONSTRUTOR-FORMULARIOS.md)*
