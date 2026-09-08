# 06 — Módulo: Comunicações (Inbox Unificado)

> **O que este documento cobre:** O inbox unificado do Empire CRM — todos os canais de comunicação em uma tela só. WhatsApp, SMS, Email, Ligações, Instagram DM, Facebook Messenger. Templates, histórico, métricas de resposta.

---

## Como as mensagens chegam ao Inbox?

Antes de falar sobre a interface, é importante entender como os dados chegam ao sistema — porque a lógica é diferente da criação de leads:

**Leads chegam via formulário ou API** (veja documento 09 e 02). Quando alguém preenche um formulário do Empire CRM, o sistema cria automaticamente o contato e a oportunidade. O inbox NÃO cria leads — ele apenas exibe as conversas de leads já existentes.

**Mensagens chegam via webhook do WhatsApp.** Quando um lead responde no WhatsApp, a UAZAPI (ou a API Oficial da Meta) envia um webhook para o Empire CRM. O sistema:
1. Identifica o contato pelo telefone
2. Vincula a mensagem ao contato existente
3. A mensagem aparece instantaneamente no inbox (via Supabase Realtime)

**E se o número não for reconhecido?** Se chegar uma mensagem de um telefone que não está cadastrado, o sistema cria um contato "Inbound WhatsApp" automaticamente (com nome temporário "Lead WhatsApp + número") e abre uma conversa para que o SDR possa atendê-lo.

---

## O que é o Inbox Unificado?

Hoje, um SDR precisa alternar entre vários aplicativos para atender leads: WhatsApp Web, Gmail, RD Station, GHL, telefone. Isso fragmenta a atenção e faz o SDR perder contexto.

O **Inbox Unificado** resolve isso: é uma única tela dentro do Empire CRM onde todas as conversas de todos os canais aparecem juntas, como se fossem uma única "caixa de mensagens".

**Analogia:** Pense no iPhone. Quando você recebe um iMessage, um SMS e um WhatsApp, tudo aparece em aplicativos separados. O Inbox Unificado é como se tudo aparecesse em uma só tela, com o histórico completo de cada pessoa.

---

## 1. Estrutura do Inbox

```
┌─────────────────────────────────────────────────────────────────────┐
│  INBOX                          [WhatsApp ▾] [Todos os SDRs ▾]    │
├──────────────────────────┬──────────────────────────────────────────┤
│  CONVERSAS               │  CONVERSA: João Silva                   │
│  ─────────────────        │  ────────────────────────────────────   │
│  🔴 João Silva           │  WhatsApp · 5511999999999               │
│  "Oi, tenho interes..."  │  SDR: Karina · Oportunidade: CDAV ✓    │
│  WhatsApp · 2 min        │                                          │
│                           │  ┌─────────────────────────────────┐   │
│  🟡 Maria Costa          │  │  Hoje, 14:32                    │   │
│  "Boa tarde! Já rece..."  │  │                                 │   │
│  Email · 10 min          │  │  João: "Oi, tenho interesse na  │   │
│                           │  │  consultoria de vocês"          │   │
│  João Ferreira           │  └─────────────────────────────────┘   │
│  "Obrigado pela info."   │                                          │
│  WhatsApp · 1h           │  ┌─────────────────────────────────┐   │
│                           │  │  Karina: "Oi João! Que ótimo!  │   │
│  ─── RESOLVIDOS ───       │  │  Me conta um pouco mais sobre  │   │
│  Ana Santos              │  │  o que você precisa"            │   │
│  "Confirmado, vejo..."   │  └─────────────────────────────────┘   │
│                           │                                          │
│  [+ Nova Conversa]        │  [💬 Escrever mensagem...    ] [📎] [➤]│
└──────────────────────────┴──────────────────────────────────────────┘
```

---

## 2. Requisitos Funcionais

### 2.1 Lista de Conversas

**RF-COM-001:** A lista de conversas exibe todas as conversas ativas, ordenadas por data da última mensagem (mais recente primeiro).

**RF-COM-002:** Cada item na lista mostra:
- Nome do contato
- Preview da última mensagem (primeiros 50 caracteres)
- Canal (ícone: WhatsApp 🟢, Email 📧, SMS 📱, Instagram 📸)
- Tempo desde a última mensagem (2 min, 10 min, 1h, ontem...)
- Indicador de não lido (círculo vermelho com contador)
- Indicador de urgência: 🔴 > 24h sem resposta do SDR | 🟡 12-24h

