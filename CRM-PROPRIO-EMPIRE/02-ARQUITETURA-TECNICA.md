# 02 — Arquitetura Técnica: Empire CRM

> **O que este documento cobre:** A stack tecnológica completa, como os sistemas se comunicam, diagramas de fluxo de dados, padrões de engenharia obrigatórios, e a infraestrutura de deploy.

---

## 1. Visão Geral da Arquitetura

Antes de entrar nos detalhes, vamos entender a arquitetura em alto nível com uma analogia:

**Pense no Empire CRM como um restaurante:**
- O **banco de dados (Supabase/PostgreSQL)** é a cozinha — onde tudo é preparado e armazenado
- O **frontend (React)** é o salão — onde o cliente (usuário) interage
- As **Edge Functions** são os garçons — fazem a ponte entre a cozinha e o mundo externo
- As **integrações** (WhatsApp, Meta Ads, ActiveCampaign) são os fornecedores — entregam ingredientes (dados) para a cozinha

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUÁRIOS                                │
│    SDR        Closer     Gestor Tráfego      CEO                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│                    FRONTEND (Vercel)                            │
│            React 18 + TypeScript + Vite + Tailwind              │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  CRM     │ │  Inbox   │ │  Forms   │ │   Automações     │  │
│  │  Core    │ │  Unif.   │ │  Builder │ │   & Webhooks     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Supabase Client (WebSockets + REST)
┌──────────────────────────▼──────────────────────────────────────┐
│                    SUPABASE (Backend)                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL (Banco de Dados)                │   │
│  │  contatos │ oportunidades │ comunicacoes │ pipelines    │   │
│  │  formularios │ automacoes │ metas │ webhooks_raw        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Edge Functions (Deno)                      │   │
│  │  /webhook-whatsapp  /webhook-inbound  /api              │   │
│  │  /sync-meta-ads     /send-message     /automations      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐ │
│  │  Auth    │  │ Storage  │  │    Realtime (WebSockets)     │ │
│  │  (JWT)   │  │  (S3)    │  │    (live updates no inbox)   │ │
│  └──────────┘  └──────────┘  └──────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    INTEGRAÇÕES EXTERNAS                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  WhatsApp    │  │  Meta Ads    │  │   ActiveCampaign      │ │
│  │  (UAZAPI +   │  │  API (v21)   │  │   (Sync bidirecional) │ │
│  │   Oficial)   │  │              │  │                       │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Resend     │  │  Calendly    │  │  Webhooks Externos    │ │
│  │   (Email)    │  │  (reuniões)  │  │  (OpenClaw, etc.)     │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológica Completa

### 2.1 Frontend

| Tecnologia | Versão | Por que usamos |
|-----------|--------|---------------|
| **React** | 18.x | Biblioteca de UI mais usada no mundo, excelente ecossistema |
| **TypeScript** | 5.x | JavaScript com tipagem — pega erros antes de rodar o código |
| **Vite** | 5.x | Build tool ultrarrápido (muito mais rápido que Create React App) |
| **Tailwind CSS** | 3.x | Framework CSS baseado em utilitários — fácil de customizar |
| **React Router** | v7 | Roteamento entre páginas |
| **TanStack Query** | v5 | Gerenciamento de estado de servidor (cache, loading, erro) |
| **Supabase JS** | v2 | Cliente oficial do Supabase para o frontend |
| **Sonner** | latest | Toasts (notificações de sucesso/erro na tela) |

**Design System:** DS1 Silver Empire v2.0 (nosso design system proprietário)
- Paleta: empire #0D1829, gold #C9A240, bone #F2EFE8, ink #1A1F2E
- Fontes: Cormorant Garamond (títulos), DM Sans (corpo), IBM Plex Mono (código)
- Componentes: `src/components/ui/` (sem radix-ui — tudo customizado)

### 2.2 Backend

