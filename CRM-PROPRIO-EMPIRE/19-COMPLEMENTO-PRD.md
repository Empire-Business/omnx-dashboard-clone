# Empire CRM — Complemento PRD: Módulos e Funcionalidades Adicionais

> **Versão:** 1.0  
> **Data:** Abril/2026  
> **Status:** Em elaboração  
> **Propósito:** Este documento cobre os gaps identificados após revisão dos 17 documentos originais do PRD, comparando com as melhores práticas de CRMs modernos (HubSpot, Salesforce, Close.com, Pipedrive, Attio, Chatwoot). Leia os documentos 01–18 antes deste.

---

## Índice

- [Seção A — Módulos Novos](#seção-a--módulos-novos)
  - [A1 — Módulo: Tarefas & Atividades](#a1--módulo-tarefas--atividades)
  - [A2 — Módulo: Agenda & Scheduling](#a2--módulo-agenda--scheduling)
  - [A3 — Módulo: Notificações & SLA de Resposta](#a3--módulo-notificações--sla-de-resposta)
  - [A4 — Módulo: IA Copilot & Automação Inteligente](#a4--módulo-ia-copilot--automação-inteligente)
  - [A6 — Módulo: Mobile](#a6--módulo-mobile)
- [Seção B — Adições a Módulos Existentes](#seção-b--adições-a-módulos-existentes)
  - [B1 — Auto-routing de Leads](#b1--auto-routing-de-leads)
  - [B2 — Handoff SDR → Closer](#b2--handoff-sdr--closer)
  - [B3 — Detecção de Deals Estagnados](#b3--detecção-de-deals-estagnados)
  - [B4 — Janela de 24h no WhatsApp](#b4--janela-de-24h-no-whatsapp)
  - [B5 — Forecast de Vendas](#b5--forecast-de-vendas)
  - [B6 — Win/Loss Analysis](#b6--winloss-analysis)
  - [B7 — Tempo Médio por Stage](#b7--tempo-médio-por-stage)
  - [B8 — Notas Colaborativas & @mentions](#b8--notas-colaborativas--mentions)
  - [B9 — 2FA / MFA](#b9--2fa--mfa)
- [Seção C — Infraestrutura & DevOps](#seção-c--infraestrutura--devops)
  - [C1 — LGPD / Compliance](#c1--lgpd--compliance)
  - [C2 — Observabilidade (Monitoramento)](#c2--observabilidade-monitoramento)
  - [C3 — Ambientes (Staging vs Produção)](#c3--ambientes-staging-vs-produção)
  - [C4 — Estratégia de Testes](#c4--estratégia-de-testes)
  - [C5 — Billing / Stripe](#c5--billing--stripe)

---

## SEÇÃO A — MÓDULOS NOVOS

---

## A1 — Módulo: Tarefas & Atividades

### O problema que resolve

Imagina que a Karina (SDR) falou com um lead hoje e prometeu ligar amanhã às 14h. Hoje, sem esse módulo, ela precisa anotar isso num post-it ou agenda pessoal — totalmente fora do sistema. Se ela sair de férias ou for substituída, o compromisso se perde. Esse módulo coloca o follow-up dentro do CRM, ligado ao lead específico.

### O que é

Um sistema de **gestão de tarefas vinculadas a contatos e oportunidades**. Cada tarefa é uma ação futura que alguém do time precisa executar em relação a um lead específico.

### Tipos de tarefa

| Tipo | Ícone | Descrição |
|------|-------|-----------|
| Ligar | 📞 | Ligação telefônica ou VoIP |
| Enviar mensagem | 💬 | WhatsApp ou SMS |
| Enviar email | ✉️ | Email de follow-up |
| Reunião | 📅 | Agendar ou confirmar reunião |
| Nota interna | 📝 | Lembrete ou observação |
| Tarefa livre | ✅ | Ação genérica configurável |

### Campos de uma tarefa

```
id                UUID, PK
workspace_id      UUID, FK workspaces
contato_id        UUID, FK contatos (nullable)
oportunidade_id   UUID, FK oportunidades (nullable)
criado_por        UUID, FK workspace_members
atribuido_a       UUID, FK workspace_members
tipo              ENUM (ligar, mensagem, email, reuniao, nota, livre)
titulo            TEXT NOT NULL
descricao         TEXT
prazo             TIMESTAMPTZ — data/hora limite
lembrete_em       TIMESTAMPTZ — quando notificar antes do prazo
status            ENUM (pendente, em_progresso, concluida, cancelada)
concluida_em      TIMESTAMPTZ
concluida_por     UUID, FK workspace_members
prioridade        ENUM (baixa, normal, alta, urgente)
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

### Interface

**Activity Feed do Lead (Lead Card):**
- Coluna lateral ou aba "Atividades" no card do contato/oportunidade
- Mostra timeline misturada: mensagens recebidas, tarefas criadas, notas, mudanças de stage, reuniões
- Filtro por tipo (tarefas | mensagens | todos)
- Botão "+ Nova Tarefa" sempre visível

**Tela central de tarefas (página "Atividades"):**
- Visão por dia — "Hoje (3)", "Amanhã (1)", "Atrasadas (2)"
- Visão por SDR — cada membro tem sua fila de tarefas
- Filtro por tipo, prioridade, status
- Clique na tarefa → abre lead card contextualmente

**Criação rápida:**
- Ao marcar "tentativa de contato" no pipeline → sistema auto-cria tarefa "Ligar" para amanhã
- Ao mover deal para stage "Qualificado" → pop-up sugere criar tarefa de agendamento de reunião

### Automações integradas

Quando o workflow builder (Fase 3) criar uma tarefa via ação "Criar tarefa", ela aparece aqui vinculada ao lead.

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| CRUD de tarefas vinculadas a lead/deal | 1 | Alta |
| Activity feed na timeline do lead | 1 | Alta |
| Página central de atividades (hoje/amanhã/atrasadas) | 1 | Alta |
| Visão por SDR (fila de tarefas do membro) | 1 | Alta |
| Auto-criação de tarefa ao registrar tentativa | 2 | Média |
| Sugestão de tarefa ao mudar de stage | 2 | Média |
| Lembretes por notificação push/email | 2 | Média |
| Filtros por tipo/prioridade/status | 1 | Alta |
| Ação "Criar tarefa" no workflow builder | 3 | Média |

---

## A2 — Módulo: Agenda & Scheduling

### O problema que resolve

Hoje os closers enviam manualmente um link do Calendly para o lead agendar a reunião. O Calendly é um sistema separado — o agendamento não aparece automaticamente no CRM, o lead precisa sair do WhatsApp para ir ao Calendly, e não há como controlar a disponibilidade dentro do Empire. Este módulo é o **Calendly nativo do Empire CRM**.

### O que é

Um sistema de agendamento que permite ao SDR/Closer:
1. Configurar sua disponibilidade semanal
2. Gerar um link de agendamento público (`app.empirecrm.com/agenda/rafael`)
3. O lead acessa, escolhe data/hora disponível e confirma
4. A reunião aparece automaticamente no CRM vinculada ao lead

### Componentes

#### 1. Configuração de disponibilidade

O membro configura:
- Dias da semana disponíveis (ex: seg–sex)
- Horário de início e fim (ex: 09h–18h)
- Duração padrão de cada slot (ex: 30min, 45min, 60min)
- Buffer entre reuniões (ex: 15 min)
- Fuso horário (padrão: America/Sao_Paulo)
- Máximo de agendamentos por dia
- Datas bloqueadas (feriados, férias)

#### 2. Página de agendamento pública

URL: `https://app.empirecrm.com/book/{workspace_slug}/{member_slug}`

- Exibe calendário com slots disponíveis
- Lead escolhe data → escolhe horário → preenche nome + email + telefone (pré-preenchido se link vier com UTM de contato)
- Confirmação com resumo da reunião
- Email de confirmação automático para o lead (com link para cancelar/reagendar)
- Adição ao Google Calendar do lead (arquivo .ics no email)

#### 3. Integração Google Calendar (Fase 2)

- OAuth2 com Google Calendar
- Sincronização bidirecional: bloqueios do Google Calendar impedem agendamentos no Empire
- Reuniões agendadas no Empire criam evento no Google Calendar do membro
- Cancelamentos sincronizam nos dois sentidos

#### 4. Vínculo automático ao Lead

Quando lead agenda:
1. Sistema busca contato por email/telefone
2. Se encontrar → vincula à oportunidade ativa
3. Se não encontrar → cria contato mínimo
4. Cria registro em `reunioes` com `status = agendada`
5. Notifica o membro via inbox ou push

#### Banco de dados

```sql
-- Disponibilidade do membro
CREATE TABLE member_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  member_id       UUID NOT NULL REFERENCES workspace_members(id),
  dia_semana      SMALLINT NOT NULL,  -- 0=Dom, 1=Seg, ..., 6=Sab
  hora_inicio     TIME NOT NULL,
  hora_fim        TIME NOT NULL,
  ativo           BOOLEAN DEFAULT true,
  UNIQUE (workspace_id, member_id, dia_semana)
);

-- Bloqueios pontuais (feriado, reunião interna)
CREATE TABLE member_availability_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  member_id       UUID NOT NULL REFERENCES workspace_members(id),
  inicio          TIMESTAMPTZ NOT NULL,
  fim             TIMESTAMPTZ NOT NULL,
  motivo          TEXT
);

-- Link de agendamento por membro/workspace
CREATE TABLE booking_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  member_id       UUID NOT NULL REFERENCES workspace_members(id),
  slug            TEXT NOT NULL,
  titulo          TEXT NOT NULL DEFAULT 'Reunião de Vendas',
  duracao_minutos SMALLINT NOT NULL DEFAULT 45,
  buffer_minutos  SMALLINT NOT NULL DEFAULT 10,
  maximo_por_dia  SMALLINT,
  ativo           BOOLEAN DEFAULT true,
  UNIQUE (workspace_id, slug)
);
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Configuração de disponibilidade por membro | 2 | Alta |
| Página pública de agendamento | 2 | Alta |
| Criação automática de lead/reunião ao agendar | 2 | Alta |
| Email de confirmação + arquivo .ics para lead | 2 | Alta |
| Integração Google Calendar (OAuth2 bidirecional) | 3 | Média |
| Link de agendamento customizável por slug | 2 | Alta |
| Datas bloqueadas (feriados, férias) | 2 | Média |
| Cancelar/reagendar via link do email | 2 | Média |
| Múltiplos tipos de reunião por membro (30min, 60min) | 3 | Baixa |

---

## A3 — Módulo: Notificações & SLA de Resposta

### O problema que resolve

Um lead novo chega via formulário às 10h. Às 10h30 ninguém respondeu. Às 11h o lead já foi falar com um concorrente. Sem um sistema de SLA e alertas, isso passa despercebido. Este módulo garante que o time responda no tempo certo.

### SLA de Resposta

**O que é SLA:** Service Level Agreement — tempo máximo aceitável para o SDR responder a um lead novo.

**Configuração por workspace:**
```
sla_primeiro_contato_minutos   INTEGER  -- ex: 5 minutos para responder lead novo
sla_resposta_lead_minutos      INTEGER  -- ex: 15 minutos para responder mensagem inbound
sla_follow_up_horas            INTEGER  -- ex: 24h sem atividade = alerta
```

**Como funciona:**
1. Lead entra via formulário → timer SLA inicia
2. SDR envia primeira mensagem → timer para, SLA cumprido
3. Se timer expira sem resposta → notificação automática para SDR + Gerente
4. Lead fica marcado com badge "⚠️ Sem resposta" no kanban/lista

### Tipos de Notificação

| Tipo | Canal | Quando dispara |
|------|-------|---------------|
| In-app (sino) | Navegador | Sempre |
| Push browser | Browser API | Se tab aberta |
| Email | Resend | Se usuário offline há >5min |
| WhatsApp (futuro) | Integração interna | Se urgente e offline |

### Eventos que geram notificação

| Evento | Notifica quem |
|--------|--------------|
| Novo lead atribuído ao SDR | SDR |
| Mensagem inbound recebida | SDR dono da conversa |
| SLA de primeiro contato expirando (80% do tempo) | SDR |
| SLA de primeiro contato violado | SDR + Gerente |
| Lead sem atividade por X dias | SDR |
| Deal estagnado há X dias | SDR + Gerente |
| Reunião agendada com lead | Closer |
| Reunião 30 min antes de começar | Closer + SDR |
| Lead entrou na sala de vídeo (video meet) | Closer |
| Venda fechada | Owner + Gerente |
| Tarefa com prazo em 1h | Responsável da tarefa |
| Tarefa vencida | Responsável + Gerente |
| @mention em nota | Membro mencionado |

### Preferências do usuário

Cada membro configura individualmente:
- Quais eventos quer receber
- Por quais canais (in-app, email, push)
- Horário de não perturbar (ex: 20h–8h não envia email/push)

### Banco de dados

```sql
CREATE TABLE notification_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  member_id       UUID NOT NULL REFERENCES workspace_members(id),
  evento          TEXT NOT NULL,         -- ex: 'novo_lead', 'sla_violado'
  canal_inapp     BOOLEAN DEFAULT true,
  canal_email     BOOLEAN DEFAULT true,
  canal_push      BOOLEAN DEFAULT false,
  UNIQUE (workspace_id, member_id, evento)
);

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  member_id       UUID NOT NULL REFERENCES workspace_members(id),
  tipo            TEXT NOT NULL,
  titulo          TEXT NOT NULL,
  corpo           TEXT,
  link            TEXT,                  -- URL para abrir ao clicar
  lido            BOOLEAN DEFAULT false,
  lido_em         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- SLA settings por workspace
CREATE TABLE sla_config (
  workspace_id                    UUID PRIMARY KEY,
  primeiro_contato_minutos        INTEGER DEFAULT 10,
  resposta_inbound_minutos        INTEGER DEFAULT 15,
  sem_atividade_horas             INTEGER DEFAULT 48,
  deal_estagnado_dias             INTEGER DEFAULT 7
);
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Notificações in-app (sino) com badge | 1 | Alta |
| Push notification via browser | 2 | Média |
| Configuração de SLA por workspace | 2 | Alta |
| Alerta de SLA de primeiro contato | 2 | Alta |
| Badge "sem resposta" no kanban | 2 | Alta |
| Preferências de notificação por membro | 2 | Média |
| Email de alerta para gerente | 2 | Média |
| Horário de não perturbar | 3 | Baixa |
| Notificação "lead entrou na sala de vídeo" | 2 | Alta |

---

## A4 — Módulo: IA Copilot & Automação Inteligente

> **Nota:** A especificação completa do SDR IA autônomo, dos 3 modos de atendimento, das tools, debounce, cadência, humanização e configuração está em [`20-MODULO-SDR-IA.md`](./20-MODULO-SDR-IA.md). Este item cobre as funcionalidades de IA voltadas ao **suporte ao SDR humano** no Modo Humano+IA. Toda chamada a LLMs usa **OpenRouter** como gateway (ver Princípio 9 no PRD.md).

### O problema que resolve

Os SDRs gastam tempo pensando como responder, repetindo mensagens manualmente, e não têm ajuda para decidir qual o próximo passo com um lead. A IA pode ser um "assistente ao lado" que sugere o que dizer e o que fazer, sem substituir o humano.

### Componentes

#### A4.1 — Sugestões de Resposta no Inbox

**Como funciona:**
1. Lead envia mensagem via WhatsApp
2. No inbox do SDR, abaixo do campo de texto, aparecem 2–3 sugestões de resposta geradas por IA
3. SDR clica na sugestão que preferir → texto aparece no campo de digitação → SDR pode editar antes de enviar
4. Ou SDR ignora e digita do zero

**Contexto que a IA usa:**
- Últimas 20 mensagens da conversa
- Nome do lead, produto/funil de interesse, stage atual
- Instrução de tom: "responda de forma direta, sem formalidade excessiva, focado em agendar reunião"

**Implementação:**
- Edge Function `ai-suggest-reply` chamada via RPC quando usuário abre a conversa
- Modelo: Claude claude-haiku-4-5 (rápido e barato para esse caso)
- Retorna array de 2–3 sugestões, cada uma com no máximo 200 caracteres
- Resultado cacheado por 60 segundos (se lead não respondeu, mesmas sugestões)

#### A4.2 — Resumo de Conversa

**Como funciona:**
- Conversa longa com lead (50+ mensagens) → SDR ou Closer clica "Resumir conversa"
- IA gera resumo em bullet points: quem é o lead, o que quer, objeções levantadas, próximos passos combinados
- Resumo fica salvo na timeline do lead como nota interna

**Utilidade:** Quando Closer assume após SDR qualificar, não precisa ler 80 mensagens — lê o resumo.

#### A4.3 — Análise de Sentimento

**Como funciona:**
- A cada mensagem inbound recebida, IA analisa o sentimento (positivo, neutro, negativo, urgente)
- Um indicador visual na lista de conversas mostra o "humor" do lead
- Se muitas mensagens negativas seguidas → alerta para o SDR: "⚠️ Lead demonstra frustração — verifique"

#### A4.4 — Bot de Qualificação Autônoma (Fase 3)

**O que é:** Um bot de IA que conversa com o lead de forma autônoma enquanto não há SDR disponível (ex: fora do horário comercial), fazendo as perguntas de qualificação básicas.

**Fluxo:**
1. Lead envia mensagem às 23h
2. Bot responde automaticamente via WhatsApp
3. Bot faz as perguntas configuradas: "Qual seu segmento? Qual seu faturamento atual? Qual seu principal desafio?"
4. Lead responde
5. Bot registra as respostas nos campos do contato
6. Bot avisa: "Ótimo! Um consultor vai entrar em contato com você amanhã pela manhã."
7. Às 8h, SDR recebe notificação com lead já pré-qualificado

**Configuração:** Wizard no módulo de automações com perguntas configuráveis, horário de ativação do bot, mensagem de transição.

#### A4.5 — Assistente de Próximos Passos

**Como funciona:**
- Na sidebar do lead card, card "Próximos Passos Sugeridos"
- IA analisa o stage atual + histórico de atividades + tarefas pendentes
- Sugere 1–3 ações: "Você não fala com esse lead há 5 dias. Sugerimos enviar mensagem de follow-up." ou "Deal qualificado sem agendamento de reunião há 3 dias. Agende agora."

#### Banco de dados

```sql
CREATE TABLE ai_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  contato_id      UUID REFERENCES contatos(id),
  oportunidade_id UUID REFERENCES oportunidades(id),
  tipo            TEXT NOT NULL,  -- 'reply_suggestion', 'summary', 'sentiment', 'next_step'
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  modelo          TEXT,           -- 'claude-haiku-4-5', etc.
  resultado       JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Sugestões de resposta no inbox (Claude claude-haiku-4-5) | 2 | Alta |
| Resumo de conversa longa | 2 | Alta |
| Análise de sentimento por mensagem | 3 | Média |
| Assistente de próximos passos no lead card | 3 | Média |
| Bot de qualificação autônoma (fora do horário) | 3 | Média |
| Log de interações IA por workspace (custo + uso) | 2 | Alta |
| Toggle on/off por membro (pode desativar sugestões) | 2 | Média |

---

## A6 — Módulo: Mobile

### O problema que resolve

SDRs respondem leads no celular. Hoje eles precisam usar o WhatsApp pessoal ou o WhatsApp Business sem contexto nenhum do CRM. O app mobile traz o inbox unificado para o celular com contexto do lead sempre ao lado.

### Escopo do MVP mobile

O app mobile **não é** o CRM completo no celular. É o **inbox + tarefas** — as funções que o SDR precisa no campo, em movimento.

**O que terá:**
- Inbox unificado (WhatsApp conversations)
- Enviar mensagem de texto + template
- Ver histórico do lead (nome, stage, nota resumida)
- Lista de tarefas do dia
- Marcar tarefa como concluída
- Notificações push (novo lead, mensagem inbound, SLA)

**O que NÃO terá no mobile:**
- Kanban de pipeline (só visualização de lista)
- Formulários
- Configurações de workspace
- Analytics

### Stack do mobile

**Opção A — React Native** (recomendada): Reutiliza código TypeScript, mesmos hooks de Supabase, componente de chat existente.

**Opção B — Progressive Web App (PWA)**: Mais simples, sem app store, mas limitações de push notification e câmera.

**Decisão:** Iniciar com PWA (Fase 2) para validar demanda, depois considerar React Native (Fase 4) se o uso for alto.

### PWA (Fase 2)

- Manifest.json com ícone, nome, theme_color
- Service Worker para cache offline (conversas recentes)
- Push Notifications via Web Push API (Firebase FCM)
- Instalável via "Adicionar à tela inicial" no iPhone/Android

### React Native (Fase 4)

- Expo + EAS Build para gerar binários iOS/Android
- Compartilha lógica de negócio (hooks Supabase) com web
- Câmera para enviar fotos ao lead
- Notificações push nativas via Expo Notifications

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| PWA instalável (iPhone + Android) | 2 | Alta |
| Inbox WhatsApp no mobile | 2 | Alta |
| Notificações push via browser (PWA) | 2 | Alta |
| Lista de tarefas do dia no mobile | 2 | Alta |
| Cache offline de conversas recentes | 3 | Média |
| App nativo React Native (iOS + Android) | 4 | Média |
| Câmera para enviar fotos via WhatsApp | 4 | Baixa |

---

## SEÇÃO B — ADIÇÕES A MÓDULOS EXISTENTES

---

## B1 — Auto-routing de Leads

**Adicionar em:** `05-MODULO-OPORTUNIDADES.md`

### O problema

Quando 50 leads chegam no mesmo dia, quem decide quem pega qual lead? Se for manual, o gerente perde tempo. Se for "primeiro que agarrar", cria conflito. Auto-routing resolve isso com regras.

### Modos de distribuição

| Modo | Como funciona |
|------|--------------|
| **Round-robin** | Distribui sequencialmente entre os SDRs ativos. Karina, Lucas, Mariana, Karina, Lucas... |
| **Por carga atual** | Quem tem menos leads abertos recebe o próximo |
| **Por funil/campanha** | Leads do funil CDAV → Karina. Leads do funil Mentoría → Lucas |
| **Por região** | Lead do SP → SDR especializada em SP |
| **Manual** | Gerente ou sistema não atribui — fica na fila de "Não atribuídos" |

### Configuração

```sql
CREATE TABLE routing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  nome            TEXT NOT NULL,
  ativo           BOOLEAN DEFAULT true,
  modo            TEXT NOT NULL,  -- 'round_robin', 'menor_carga', 'manual'
  filtro_funil    TEXT[],         -- array de funil slugs (nullable = todos)
  filtro_pipeline UUID,           -- pipeline específico (nullable = todos)
  membros         UUID[],         -- lista de SDRs elegíveis para esta regra
  prioridade      SMALLINT DEFAULT 10,  -- menor número = avaliado primeiro
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Estado do round-robin (qual SDR foi o último a receber)
CREATE TABLE routing_state (
  workspace_id    UUID NOT NULL,
  routing_rule_id UUID NOT NULL REFERENCES routing_rules(id),
  ultimo_membro   UUID REFERENCES workspace_members(id),
  UNIQUE (workspace_id, routing_rule_id)
);
```

### Interface

- Tela "Configurações → Distribuição de Leads"
- Botão "+ Nova Regra"
- Lista de regras com drag-to-reorder (prioridade)
- Toggle ativo/inativo por regra
- Fila "Não atribuídos" visível para gerentes

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Round-robin entre SDRs ativo | 2 | Alta |
| Distribuição por carga (menos leads abertos) | 2 | Alta |
| Distribuição por funil/campanha | 2 | Média |
| Configuração visual de regras de roteamento | 2 | Alta |
| Fila "não atribuídos" para gerentes | 1 | Alta |
| Log de atribuição (quem recebeu, quando, por qual regra) | 2 | Média |

---

## B2 — Handoff SDR → Closer

**Adicionar em:** `05-MODULO-OPORTUNIDADES.md` e `14-CONTROLE-ACESSO.md`

### O problema

O SDR qualificou o lead, agendou a reunião. Agora o Closer precisa conduzir. Mas o Closer não sabe nada sobre o lead — não sabe o que o SDR conversou, quais objeções surgiram, o que foi prometido. Sem handoff estruturado, o Closer entra "cego" na reunião.

### Solução: Nota de Handoff

Quando o deal chega ao stage com tipo `agendado` e é atribuído a um Closer, o sistema:

1. Exibe pop-up para o SDR: "Reunião agendada! Deixe uma nota para o closer." 
2. SDR preenche formulário estruturado:
   - Contexto do lead (1–3 frases)
   - Principal dor/problema do lead
   - Objeções já levantadas
   - O que foi prometido/combinado
   - Nível de interesse percebido (1–5)
3. O formulário se transforma em nota interna na timeline do lead
4. Closer recebe notificação com link direto para a nota

### Banco de dados

```sql
-- Campo extra em oportunidades
ALTER TABLE oportunidades ADD COLUMN handoff_nota_id UUID REFERENCES notas(id);

CREATE TABLE notas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  contato_id      UUID REFERENCES contatos(id),
  oportunidade_id UUID REFERENCES oportunidades(id),
  autor_id        UUID NOT NULL REFERENCES workspace_members(id),
  tipo            TEXT DEFAULT 'nota_interna',  -- 'handoff', 'resumo_ia', 'nota_interna'
  conteudo        TEXT NOT NULL,
  metadados       JSONB,   -- { dor: '...', objecoes: [...], interesse: 4 }
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Pop-up de handoff ao agendar reunião | 2 | Alta |
| Formulário estruturado de handoff | 2 | Alta |
| Nota de handoff na timeline do lead | 2 | Alta |
| Notificação ao Closer com link da nota | 2 | Alta |
| Atribuição automática ao Closer via regra | 3 | Média |

---

## B3 — Detecção de Deals Estagnados

**Adicionar em:** `05-MODULO-OPORTUNIDADES.md`

### O problema

Um lead entra, conecta, e fica parado no stage "Qualificado" por 15 dias sem ninguém falar com ele. Sem uma detecção automática, o gerente só descobre quando já é tarde.

### Solução

O Pipedrive chama isso de "Rotting Deals" (deals apodrecendo). A lógica é simples:

**Definição de estagnado:** Deal sem nenhuma atividade (mensagem enviada, tarefa concluída, ou mudança de stage) nos últimos N dias (configurável por pipeline).

```sql
-- Adicionar em pipeline_stages
ALTER TABLE pipeline_stages ADD COLUMN dias_ate_estagnado SMALLINT DEFAULT 7;

-- View materializada que calcula deals estagnados
CREATE MATERIALIZED VIEW deals_estagnados AS
SELECT 
  o.id,
  o.workspace_id,
  o.contato_id,
  o.pipeline_id,
  o.stage_id,
  o.atribuido_a,
  o.ultima_atividade_em,
  ps.dias_ate_estagnado,
  NOW() - o.ultima_atividade_em AS tempo_parado
FROM oportunidades o
JOIN pipeline_stages ps ON ps.id = o.stage_id
WHERE o.status = 'open'
  AND o.deleted_at IS NULL
  AND ps.tipo NOT IN ('fechado', 'perdido')
  AND NOW() - o.ultima_atividade_em > (ps.dias_ate_estagnado * INTERVAL '1 day');
```

**Atualizar `ultima_atividade_em` a cada:**
- Mensagem enviada ao lead
- Mensagem recebida do lead
- Tarefa concluída vinculada ao deal
- Mudança de stage

**Indicadores visuais:**
- Badge vermelho "🕐 X dias sem atividade" no kanban
- Aba "Estagnados" no módulo de Analytics
- Notificação diária para o SDR com lista de deals parados

---

## B4 — Janela de 24h no WhatsApp

**Adicionar em:** `07-INTEGRACAO-WHATSAPP.md`

### O que é a janela de 24h

A Meta tem uma regra para o WhatsApp Business API: após o lead enviar uma mensagem, você tem **24 horas** para responder com qualquer tipo de mensagem. Após isso, só pode enviar **templates HSM aprovados pela Meta**.

**Por que importa:** Se o SDR tentar enviar uma mensagem livre após 24h, a API retorna erro. O sistema precisa saber se está dentro ou fora da janela.

### Implementação

```sql
-- Adicionar em comunicacoes (ou tabela de conversas)
ALTER TABLE conversas ADD COLUMN ultima_mensagem_inbound_em TIMESTAMPTZ;
ALTER TABLE conversas ADD COLUMN janela_24h_expira_em TIMESTAMPTZ GENERATED ALWAYS AS 
  (ultima_mensagem_inbound_em + INTERVAL '24 hours') STORED;
```

**Na UI do inbox:**
- Campo de texto fica com texto cinza e badge: "⚠️ Fora da janela de 24h — só templates"
- Botão "Enviar" → abre seletor de templates HSM (não permite digitar texto livre)
- Dentro da janela → comportamento normal

**Lógica na edge function de envio:**
```typescript
// Antes de enviar mensagem via Meta API
const dentroJanela = conversation.ultima_mensagem_inbound_em &&
  new Date() < new Date(conversation.ultima_mensagem_inbound_em.getTime() + 24 * 60 * 60 * 1000)

if (!dentroJanela && !isTemplate) {
  return { error: 'Fora da janela de 24h. Use um template HSM.' }
}
```

**UAZAPI:** A UAZAPI (não-oficial) não tem essa restrição. A janela de 24h se aplica **somente à Meta Cloud API**.

---

## B5 — Forecast de Vendas

**O forecast de vendas será desenvolvido no módulo de Analytics (fase futura). Ver B6 para contexto sobre dados de pipeline disponíveis.

---

## B6 — Win/Loss Analysis

**Adicionar em:** `05-MODULO-OPORTUNIDADES.md`

### O problema

Hoje quando um deal é perdido, o SDR seleciona um motivo de perda num dropdown. Mas não há análise estruturada de por que se ganha ou perde. Sem isso, o time não aprende com os padrões.

### Solução

#### Formulário ao marcar como perdido

Quando SDR move deal para stage `perdido`:
1. Pop-up com formulário obrigatório (não pode ser ignorado)
2. Campos:
   - **Motivo primário:** Dropdown (Preço alto, Concorrente, Sem urgência, Sem budget, Lead desqualificado, Sem contato, Outro)
   - **Motivo secundário:** Campo livre (texto)
   - **Quem mencionou:** Select (O lead, O closer, O próprio SDR, Não ficou claro)
   - **Possibilidade de reabrir:** Sim (em X meses) / Não

#### Campos no banco

```sql
ALTER TABLE oportunidades ADD COLUMN perda_motivo_primario TEXT;
ALTER TABLE oportunidades ADD COLUMN perda_motivo_secundario TEXT;
ALTER TABLE oportunidades ADD COLUMN perda_quem_mencionou TEXT;
ALTER TABLE oportunidades ADD COLUMN perda_reabrir_em DATE;  -- data para reentrar em contato
```

#### Análise de Win/Loss (fase futura)

As estatísticas de win/loss (motivos de perda por SDR, funil, período) serão implementadas no módulo de Analytics em fase futura. Os campos ,  já são capturados no banco para suportar essa análise.

---

## B7 — Tempo Médio por Stage

**Tempo médio por stage será implementado no módulo de Analytics (fase futura). Os campos necessários (data_conectado, data_fechado etc.) já estão no modelo de dados.

---

## B8 — Notas Colaborativas & @mentions

**Adicionar em:** `04-MODULO-CONTATOS.md` e `06-MODULO-COMUNICACOES.md`

### O problema

A Karina (SDR) fala com um lead e anota algo importante. O Rafael (Closer) que vai conduzir a reunião não tem como ver essa anotação a não ser que a Karina lembre de contar. Colaboração estruturada resolve isso.

### Notas internas na timeline

**Já existe:** Notas internas no inbox (não enviadas ao lead). Expandir para:

- Qualquer membro pode adicionar nota a qualquer lead/deal
- Notas aparecem na timeline do lead card misturadas com mensagens (com ícone diferente)
- Notas são filtráveis (ver só notas, ver só mensagens, ver tudo)

### @mentions

**Como funciona:**
- Ao digitar nota no lead card → ao digitar `@` → dropdown com membros do workspace
- Selecionar membro → nome aparece destacado na nota
- Membro mencionado recebe notificação: "Karina mencionou você na nota do lead João Silva"
- Clique na notificação → abre o lead card direto na nota

**Implementação:**
```typescript
// No campo de nota, ao digitar '@':
const mention_regex = /@([a-zA-Z\s]+)/g
// Substituir por: <span class="mention" data-member-id="uuid">@Nome</span>
// Ao salvar: extrair IDs mencionados e criar notificações
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Notas internas vinculadas ao lead (qualquer membro) | 1 | Alta |
| Notas na timeline do lead card | 1 | Alta |
| @mentions com notificação para membro | 2 | Média |
| Filtro de timeline (notas | mensagens | todos) | 2 | Média |
| Editar/deletar nota própria | 1 | Média |

---

## B9 — 2FA / MFA

**Adicionar em:** `14-CONTROLE-ACESSO.md`

### O problema

CRM com dados de 10.000 leads. Se a senha de um SDR for comprometida, o atacante acessa todos esses dados. O 2FA (dois fatores de autenticação) adiciona uma segunda camada: mesmo com a senha, precisaria do telefone do SDR.

### Implementação via Supabase Auth

O Supabase Auth suporta TOTP (Time-based One-Time Password) nativamente:

```typescript
// Ativar 2FA para o usuário
const { data } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
// data.totp.qr_code → exibir QR code no app Google Authenticator / Authy

// Verificar ao fazer login
const { data } = await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.id,
  code: '123456'  // código de 6 dígitos do app
})
```

### Configuração por workspace

- **Owner/Admin:** Pode tornar 2FA obrigatório para todos os membros
- **Membro:** Pode ativar voluntariamente se não for obrigatório
- **Roles obrigatórios:** Recomendado exigir 2FA para Owner e Admin sempre

### Interface

- Tela "Perfil → Segurança → Ativar 2FA"
- QR Code para escanear com Google Authenticator, Authy ou 1Password
- Código de backup de 8 dígitos para emergência
- Se 2FA obrigatório pelo workspace: ao fazer login, redireciona para setup antes de acessar qualquer tela

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| 2FA via TOTP (Google Authenticator) para qualquer membro | 2 | Alta |
| 2FA obrigatório por workspace (Owner configura) | 2 | Alta |
| Código de backup de emergência | 2 | Alta |
| Desativar 2FA (exige re-autenticação) | 2 | Média |

---

## SEÇÃO C — INFRAESTRUTURA & DEVOPS

---

## C1 — LGPD / Compliance

### O problema

A Lei Geral de Proteção de Dados (LGPD) é brasileira e obrigatória. O Empire CRM armazena dados pessoais de leads (nome, email, telefone, conversas). Sem compliance, a empresa pode ser multada em até R$ 50 milhões ou 2% do faturamento.

### O que a LGPD exige

| Direito do titular | O que o sistema precisa implementar |
|-------------------|-------------------------------------|
| Direito ao acesso | Lead pode solicitar todos os dados que temos sobre ele |
| Direito ao esquecimento | Lead pode solicitar exclusão de todos os seus dados |
| Direito à portabilidade | Lead pode solicitar seus dados em formato legível (CSV/JSON) |
| Consentimento rastreado | Guardar quando e como o lead deu consentimento para ser contatado |

### Implementação

#### Rastreamento de consentimento

```sql
CREATE TABLE consentimentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  contato_id      UUID NOT NULL REFERENCES contatos(id),
  tipo            TEXT NOT NULL,     -- 'email_marketing', 'whatsapp', 'ligacao'
  consentido      BOOLEAN NOT NULL,
  origem          TEXT NOT NULL,     -- 'formulario', 'importacao', 'api', 'manual'
  formulario_id   UUID,              -- se veio de formulário
  ip_address      INET,
  user_agent      TEXT,
  texto_exibido   TEXT,              -- texto exato que o lead aceitou
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

Ao criar formulário, o builder deve incluir checkbox de consentimento configurável. O texto do consentimento e o timestamp ficam armazenados.

#### Exclusão de dados (Right to Erasure)

```sql
-- Função de anonimização (não deletar — anonimizar para manter integridade relacional)
CREATE OR REPLACE FUNCTION anonimizar_contato(p_contato_id UUID) 
RETURNS void AS $$
BEGIN
  UPDATE contatos SET
    nome = 'DADOS REMOVIDOS',
    email = NULL,
    telefone = NULL,
    tags = NULL,
    utm_source = NULL,
    utm_campaign = NULL,
    -- outros campos pessoais
    lgpd_anonimizado_em = NOW()
  WHERE id = p_contato_id;
  
  -- Anonimizar mensagens
  UPDATE comunicacoes SET
    corpo = '[mensagem removida a pedido do titular]'
  WHERE contato_id = p_contato_id;
END;
$$ LANGUAGE plpgsql;
```

#### Portabilidade

- Botão "Exportar dados do contato" no lead card (Admin e Owner)
- Retorna JSON ou CSV com todos os dados: contato, oportunidades, mensagens, tarefas, notas
- Log da exportação salvo em `audit_log`

#### Campo no banco

```sql
ALTER TABLE contatos ADD COLUMN lgpd_anonimizado_em TIMESTAMPTZ;
ALTER TABLE contatos ADD COLUMN lgpd_exportado_em TIMESTAMPTZ;
```

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Checkbox de consentimento nos formulários | 1 | Crítica |
| Rastreamento de consentimento em tabela dedicada | 1 | Crítica |
| Função de anonimização de contato (LGPD) | 2 | Alta |
| Exportação de dados do titular (portabilidade) | 2 | Alta |
| Log de ações de LGPD no audit log | 2 | Alta |
| Política de privacidade linkada nos formulários | 1 | Alta |

---

## C2 — Observabilidade (Monitoramento)

### O problema

Uma edge function falha às 3h da manhã. Ninguém sabe. Centenas de webhooks de WhatsApp chegam e são perdidos. Apenas na manhã seguinte alguém percebe que os leads sumiram. Sem observabilidade, problemas ficam invisíveis.

### Stack de observabilidade

| Ferramenta | Papel | Tier gratuito |
|-----------|-------|--------------|
| **Sentry** | Captura erros de JavaScript (frontend) e exceções de Edge Functions | 5.000 erros/mês |
| **Supabase Logs** | Logs de edge functions, queries lentas, auth events | Incluído |
| **PostHog** (opcional) | Analytics de produto: funções mais usadas, onde usuários travam | 1M eventos/mês |
| **Betterstack / UptimeRobot** | Monitoramento de uptime e alertas de downtime | Gratuito até 50 monitores |

### O que monitorar

| O que | Ferramenta | Alerta quando |
|-------|-----------|---------------|
| Edge function lança exceção | Sentry | Sempre |
| Taxa de erro webhook > 5% | Sentry | Limiar configurado |
| Edge function demora > 10s | Supabase Logs | Query de análise |
| Frontend JS Error | Sentry | Sempre |
| API retornando 5xx | Betterstack | Sempre |
| Cron job não rodou no horário | Alertas custom | 15 min de atraso |
| Fila de webhooks acumulando | Supabase Logs | Fila > 500 pendentes |

### Implementação Sentry

```typescript
// Em cada edge function
import * as Sentry from '@sentry/deno'

Sentry.init({ dsn: Deno.env.get('SENTRY_DSN'), environment: 'production' })

try {
  // lógica da função
} catch (error) {
  Sentry.captureException(error, {
    extra: { webhook_id: req.headers.get('x-webhook-id'), workspace_id }
  })
  throw error
}
```

### Alertas operacionais internos

```sql
-- Tabela de saúde do sistema (atualizada por cron a cada 5 min)
CREATE TABLE system_health (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  metric            TEXT NOT NULL,    -- 'webhook_queue_depth', 'messages_sent_1h'
  value             NUMERIC,
  checked_at        TIMESTAMPTZ DEFAULT now()
);
```

---

## C3 — Ambientes (Staging vs Produção)

### Por que é crítico

Sem ambiente de staging, qualquer mudança vai direto para produção. Um bug em uma migration pode derrubar o sistema com 50 SDRs online.

### Estrutura de ambientes

| Ambiente | Uso | Dados |
|----------|-----|-------|
| **Local** | Desenvolvimento diário de cada dev | Dados fictícios |
| **Staging** | Testes de QA antes de deploy | Cópia anonimizada de prod |
| **Produção** | Sistema real, clientes reais | Dados reais |

### Como funciona no Supabase

Cada ambiente é um **projeto Supabase separado**:
- `empire-crm-staging` (Supabase projeto de staging)
- `empire-crm-prod` (Supabase projeto de produção)

```bash
# .env.staging
SUPABASE_URL=https://abc123.supabase.co
SUPABASE_ANON_KEY=eyJ...

# .env.production  
SUPABASE_URL=https://xyz789.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

### Vercel Preview Deployments

Cada pull request no GitHub gera automaticamente um preview deployment na Vercel apontando para o projeto Supabase de staging.

### Regras obrigatórias

1. **Nunca executar migrations direto em produção** — sempre staging primeiro
2. **Nunca testar webhooks com dados reais** — usar staging com ngrok para desenvolvimento local
3. **Nunca commitar `.env` files** — usar Vercel Environment Variables + Supabase Vault
4. **Feature flags** (Fase 3): Ligar funcionalidades novas para 10% dos workspaces antes de abrir para todos

---

## C4 — Estratégia de Testes

### Visão geral

Testes garantem que uma mudança não quebra o que já funcionava. Para um CRM, os cenários críticos são: criação de lead, envio de mensagem, movimentação de pipeline, e cálculo de métricas.

### Pirâmide de testes

```
          /\
         /  \   E2E (Playwright) — poucos, cenários críticos
        /    \
       /------\
      /        \  Integration Tests — edge functions, fluxos de dados
     /          \
    /------------\
   /              \  Unit Tests — funções puras (utils, formatters)
  /________________\
```

### Unit Tests (Vitest)

**O que testar:**
- `utils/tags.ts` → `isMqlByTag(['mql', 'sql'])` → `true`
- `utils/dates.ts` → `fmtDate('2026-04-15')` → `'15/04/2026'`
- `utils/phone.ts` → `normalizePhone('+55 11 99999-9999')` → `'5511999999999'`
- `utils/funnels.ts` → `buildCampaignFunnelMap(data)` → Map correto

**Onde ficam:** `src/lib/utils/__tests__/`

**Rodar:** `npm test` (Vitest)

### Integration Tests (Deno Test)

**O que testar:**
- Edge function `process-webhook-whatsapp` → envia payload → verifica que mensagem foi criada no banco
- Edge function `create-lead` → submissão de formulário → verifica contato + oportunidade criados
- Edge function `move-stage` → move deal → verifica data_conectado preenchida

**Como rodar:** Against staging Supabase (nunca produção)

```bash
deno test --allow-env --allow-net supabase/functions/tests/
```

### E2E Tests (Playwright)

**Cenários críticos a cobrir:**

| Cenário | Steps |
|---------|-------|
| Login e acesso ao inbox | Login → Inbox → Ver conversa |
| Criar lead via formulário | Preencher form → Verificar lead no CRM |
| Responder WhatsApp | Abrir conversa → Digitar → Enviar → Verificar msg na timeline |
| Mover deal de stage | Kanban → Drag deal → Verificar data preenchida |
| Criar tarefa | Lead card → Nova tarefa → Verificar na lista de atividades |

**Onde ficam:** `e2e/`

**Rodar:** `npx playwright test` (em staging)

### Quando rodar os testes

| Momento | Testes |
|---------|--------|
| Commit local | Unit tests (automático via git hook) |
| Pull Request | Unit + Integration + E2E de smoke (CI/CD GitHub Actions) |
| Deploy em staging | Suite completa de E2E |
| Deploy em produção | Smoke tests de 5 cenários críticos |

---

## C5 — Billing / Stripe

### O que é necessário

O `18-MULTI-TENANCY.md` define os planos (Free, Pro, Enterprise) mas não cobre como cobrar. Este documento cobre a integração de pagamento.

### Plataforma recomendada

**Stripe** — padrão do mercado para SaaS, suporta BRL, boleto, PIX e cartão. Alternativa brasileira: **Abacate Pay** (PIX nativo, menor taxa, mas menos features).

**Decisão:** Começar com Stripe (mais robusto, documentação melhor, suporta assinaturas recorrentes facilmente).

### Fluxo de upgrade

1. Owner do workspace acessa "Configurações → Plano"
2. Clica "Upgrade para Pro"
3. Redirect para Stripe Checkout com `customer_id` + `workspace_id` no metadata
4. Após pagamento: Stripe envia webhook `customer.subscription.created`
5. Edge function `stripe-webhook` recebe → atualiza `workspaces.plano = 'pro'`

### Modelo de cobrança

| Plano | Preço | Cobrança |
|-------|-------|----------|
| Free | R$ 0 | — |
| Pro | R$ 497/mês | Mensal ou anual (-20%) |
| Enterprise | Negociável | Anual via contrato |

### Banco de dados

```sql
ALTER TABLE workspaces ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE workspaces ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE workspaces ADD COLUMN plano_expira_em TIMESTAMPTZ;
ALTER TABLE workspaces ADD COLUMN trial_expira_em TIMESTAMPTZ;  -- 14 dias de trial Pro

CREATE TABLE billing_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  tipo            TEXT NOT NULL,     -- 'subscription.created', 'payment.failed'
  payload         JSONB,
  processado_em   TIMESTAMPTZ DEFAULT now()
);
```

### Graceful degradation ao atingir limites

Quando workspace Free atinge limite de contatos (1.000):
- Banner amarelo persistente: "Você atingiu o limite do plano Free. Faça upgrade para Pro."
- **Não bloqueia leitura** — time ainda pode ver e responder leads existentes
- **Bloqueia criação** de novos contatos até fazer upgrade
- Novos formulários retornam erro 402 com mensagem amigável

### Tabela de funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Integração Stripe Checkout para upgrade | 2 | Alta |
| Webhook Stripe para ativar/desativar plano | 2 | Alta |
| Trial de 14 dias do plano Pro | 1 | Alta |
| Banner de upgrade ao atingir limite | 1 | Alta |
| Página de faturamento (invoices, histórico) | 2 | Média |
| Cancelamento de assinatura (self-service) | 2 | Alta |
| Email automático de aviso de expiração | 2 | Média |
| Suporte a PIX via Stripe | 2 | Alta |

---

## Tabela consolidada de funcionalidades — Delta (novas adições)

### Módulos Novos

| Funcionalidade | Módulo | Fase | Prioridade |
|---------------|--------|------|------------|
| CRUD de tarefas vinculadas a lead/deal | Tarefas | 1 | Alta |
| Activity feed na timeline do lead | Tarefas | 1 | Alta |
| Página central de atividades | Tarefas | 1 | Alta |
| Configuração de disponibilidade por membro | Agenda | 2 | Alta |
| Página pública de agendamento (link Calendly-like) | Agenda | 2 | Alta |
| Integração Google Calendar bidirecional | Agenda | 3 | Média |
| Notificações in-app + push browser | Notificações | 1 | Alta |
| SLA de primeiro contato com alertas | Notificações | 2 | Alta |
| Badge "sem resposta" no kanban | Notificações | 2 | Alta |
| Sugestões de resposta IA no inbox | IA Copilot | 2 | Alta |
| Resumo de conversa longa (IA) | IA Copilot | 2 | Alta |
| Bot de qualificação autônoma | IA Copilot | 3 | Média |
| PWA instalável (mobile) | Mobile | 2 | Alta |
| Inbox WhatsApp no mobile | Mobile | 2 | Alta |
| App nativo React Native | Mobile | 4 | Média |

### Adições a módulos existentes

| Funcionalidade | Módulo | Fase | Prioridade |
|---------------|--------|------|------------|
| Round-robin de leads entre SDRs | Oportunidades | 2 | Alta |
| Fila "não atribuídos" para gerentes | Oportunidades | 1 | Alta |
| Pop-up de handoff SDR → Closer | Oportunidades | 2 | Alta |
| Detecção automática de deals estagnados | Oportunidades | 2 | Alta |
| Badge "X dias sem atividade" no kanban | Oportunidades | 2 | Alta |
| Controle de janela de 24h WhatsApp na UI | WhatsApp | 2 | Crítica |
| Formulário estruturado de motivo de perda | Oportunidades | 1 | Alta |
| Notas colaborativas em qualquer lead | Contatos | 1 | Alta |
| @mentions com notificação | Contatos | 2 | Média |
| 2FA via TOTP (Google Authenticator) | Acesso | 2 | Alta |
| 2FA obrigatório por workspace | Acesso | 2 | Alta |

### Infraestrutura

| Funcionalidade | Categoria | Fase | Prioridade |
|---------------|-----------|------|------------|
| Checkbox de consentimento LGPD nos forms | LGPD | 1 | Crítica |
| Anonimização de contato (direito ao esquecimento) | LGPD | 2 | Alta |
| Sentry para errors frontend + edge functions | Observabilidade | 1 | Alta |
| Monitoramento de uptime (Betterstack) | Observabilidade | 1 | Alta |
| Ambiente de staging separado | DevOps | 1 | Crítica |
| Unit tests (Vitest) para utils | Testes | 1 | Alta |
| E2E tests (Playwright) para cenários críticos | Testes | 1 | Alta |
| Integração Stripe Checkout | Billing | 2 | Alta |
| Trial de 14 dias do plano Pro | Billing | 1 | Alta |

---

*Documento criado em Abril/2026 — Empire Business*  
*Complementa os documentos 01–18 do PRD do Empire CRM*