**RF-COM-003:** Filtros disponíveis:
- Por canal (WhatsApp, SMS, Email, Todos)
- Por SDR responsável
- Por status (Ativos, Aguardando resposta, Resolvidos)
- Por tags do contato (ex: "só MQLs")
- Busca por nome/telefone/email do contato

**RF-COM-004:** O SDR pode marcar uma conversa como "resolvida". Conversas resolvidas ficam em seção separada.

### 2.2 Visualização da Conversa

**RF-COM-005:** Ao selecionar uma conversa, o painel direito exibe:
- Cabeçalho: nome do contato, canal, SDR responsável, link para a oportunidade
- Histórico completo de mensagens (scroll infinito para cima)
- Mensagens recentes abaixo, mais antigas acima (padrão de chat)
- Mensagens do lead: lado esquerdo
- Mensagens do SDR: lado direito
- Data/hora de cada mensagem
- Status de entrega (WhatsApp): enviado ✓, entregue ✓✓, lido ✓✓ (azul)

**RF-COM-006:** O histórico inclui mensagens de TODOS os canais do contato, não só o canal atual. Ex: se João mandou WhatsApp e depois mandou email, tudo aparece na mesma timeline.

**RF-COM-007:** O histórico inclui eventos do CRM intercalados com as mensagens:
- "Lead movido para stage Qualificado por Karina — 15/04 10h"
- "Tag 'mql' adicionada — 15/04 10h"
- "Reunião agendada para 20/04 às 14h — 15/04 11h"

### 2.3 Envio de Mensagens

**RF-COM-008:** O campo de composição suporta:
- Texto simples
- Emoji picker
- Anexo de arquivos (imagens, PDF, vídeos — até 16MB)
- Gravação de áudio
- Templates de mensagem (atalho: `/`)

**RF-COM-009:** O SDR pode selecionar qual canal enviar a mensagem:
- Se o lead tem WhatsApp: opção padrão é WhatsApp
- Se o lead tem email: opção email disponível
- Se o lead tem SMS: opção SMS disponível

**RF-COM-010:** Ao pressionar Enter ou clicar em Enviar:
1. Mensagem é enviada via canal selecionado (UAZAPI ou API Oficial)
2. Inserida em `comunicacoes` com `direction: 'outbound'`
3. Status inicial: "sent"
4. Status atualiza para "delivered" e "read" conforme chegam confirmações

### 2.4 Templates de Mensagem

**RF-COM-011:** O SDR pode criar templates de mensagem pré-definidos.

**Tipos de template:**
- **Rápido:** texto simples com variáveis — `Oi {{nome}}, vi que você se inscreveu...`
- **Aprovado Meta (HSM):** para iniciar conversa via WhatsApp Oficial (requer aprovação prévia da Meta)

**RF-COM-012:** Para chamar um template, o SDR digita `/` e vê a lista de templates disponíveis. Ao selecionar, o texto é inserido no campo de composição com as variáveis já preenchidas.

**Variáveis disponíveis:**
```
{{nome}}           → Nome do contato
{{email}}          → Email do contato  
{{telefone}}       → Telefone do contato
{{sdr_nome}}       → Nome do SDR logado
{{data_hoje}}      → Data atual (15/04/2026)
{{link_agenda}}    → Link do Calendly configurado
{{workspace_nome}} → Nome do workspace
```

### 2.5 Notas Internas

**RF-COM-013:** O SDR pode adicionar notas internas ao contato (visíveis apenas para a equipe, não enviadas ao lead).

**Como identificar visualmente:**
- Fundo amarelo pálido na timeline
- Ícone 🔒 "Nota interna"
- Não tem status de entrega (não é mensagem)

### 2.6 Atribuição de Conversa

**RF-COM-014:** Qualquer membro com permissão pode transferir uma conversa para outro SDR:
- Clica no avatar do SDR no cabeçalho
- Seleciona novo SDR
- O novo SDR recebe notificação
- O log registra: "Conversa transferida de Karina para Rafael — 15/04 10h"

### 2.7 Atendimento Simultâneo

**RF-COM-015:** Múltiplos SDRs podem estar ativos ao mesmo tempo no inbox. O sistema garante que:
- Cada conversa só aparece como "aberta" por um SDR por vez
- Se outro SDR estiver visualizando a mesma conversa, aparece indicador "Rafael está vendo"
- O envio de mensagem não conflita (ambos podem enviar, mas fica registrado quem enviou)