| Tecnologia | Versão | Por que usamos |
|-----------|--------|---------------|
| **Supabase** | Cloud | Plataforma completa: banco, auth, storage, realtime, functions |
| **PostgreSQL** | 15.x | Banco de dados relacional robusto, com suporte a JSONB |
| **Deno** | latest | Runtime para as Edge Functions (TypeScript nativo) |
| **pg_cron** | - | Extensão para agendar tarefas (cron jobs) no próprio banco |
| **pg_net** | - | Extensão para fazer chamadas HTTP de dentro do banco |

### 2.3 Infraestrutura

| Serviço | Uso |
|---------|-----|
| **Vercel** | Deploy do frontend (CDN global, zero-config) |
| **Supabase Cloud** | Backend completo (banco + functions + auth) |
| **Resend** | Envio de emails transacionais (confirmações, notificações) |
| **GitHub** | Controle de versão + CI/CD (deploy automático no push) |

---

## 3. Fontes de Entrada de Dados — Visão Geral

**IMPORTANTE:** O Empire CRM é um sistema **nativo**. Os dados nascem dentro dele, não são importados de nenhum CRM externo. Existem 3 formas de dado entrar no sistema:

```
┌─────────────────────────────────────────────────────────────────┐
│            FONTES DE ENTRADA DE DADOS                           │
├───────────────────────────────────────────────────────────────  │
│                                                                  │
│  1. FORMULÁRIO NATIVO (principal para novos leads)              │
│     Landing page → JS embed → POST /api/v1/forms/{id}/submit    │
│     Cria: contato + oportunidade + UTMs                         │
│                                                                  │
│  2. API DIRETA (para integrações programáticas)                 │
│     Sistema externo → POST /api/v1/contacts ou /opportunities    │
│     Ex: Hotmart, checkout próprio, outro sistema interno        │
│     Cria: contato + oportunidade com dados completos            │
│                                                                  │
│  3. WEBHOOK DE MENSAGEM (para comunicação, não lead)            │
│     WhatsApp/Instagram → webhook → Edge Function                │
│     Vincula: mensagem a contato JÁ EXISTENTE (pelo telefone)    │
│     Se contato não existe: cria contato mínimo (apenas telefone)│
│     NÃO é o caminho principal de criação de leads               │
│                                                                  │
│  4. WEBHOOK DE ENRIQUECIMENTO (complemento de dados)            │
│     Hotmart, Calendly, OpenClaw → webhook de entrada            │
│     Atualiza: campos de contato/oportunidade existentes         │
│     Ex: reunião confirmada, contrato assinado, compra feita     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Fluxo Principal — Criação de Lead via Formulário

Este é o **fluxo principal** de entrada de leads: a pessoa preenche um formulário numa landing page.

```
Passo 1: Pessoa preenche formulário na landing page
         (formulário criado no Empire CRM, embedado via JS ou iframe)
         ↓
Passo 2: JavaScript do formulário captura UTMs da URL automaticamente
         utm_source=facebook, utm_campaign=cdav-jan-2026,
         utm_term=M01_O1_P29_CR-248, fbclid=IwAR...
         ↓
Passo 3: POST /api/v1/forms/{form_id}/submit
         {
           nome: "João Silva",
           email: "joao@email.com",
           telefone: "11999999999",
           utm_source: "facebook",
           utm_campaign: "cdav-jan-2026",
           utm_term: "M01_O1_P29_CR-248",
           faturamento_anual: "500k-1M"  ← campos do formulário
         }
         ↓
Passo 4: Edge Function (form-submit) processa:
         - Valida form_id existe e está ativo (sem auth — endpoint público)
         - Valida campos obrigatórios do formulário
         - Sanitiza inputs (remove XSS, normaliza telefone para E.164)
         ↓
Passo 5: Deduplicação
         SELECT id FROM contatos
         WHERE workspace_id = $1
           AND (LOWER(email) = $2 OR telefone = $3)
           AND deleted_at IS NULL
         LIMIT 1

         → Encontrou: atualiza UTMs (fonte de verdade), cria nova oportunidade
         → Não encontrou: INSERT novo contato
         ↓
Passo 6: INSERT em oportunidades
         {
           workspace_id, contato_id,
           pipeline_id: configurado no formulário,
           pipeline_stage_id: stage inicial do formulário,
           titulo: nome do contato,
           lead_source: "form_web",
           data_lead_recebido: NOW()  ← timestamp registrado aqui, na entrada
         }
         ↓
Passo 7: Triggers de banco disparam automaticamente:
         a) fn_notify_sdr: notificação em tempo real para SDR responsável
         b) fn_check_automations: verifica automações com trigger "formulario.submetido"
         c) fn_sync_activecampaign: se integração AC configurada
         ↓
Passo 8: Frontend atualiza via Supabase Realtime (WebSocket)
         SDR vê o novo lead aparecer no inbox/pipeline em tempo real
         ↓
Passo 9: API responde para o site externo:
         { success: true, contact_id: "uuid", opportunity_id: "uuid" }
         O site pode redirecionar para página de obrigado
```

---

## 5. Fluxo Secundário — Webhook de Mensagem WhatsApp

Este fluxo trata mensagens recebidas, **não criação de leads**. O contato já deve existir (criado pelo formulário). Se não existir, é tratado como inbound orgânico.

```
Passo 1: Lead envia mensagem no WhatsApp: "Oi, vi sobre a consultoria"
         ↓
Passo 2: UAZAPI recebe e envia webhook imediato:
         POST https://[empire-crm-supabase].supabase.co/functions/v1/webhook-whatsapp
         {
           instance: "sdr-principal",
           event: "messages.upsert",
           data: {
             key: { remoteJid: "5511999999999@s.whatsapp.net", id: "BAE5..." },
             message: { conversation: "Oi, vi sobre a consultoria" },
             messageTimestamp: 1714000000,
             pushName: "João Silva",
             fromMe: false
           }
         }
         ↓
Passo 3: Edge Function (webhook-whatsapp) processa:
         a) Valida secret da instância
         b) Salva payload bruto em webhooks_raw (imutável — para auditoria)
         c) Extrai telefone: "5511999999999@s.whatsapp.net" → "5511999999999"
         ↓
Passo 4: Busca contato pelo telefone normalizado
         SELECT id, nome FROM contatos
         WHERE workspace_id = $1 AND telefone = '5511999999999'
         AND deleted_at IS NULL LIMIT 1

         → ENCONTROU (caso comum — lead veio pelo form antes):
           INSERT em comunicacoes vinculando ao contato existente

         → NÃO ENCONTROU (inbound orgânico — nunca preencheu form):
           INSERT em contatos com dados mínimos:
           { nome: "João Silva" (do pushName), telefone: "5511999999999" }
           INSERT em oportunidades no pipeline "Inbound WhatsApp"
           INSERT em comunicacoes vinculando ao novo contato
         ↓
Passo 5: Verifica primeira mensagem inbound deste contato
         Se sim: adiciona tag "conectado" + preenche data_conectado na oportunidade ativa
         ↓
Passo 6: Supabase Realtime notifica todos os SDRs do workspace
         Mensagem aparece no inbox em tempo real (< 3 segundos)
```

---

## 6. Fluxo de Enriquecimento — Webhook de Sistema Externo

Webhooks de entrada de sistemas externos (Calendly, Hotmart, OpenClaw, etc.) **complementam** dados de contatos/oportunidades já existentes.

```
Exemplo: Calendly confirma agendamento de reunião

POST https://[empire-crm-supabase].supabase.co/functions/v1/webhook-inbound
Headers: X-Workspace-Id: ws-uuid, X-Webhook-Secret: abc123

{
  "event": "invitee.created",
  "payload": {
    "email": "joao@email.com",
    "name": "João Silva",
    "event": {
      "start_time": "2026-04-20T14:00:00Z",
      "location": "https://zoom.us/j/123"
    }
  }
}
         ↓
Edge Function (webhook-inbound) processa:
  a) Identifica workspace pelo header
  b) Salva raw em webhooks_raw
  c) Busca contato pelo email
  d) Se encontrado: UPDATE oportunidade ativa →
     { data_reuniao_agendada: "2026-04-20", stage: "Agendado" }
     INSERT em reunioes { data_agendada, link_reuniao }
  e) Se não encontrado: ignora (ou cria contato mínimo — depende da config)