---

## 3.5. Busca Global

**RF-COM-025:** O inbox possui busca global no campo de busca do cabeçalho da lista de conversas. A busca é server-side usando PostgreSQL full-text search (`tsvector` + `tsquery` em `simple` config) e cobre:
- Nome do contato
- Telefone do contato
- Email do contato
- Conteúdo das mensagens (últimas 50 por conversa)
- Nome da oportunidade/título

**Implementação:**
```sql
-- Índice full-text em contatos
CREATE INDEX idx_contatos_fulltext ON contatos 
  USING gin(to_tsvector('simple', COALESCE(nome, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(telefone, '')));

-- Índice full-text em comunicacoes
CREATE INDEX idx_comunicacoes_fulltext ON comunicacoes 
  USING gin(to_tsvector('simple', COALESCE(mensagem_body, '')));
```

Endpoint: `GET /api/v1/search?q=joão&types=contacts,conversations`

---

## 4. Modelo de Conversas

As mensagens na tabela `comunicacoes` pertencem a **conversas** (tabela `conversas`). Cada conversa agrupa mensagens de um mesmo contato em um mesmo canal.

**Por que uma tabela separada?** Sem `conversas`, o inbox precisaria agrupar mensagens em tempo real por contato+canal, recalcular "última mensagem", "não lidas" e "janela de 24h" a cada query — o que é lento e inconsistente com milhares de conversas.

**Fluxo de criação de conversa:**
1. Mensagem inbound chega (WhatsApp, email, etc.)
2. Edge function busca `conversas` aberta para este contato+canal:
   - **Encontrou:** vincula a mensagem à conversa existente, atualiza `ultima_mensagem_em`, `nao_lidas++`
   - **Não encontrou:** cria nova conversa com `canal`, `contato_id`, `status = 'aberta'`
3. Supabase Realtime notifica o frontend
4. Inbox lista conversas ordenadas por `ultima_mensagem_em DESC`

**Janela de 24h (WhatsApp Meta Cloud API):**
- Quando uma mensagem inbound chega via WhatsApp Oficial, `janela_24h_expira_em` é calculada como `ultima_mensagem_inbound_em + 24h`
- Na UI, o campo de texto exibe aviso quando fora da janela e só permite templates HSM
- Para UAZAPI (não-oficial), a janela de 24h **não se aplica** — mensagens livres podem ser enviadas a qualquer momento

**Transferência de conversa:**
- SDR pode transferir a conversa para outro membro
- Registro em `activity_log` com `acao = 'conversa_transferida'`
- O novo SDR recebe notificação push

**Conversa resolvida:**
- SDR marca conversa como "Resolvida"
- Se o lead enviar uma nova mensagem, a conversa é reaberta automaticamente (ou uma nova é criada, dependendo da configuração do workspace)

---

## 5. Canais Suportados

### Canal 1: WhatsApp (UAZAPI)

**Como funciona:** UAZAPI cria uma instância do WhatsApp Web em um servidor. As mensagens chegam via webhook da UAZAPI para o Empire CRM.

**Características:**
- Sem custo por mensagem (diferente da API Oficial)
- Suporta textos, áudios, imagens, vídeos, documentos, figurinhas, enquetes
- Suporta grupos (opcional)
- Pode desconectar (QR Code expira) — sistema emite alerta
- Não tem aprovação de templates (qualquer mensagem pode ser enviada)

**Limitação:** A Meta pode banir o número se detectar uso da API não-oficial. Risco real, mas gerenciável.

### Canal 2: WhatsApp (API Oficial Meta)

**Como funciona:** API oficial fornecida pela Meta. Requer aprovação de WABA (WhatsApp Business Account).

**Características:**
- Custo por conversa (janelas de 24h)
- Para iniciar conversa (outbound), precisa de template aprovado pela Meta (HSM)
- Para responder dentro de 24h da última mensagem do lead: qualquer mensagem
- Status de entrega confiável (sent, delivered, read)
- Suporta botões, listas interativas, quick replies

**Quando usar qual:**
- UAZAPI: para conversas ativas e rápidas com leads quentes
- API Oficial: para campanhas outbound em larga escala, automações

### Canal 3: SMS