```

---

## 8. Padrões de Engenharia Obrigatórios

Estes padrões são regras que TODO desenvolvedor deve seguir. Não são opcionais.

### 8.1 Raw-First para Webhooks Externos

**Regra:** Todo webhook recebido de sistema externo (WhatsApp, Calendly, Hotmart, etc.) é armazenado imediatamente em `webhooks_raw` antes de qualquer processamento.

**Por quê:** Webhooks são entregues "at least once" — podem chegar duplicados ou fora de ordem. Com o dado bruto salvo, sempre podemos reprocessar ou auditar.

**Não se aplica a:** Formulários e chamadas da API pública (esses dados já chegam estruturados, validados e são armazenados diretamente nas tabelas de negócio).

```typescript
// CORRETO: salva primeiro, processa depois
const { data: rawWebhook } = await supabase
  .from('webhooks_raw')
  .insert({ workspace_id, source: 'whatsapp', payload: rawBody })
  .select()
  .single()

await processWebhook(rawWebhook)  // se falhar, o dado bruto está salvo

// ERRADO: processa diretamente, sem salvar bruto
await processWhatsAppMessage(rawBody)  // se falhar, perdemos a mensagem
```

### 6.2 Idempotência

**Regra:** Processar o mesmo dado duas vezes produz o mesmo resultado. Use UPSERT com chaves únicas.

**Por quê:** Webhooks são entregues "at least once" (pelo menos uma vez). Isso significa que um webhook pode chegar duplicado. Se não formos idempotentes, criamos registros duplicados.

```sql
-- CORRETO: UPSERT com ON CONFLICT
INSERT INTO comunicacoes (external_message_id, workspace_id, ...)
VALUES ('WAE123', 'ws-uuid', ...)
ON CONFLICT (external_message_id) DO UPDATE SET
  mensagem_body = EXCLUDED.mensagem_body,
  updated_at = NOW();

-- ERRADO: INSERT simples que cria duplicata
INSERT INTO comunicacoes (external_message_id, ...)
VALUES ('WAE123', ...)
```

### 6.3 Paginação obrigatória

**Regra:** Toda query que pode retornar mais de 1000 registros DEVE usar paginação com `.range()`. O PostgREST (usado pelo Supabase) ignora `.limit(N)` com N > 1000 e retorna no máximo 1000 sem aviso.

```typescript
// CORRETO: loop de paginação
const PAGE_SIZE = 1000
let all: Row[] = []
let page = 0
while (true) {
  const { data, error } = await supabase
    .from('oportunidades')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('id')
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  
  if (error) throw error
  all = [...all, ...(data ?? [])]
  if ((data?.length ?? 0) < PAGE_SIZE) break
  page++
}

// ERRADO: limit que será silenciosamente ignorado
const { data } = await supabase
  .from('oportunidades')
  .select('*')
  .limit(10000)  // ← retorna 1000, sem erro, sem aviso
```

### 6.4 Timezone

**Regra:**
- Todas as timestamps são armazenadas em **UTC** no banco
- Ao filtrar por data, usar offsets de São Paulo (UTC-3): `'2026-03-01T03:00:00Z'`
- Ao exibir datas para o usuário, converter para `America/Sao_Paulo`
- Colunas de pipeline (data_conectado, data_fechado, etc.) usam tipo `DATE` (sem hora, sem fuso)
- Colunas de evento (data_lead_recebido, mensagem recebida, etc.) usam tipo `TIMESTAMPTZ`

```typescript
// CORRETO: filtro com offset SP
const startUTC = toSPISOStart(startDate)  // '2026-03-01T03:00:00.000Z'
const endUTC = toSPISOEnd(endDate)        // '2026-03-31T02:59:59.999Z'

.gte('data_lead_recebido', startUTC)
.lte('data_lead_recebido', endUTC)

// ERRADO: filtro sem offset
.gte('data_lead_recebido', '2026-03-01')  // Meia-noite UTC = 21h do dia anterior em SP
```

### 6.5 Row Level Security (RLS)

**Regra:** Toda tabela tem RLS ativo. Toda policy filtra por `workspace_id`. O usuário só vê dados do seu workspace.

```sql
-- OBRIGATÓRIO em toda tabela
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON contatos
  FOR ALL
  USING (workspace_id = (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id = (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
```

### 6.6 Webhook como fonte de verdade

**Regra:** Quando um dado chega de um sistema externo (WhatsApp, Meta Ads), ele SEMPRE sobrescreve o dado local. Nunca preserve o dado local na presença de dado externo mais recente.

```sql
-- CORRETO: dado externo sobrescreve
UPDATE contatos SET
  telefone = COALESCE(NULLIF(TRIM(novo_telefone), ''), telefone),
  -- Se o webhook trouxer telefone, usa o do webhook
  -- Se veio vazio/nulo, mantém o que temos
  utm_source = novo_utm_source  -- utm SEMPRE sobrescreve (fonte de verdade)
WHERE id = contato_id;

-- ERRADO: preserva dado local mesmo quando externo é mais recente
UPDATE contatos SET
  utm_source = COALESCE(utm_source, novo_utm_source)
  -- Se já tinha utm_source, nunca atualiza → leads re-atribuídos ficam errados
```

---

## 7. Estrutura de Pastas do Projeto

```
empire-crm/
├── frontend/                          ← App React
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                    ← Design System DS1 Silver Empire
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   └── ...
│   │   │   ├── crm/                   ← Componentes do CRM
│   │   │   │   ├── ContactCard.tsx
│   │   │   │   ├── OpportunityKanban.tsx
│   │   │   │   └── PipelineColumn.tsx
│   │   │   ├── inbox/                 ← Inbox unificado
│   │   │   │   ├── ConversationList.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   └── MessageComposer.tsx
│   │   │   ├── forms/                 ← Form builder
│   │   │   │   ├── FormBuilder.tsx
│   │   │   │   ├── FieldEditor.tsx
│   │   │   │   └── FormPreview.tsx
│   │   │   └── layout/
│   │   │       ├── Sidebar.tsx
│   │   │       └── Header.tsx
│   │   ├── pages/
│   │   │   ├── crm/                   ← Páginas do CRM
│   │   │   │   ├── ContactsPage.tsx
│   │   │   │   ├── OpportunitiesPage.tsx
│   │   │   │   └── PipelinesPage.tsx
│   │   │   ├── inbox/                 ← Inbox
│   │   │   │   └── InboxPage.tsx
│   │   │   ├── forms/                 ← Forms builder
│   │   │   │   └── FormsPage.tsx
│   │   │   ├── automations/           ← Automações
│   │   │   │   └── AutomationsPage.tsx
│   │   │   ├── settings/              ← Configurações
│   │   │   │   ├── WorkspacePage.tsx
│   │   │   │   ├── IntegrationsPage.tsx
│   │   │   │   └── UsersPage.tsx
│   │   │   └── auth/                  ← Autenticação
│   │   │       ├── LoginPage.tsx
│   │   │       └── InvitePage.tsx
│   │   ├── hooks/                     ← React hooks de dados
│   │   │   ├── useContacts.ts
│   │   │   ├── useOpportunities.ts
│   │   │   └── useInbox.ts
│   │   ├── lib/                       ← Utilitários
│   │   │   ├── supabase.ts            ← Cliente Supabase
│   │   │   ├── utils/
│   │   │   │   ├── dates.ts           ← Funções de timezone
│   │   │   │   ├── phone.ts           ← Normalização de telefone
│   │   │   │   └── tags.ts            ← Parsing de tags
│   │   │   └── constants.ts           ← IDs fixos, constantes
│   │   └── types/                     ← TypeScript types
│   │       ├── database.ts            ← Gerado pelo Supabase CLI
│   │       └── app.ts                 ← Types customizados
│   ├── public/
│   │   └── embed.js                   ← Script para embed de formulários
│   ├── package.json
│   └── vite.config.ts
│
├── supabase/                          ← Backend Supabase
│   ├── migrations/                    ← Scripts SQL de migração
│   │   ├── 20260501000000_initial_schema.sql
│   │   ├── 20260501000001_rls_policies.sql
│   │   └── ...
│   ├── functions/                     ← Edge Functions (Deno)
│   │   ├── webhook-whatsapp/
│   │   │   └── index.ts
│   │   ├── webhook-inbound/           ← Webhooks genéricos de entrada
│   │   │   └── index.ts
│   │   ├── api/                       ← API pública REST
│   │   │   └── index.ts
│   │   ├── send-message/              ← Envio de mensagens
│   │   │   └── index.ts
│   │   ├── sync-meta-ads/
│   │   │   └── index.ts
│   │   └── _shared/                   ← Código compartilhado
│   │       ├── auth.ts
│   │       ├── cors.ts
│   │       └── rate-limit.ts
│   └── config.toml
│
└── README.md
```

---

## 8. Banco de Dados — Visão Geral dos Schemas

O banco é dividido em schemas (namespaces) para organização:

```sql
-- Schema público: tabelas de negócio
public.workspaces
public.workspace_members
public.contatos
public.oportunidades
public.pipelines
public.pipeline_stages
public.comunicacoes
public.reunioes
public.vendas_fechamento
public.formularios
public.formulario_campos
public.formulario_submissoes
public.automacoes
public.automacao_steps
public.automacao_execucoes
public.webhooks_raw               ← imutável, raw-first
public.webhooks_outbound          ← webhooks que enviamos
public.webhooks_outbound_logs     ← log de cada tentativa
public.api_keys
public.meta_ads_insights
public.meta_ads_raw_insights      ← imutável, raw-first
public.metas
public.tags                       ← catálogo de tags por workspace
public.custom_fields              ← campos customizados
public.custom_field_values        ← valores dos campos customizados
public.ghl_api_jobs               ← fila de jobs assíncronos
public.notification_queue         ← fila de notificações
public.conversas                  ← agrupamento de mensagens por contato+canal
public.activity_log               ← timeline + audit log unificado
public.tarefas                    ← follow-ups, ligações, emails
public.email_templates            ← templates de email (AC + nativos)
public.processing_queue           ← fila unificada de processamento
public.idempotency_keys           ← chaves de idempotência da API
```

---

## 9. API Pública — Visão Geral

A API pública segue o padrão REST com autenticação via API key no header.

**Base URL:** `https://api.empire-crm.app/v1`

**Autenticação:**
```
Authorization: Bearer emp_live_xxxxxxxxxxxxxxxxxxxxx
```

**Principais endpoints:**
```
GET    /contacts                    ← Lista contatos
POST   /contacts                    ← Cria contato
GET    /contacts/:id                ← Busca contato
PUT    /contacts/:id                ← Atualiza contato
DELETE /contacts/:id                ← Remove contato

GET    /opportunities               ← Lista oportunidades
POST   /opportunities               ← Cria oportunidade
PUT    /opportunities/:id           ← Atualiza oportunidade

POST   /forms/:form_id/submit       ← Submete formulário (cria lead)

GET    /pipelines                   ← Lista pipelines
GET    /tags                        ← Lista tags do workspace

GET    /webhooks                    ← Lista webhooks configurados
POST   /webhooks                    ← Cria webhook
DELETE /webhooks/:id                ← Remove webhook
```

---

## 10. Deploy e CI/CD

**Frontend (Vercel):**
- Push na branch `main` → deploy automático em produção
- Push em outras branches → preview URL automática
- Variáveis de ambiente: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Backend (Supabase):**
- Migrations: `supabase db push` (roda manualmente ou via CI)
- Edge Functions: `supabase functions deploy` (roda manualmente ou via CI)
- Banco de dados: Supabase Cloud (managed PostgreSQL, backup diário automático)

**Variáveis de ambiente críticas:**
```
# Frontend
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=[chave-pública]

# Edge Functions (secrets do Supabase)
WHATSAPP_UAZAPI_TOKEN=...
WHATSAPP_OFFICIAL_TOKEN=...
META_ADS_ACCESS_TOKEN=...
ACTIVECAMPAIGN_API_KEY=...
ACTIVECAMPAIGN_BASE_URL=...
RESEND_API_KEY=...
```

---

## 9. Error Handling & Resilience

### 9.1 Matriz de Falhas

Cada integração e serviço externo pode falhar. A tabela abaixo define o comportamento esperado para cada cenário:

| Serviço/Falha | Sintoma | Comportamento do Sistema | Retry | Notificação |
|---|---|---|---|---|
| **UAZAPI desconecta** | Webhook para de chegar | Fila em `webhooks_raw` com `processado = false`. Edge function de health check detecta desconexão. | Sim, a cada 60s | Push notification + badge no inbox |
| **Mensagem WhatsApp falha ao enviar** | UAZAPI retorna erro 4xx/5xx | Marca `delivery_status = 'failed'` em `comunicacoes`. Mensagem fica com ícone ⚠️ no inbox. | Não para 4xx. Sim (3x, backoff exponencial) para 5xx | Toast: "Falha ao enviar mensagem — tentar novamente?" |
| **Edge function lança exceção** | Sentry captura o erro | Fila em `webhooks_raw` com `processado = false` e `erro` preenchido | pg_cron reprocessa a cada 5 min (máx. 5 tentativas) | Sentry alerta o time de engenharia |
| **Supabase cai** | Frontend não consegue conectar | Frontend exibe banner "Modo offline — Reconectando..." e usa cache local (TanStack Query stale time) | TanStack Query refaz a query automaticamente quando reconecta | Banner vermelho no topo da tela |
| **OpenRouter (SDR IA) retorna erro** | Agente IA não responde | Mensagem fica em `status = 'pending'` na fila de processamento. Se humanizado, debounce delay passa e o lead fica sem resposta. | 3x, backoff exponencial de 5s/30s/2min | SDR humano recebe notificação: "SDR IA não conseguiu responder — verifique" |
| **Rate limit do OpenRouter atingido** | HTTP 429 | Fila de processamento `ai_processing_queue` retém mensagem com `next_retry_at` adiantado. Próxima tentativa quando o rate limit resetar. | Sim, com delay baseado em `Retry-After` header | Log em `system_health` |
| **Resend (email) falha** | Email não é enviado | Marca `delivery_status = 'failed'` em `comunicacoes`. Toast para o SDR: "Falha ao enviar email". | 2x com backoff de 30s | Toast de erro |
| **ActiveCampaign API cai** | Webhook de sync falha | Campo `sync_ativo` permanece TRUE, `ultimo_sync` não atualiza. Próximo sync em 10 min. | Sim, no próximo ciclo de sync (10 min) | Nenhuma — sync é assíncrono |
| **Webhook outbound falha** | Destinatário retorna 5xx | Retry automático com backoff exponencial (5 tentativas: 1min, 5min, 30min, 2h, 12h). Registro em `webhooks_outbound_logs.status = 'failed'`. | 5x, backoff exponencial | Alerta no dashboard de webhooks |

### 9.2 Fila de Processamento (Unified)

```sql
CREATE TABLE processing_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  tipo            TEXT NOT NULL,    -- 'webhook_process' | 'ai_response' | 'email_send' | 'sync_ac' | 'notification'
  referencia_id   UUID,             -- ID do registro relacionado (webhooks_raw, comunicacoes, etc.)
  payload         JSONB,            -- Dados necessários para processar
  status          TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter'
  tentativas      INTEGER DEFAULT 0,
  max_tentativas  INTEGER DEFAULT 5,
  proxima_tentativa TIMESTAMPTZ DEFAULT NOW(),
  erro            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_queue_status ON processing_queue(workspace_id, status, proxima_tentativa);
```

**Processamento:** Um worker (Edge Function `queue-worker` chamada por pg_cron a cada 30 segundos) busca itens com `status = 'pending'` e `proxima_tentativa <= NOW()`, processa em ordem de prioridade, e atualiza o status. Itens que falham mais de `max_tentativas` vezes são marcados como `dead_letter` e exigem intervenção manual.

### 9.3 Estado Offline do Frontend

Quando o frontend perde conexão com o Supabase:

1. **TanStack Query** mantém os dados em cache por 5 minutos (staleTime padrão)
2. **Banner vermelho** aparece no topo: "Conexão perdida — tentando reconectar..."
3. **Ações de escrita** (enviar mensagem, mover deal, criar contato) são enfileiradas localmente e executadas quando a conexão retorna
4. **Supabase Realtime** tenta reconectar automaticamente com backoff exponencial
5. Quando a conexão retorna, **TanStack Query invalida** as queries ativas e atualiza os dados

---

## 10. Data Retention Policy

### 10.1 Tempo de Retenção por Tipo de Dado

| Tipo de Dado | Tabela | Retenção | Ação após Expiração |
|---|---|---|---|
| Dados de negócio (contatos, oportunidades) | `contatos`, `oportunidades` | Indefinido | Soft delete (`deleted_at`) retido por 90 dias → anonimização permanente |
| Mensagens de comunicação | `comunicacoes` | Indefinido | Mensagens de contatos anonimizados são substituídas por `[mensagem removida]` |
| Webhooks brutos (auditoria) | `webhooks_raw` | 365 dias | Deletados automaticamente (pg_cron). Os dados já foram processados e estão nas tabelas de negócio |
| Logs de webhooks outbound | `webhooks_outbound_logs` | 90 dias | Deletados automaticamente |
| Activity log | `activity_log` | Indefinido | Essencial para audit e timeline — nunca deletar |
| Logs de fila de processamento | `processing_queue` com status `completed` | 30 dias | Deletados automaticamente |
| Dados de formulário submetido | `formulario_submissoes` | Indefinido | Dados de consentimento LGPD — reter indefinidamente |
| Meta Ads Insights | `meta_ads_insights` | 24 meses | Agredados mensalmente após 24 meses, detalhes diários deletados |
| Gravações de reunião | Cloudflare R2 | 365 dias | Deletados automaticamente. Link em `reunioes.link_gravacao` é limpo |
| Logs de erro (Sentry) | — | 90 dias | Configurado no Sentry |

### 10.2 Anonimização (Direito ao Esquecimento — LGPD)

Quando um contato solicita exclusão de dados (ver [`19-COMPLEMENTO-PRD.md`](./19-COMPLEMENTO-PRD.md) seção C1):

```sql
CREATE OR REPLACE FUNCTION anonimizar_contato(p_contato_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE contatos SET
    nome = 'DADOS REMOVIDOS',
    email = NULL,
    telefone = NULL,
    telefone_raw = NULL,
    tags = NULL,
    utm_source = NULL,
    utm_campaign = NULL,
    utm_medium = NULL,
    fbclid = NULL,
    gclid = NULL,
    lgpd_anonimizado_em = NOW()
  WHERE id = p_contato_id;

  UPDATE comunicacoes SET
    mensagem_body = '[mensagem removida a pedido do titular]',
    mensagem_subject = NULL,
    attachments = NULL
  WHERE contato_id = p_contato_id;

  UPDATE contato_atribuicoes SET
    ip_address = NULL,
    user_agent = NULL
  WHERE contato_id = p_contato_id;
END;
$$ LANGUAGE plpgsql;
```

**Importante:** Oportunidades associadas ao contato **não são deletadas** — apenas desvinculadas. Os dados financeiros e de negócio são da empresa, não do titular.

### 10.3 Soft Delete

| Tabela | Tem `deleted_at`? | Retenção pós-delete | Comportamento |
|---|---|---|---|
| `contatos` | Sim | 90 dias | Query com `WHERE deleted_at IS NULL`. Após 90 dias, cron executa `anonimizar_contato` |
| `oportunidades` | Sim | 90 dias | Similar a contatos. Perdidos ficam para relatórios históricos com `status = 'lost'`, não são deletados |
| `formularios` | Sim | 90 dias | Formulário arquivado (`status = 'archived'`) pode ser restaurado em 90 dias |
| `tarefas` | Não | — | Tarefas canceladas (`status = 'cancelada'`) são retidas para relatórios |
| `conversas` | Não | — | Conversas resolvidas ficam retidas para auditoria |

---

*Próximo: [03 — Modelo de Dados](./03-MODELO-DADOS.md)*