**Provedor sugerido:** Twilio ou Sinch (APIs REST simples)

**Quando usar:** Leads sem WhatsApp, confirmações de reunião, lembretes

### Canal 4: Email

**Provedores:** Resend (envio transacional direto) + ActiveCampaign (campanhas e automações)

O email opera em **dois modos** no Empire CRM:

#### 4A. Email Transacional (Resend) — Resposta direta no inbox

Usado quando o SDR responde um lead pelo inbox, envia confirmação de reunião, ou qualquer email pontual 1:1.

**Características:**
- Enviado via Resend (`POST /v1/emails`)
- Reply-to configurado para o endereço do workspace (ex: `karina@empire.com.br`)
- Thread de email por conversa (reply-to funcional, `In-Reply-To` e `References` headers)
- Suporte a HTML e texto simples
- Tracking de abertura e clique (opcional, pixel transparente + redirect de links)
- Anexos até 16MB (armazenados no Supabase Storage)

**Inbound (receber email):**
- Configurar MX record apontando para a edge function de inbound do Resend
- Resend parseia o email recebido e envia webhook para `POST /functions/v1/webhook-email`
- Edge function normaliza: remetente → contato, assunto → campo `mensagem_subject`, corpo HTML/texto → `mensagem_body`
- Anexos são baixados para Supabase Storage e referenciados em `attachments`
- Headers `In-Reply-To` e `References` são usados para agrupar emails na mesma conversa

**Modelo de dados:**
```sql
-- Em comunicacoes, quando canal = 'email':
-- tipo = 'mensagem'
-- canal = 'email'
-- mensagem_subject = assunto do email
-- mensagem_body = corpo HTML (com fallback para texto)
-- attachments = [{ url: 'https://...', type: 'application/pdf', name: 'contrato.pdf', size: 245000 }]
-- external_message_id = ID do email no Resend (para deduplicação e rastreamento de status)
-- delivery_status = 'sent' | 'delivered' | 'bounced' | 'complained'
```

#### 4B. Email Marketing (ActiveCampaign) — Campanhas e automações

Usado para campanhas de nutrição, sequências de follow-up em massa e email marketing. Ver documento completo: [`08-INTEGRACAO-ACTIVECAMPAIGN.md`](./08-INTEGRACAO-ACTIVECAMPAIGN.md).

**Integração com o inbox:**
- Quando o ActiveCampaign dispara um email para um contato, um registro `comunicacoes` é criado com `canal = 'email'`, `direction = 'outbound'`, `tipo = 'campanha'`
- Quando o contato abre ou clica no email do AC, um registro `activity_log` é criado (`acao = 'email_aberto'` ou `acao = 'email_clicado'`)
- O SDR vê no inbox: "Email de nutrição enviado via ActiveCampaign — Aberto em 15/04 às 14h32"
- O SDR não edita o conteúdo do email do AC pelo CRM — isso é feito na interface do AC

**Envio direto pelo CRM (via ActiveCampaign):**

Além das campanhas automáticas, o SDR pode usar o ActiveCampaign para enviar emails 1:1 diretamente do inbox, aproveitando as templates e automações já configuradas no AC:

**RF-COM-020:** Quando o SDR seleciona "Email" como canal no inbox, o sistema exibe duas opções:
1. **Email direto** (via Resend) — texto livre, sem automação
2. **Email via AC** — usa template aprovado do ActiveCampaign com variáveis preenchidas

**RF-COM-021:** Ao selecionar "Email via AC", o SDR escolhe um template da lista de templates sincronizados e as variáveis `{{nome}}`, `{{sdr_nome}}`, `{{link_agenda}}` são preenchidas automaticamente.

**RF-COM-022:** O email enviado via AC aparece no inbox como qualquer outra mensagem, com o status de entrega atualizado via webhook do AC.

**Configuração no banco:**
```sql
-- Templates de email sincronizados do ActiveCampaign
CREATE TABLE email_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  
  -- Referência ao template no AC
  ac_template_id    TEXT,              -- ID do template no ActiveCampaign (nullable = template nativo)
  
  nome              TEXT NOT NULL,      -- "Follow-up MQL"
  assunto           TEXT NOT NULL,      -- "{{nome}}, vamos agendar uma call?"
  corpo_html        TEXT,               -- HTML do template (se nativo, sem AC)
  corpo_texto       TEXT,               -- Versão texto puro
  
  -- Variáveis disponíveis
  variaveis         JSONB,             -- ["nome", "sdr_nome", "link_agenda"]
  
  -- Tipo
  tipo              TEXT DEFAULT 'transacional',  -- 'transacional' | 'campanha' | 'hsm_email'
  
  canal             TEXT DEFAULT 'email',  -- Para futuro: WhatsApp HSM usa a mesma tabela
  
  ativo             BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tracking de Email

**RF-COM-023:** Email tracking é opcional por workspace e pode ser desabilitado por contato (LGPD):

- **Abertura:** pixel transparente 1x1 embutido no HTML. Quando o servidor do Resend registra o pixel, atualiza `delivery_status = 'read'` e `read_at` em `comunicacoes`.
- **Clique:** links são wrapped em um redirect do Empire (ex: `https://app.empirecrm.com/click?t=abc123&url=https://...`). Ao clicar, o redirect registra o clique e envia o lead ao destino original.
- **Bounce/complaint:** webhook do Resend atualiza `delivery_status = 'bounced'` ou `'complained'` e marca o email como inválido no contato.

**RF-COM-024:** O contato pode ter um flag `email_tracking_optout BOOLEAN DEFAULT FALSE`. Quando `TRUE`, o pixel e o redirect de clique não são adicionados aos emails enviados para esse contato.

### Canal 5: Instagram DM

**Via Meta Graph API** — recebe mensagens do Instagram Direct. Resposta também via API.

### Canal 6: Facebook Messenger

**Via Meta Graph API** — recebe e responde mensagens do Facebook Messenger.

---

## 4. Métricas Operacionais do Inbox

O módulo de comunicações registra os seguintes dados no banco para uso operacional e futuras análises:

### Tempo de Primeira Resposta (TFR)
```
Fórmula: data da primeira mensagem outbound - data da primeira mensagem inbound
Filtro: apenas mensagens humanas (excluir IA), excluir gaps > 24h
```

### % de Leads Sem Resposta
```
Fórmula: leads com ao menos 1 mensagem inbound e ZERO mensagens outbound / total leads
```

### Mensagens por SDR
```
Contagem: mensagens outbound (WhatsApp + SMS) enviadas por cada SDR
Filtro: direction='outbound', ghl_source NOT IN ('bot', 'ai')
```

---

## 5. Realtime (Atualizações ao Vivo)

**RF-COM-016:** Quando uma nova mensagem chega, o inbox atualiza em tempo real (sem o SDR precisar dar F5).

**Como funciona:**
1. UAZAPI → webhook → Edge Function → INSERT em `comunicacoes`
2. Supabase Realtime detecta o INSERT via Change Data Capture (CDC)
3. WebSocket notifica todos os clientes conectados do mesmo workspace
4. React re-renderiza a lista de conversas e a conversa aberta

**RF-COM-017:** Notificação sonora + visual quando nova mensagem chega para o SDR logado.

**RF-COM-018:** Badge de não-lidos no ícone do Inbox na sidebar (ex: "Inbox (5)").

---

## 6. Integração com Oportunidades

**RF-COM-019:** Cada conversa no inbox é associada a um contato, e cada contato tem oportunidades. O SDR pode, dentro do inbox:
- Ver em qual pipeline/stage o lead está (card no cabeçalho)
- Mover o lead de stage diretamente (sem sair do inbox)
- Registrar tentativa de contato (+ clica)
- Adicionar/remover tags
- Agendar reunião

---

## 7. Critérios de Aceite

- [ ] Nova mensagem WhatsApp aparece no inbox em < 3 segundos após ser recebida
- [ ] Histórico de mensagens carrega do mais recente para o mais antigo
- [ ] Envio de mensagem funciona para WhatsApp, Email e SMS
- [ ] Templates com variáveis preenchem corretamente ({{nome}} → "João")
- [ ] Transferência de conversa notifica o novo SDR
- [ ] Notas internas são visualmente distintas de mensagens enviadas ao lead
- [ ] Busca por nome/telefone encontra conversas corretamente
- [ ] Filtro "aguardando resposta" mostra só leads onde SDR ainda não respondeu
- [ ] Métricas de tempo de resposta calculadas corretamente (excluindo IA e gaps > 24h)

---

*Próximo: [07 — Integração WhatsApp](./07-INTEGRACAO-WHATSAPP.md)*
