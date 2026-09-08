# Empire CRM — Product Requirements Document (PRD)

> **Versão:** 1.0  
> **Data:** Abril/2026  
> **Status:** Em elaboração  
> **Responsável:** Alto Valor / Empire Business

---

## O que é este documento?

Este PRD (Product Requirements Document — Documento de Requisitos do Produto) é o **guia completo** para construir o **Empire CRM**, um sistema de gestão de relacionamento com clientes (CRM) próprio, desenvolvido especificamente para as operações de alto volume de leads da Empire Business.

**Pense neste documento como a "planta baixa" de uma casa.** Antes de colocar um tijolo, você precisa da planta. Este PRD é essa planta — ele descreve o que construir, por que construir, como estruturar, e em que ordem fazer.

---

## Índice Completo

| # | Documento | O que cobre |
|---|-----------|-------------|
| Este arquivo | **PRD.md** | Visão geral, índice, glossário, tabela de funcionalidades |
| [01](./01-VISAO-PRODUTO.md) | **Visão do Produto** | Por que construir, para quem, métricas de sucesso |
| [02](./02-ARQUITETURA-TECNICA.md) | **Arquitetura Técnica** | Stack tecnológica, infraestrutura, diagramas, error handling, data retention |
| [03](./03-MODELO-DADOS.md) | **Modelo de Dados** | Todas as tabelas, campos, relacionamentos (incluindo conversas, activity_log, tarefas, email_templates, processing_queue) |
| [04](./04-MODULO-CONTATOS.md) | **Módulo: Contatos** | Gestão de pessoas/leads no CRM, busca global (Ctrl+K), deduplicação, UTM |
| [05](./05-MODULO-OPORTUNIDADES.md) | **Módulo: Oportunidades** | Deals, pipelines, funil de vendas, soft delete |
| [06](./06-MODULO-COMUNICACOES.md) | **Módulo: Comunicações** | Inbox unificado (WhatsApp, Email, SMS, Instagram), modelo de conversas, email via AC+Resend |
| [07](./07-INTEGRACAO-WHATSAPP.md) | **Integração: WhatsApp** | API Oficial (Meta) + UAZAPI (não-oficial) |
| [08](./08-INTEGRACAO-ACTIVECAMPAIGN.md) | **Integração: ActiveCampaign** | Sync bidirecional de contatos e automações |
| [09](./09-CONSTRUTOR-FORMULARIOS.md) | **Construtor de Formulários** | Form builder nativo + API de criação de leads |
| [10](./10-WEBHOOKS-API.md) | **Webhooks & API** | API pública REST + webhooks ilimitados, versioning, idempotency, batch ops |
| [11](./12-MODULO-AUTOMACOES.md) | **Módulo: Automações** | Workflows, triggers, sequências automáticas |
| [14](./14-CONTROLE-ACESSO.md) | **Controle de Acesso** | Multi-workspace, roles, permissões |
| [15](./15-MIGRACAO-GHL.md) | **Migração do GHL** | Como sair do GHL e entrar no Empire CRM |
| [16](./16-ROADMAP-FASES.md) | **Roadmap por Fases** | O que construir primeiro, MVP, cronograma |
| [17](./17-MODULO-VIDEOMEET.md) | **Módulo: Video Meet** | Sala própria de videoconferência (LiveKit, gravação, transcrição, IA pós-call) |
| [18](./18-MULTI-TENANCY.md) | **Multi-Tenancy** | Workspace lifecycle, planos e limites, RLS completo, API key scopes, audit log, rate limiting, portabilidade de dados |
| [19](./19-COMPLEMENTO-PRD.md) | **Complemento PRD** | Módulos novos + gaps identificados: Tarefas, Agenda/Scheduling, Notificações/SLA, IA Copilot, Analytics, Mobile, Auto-routing, Handoff SDR→Closer, Deals Estagnados, Janela 24h WhatsApp, Forecast, Win/Loss, 2FA, LGPD, Observabilidade, Testes, Billing/Stripe |
| [20](./20-MODULO-SDR-IA.md) | **Módulo: SDR IA & Modos de Atendimento** | 3 modos (Humano / IA / Humano+IA), SDR IA via OpenRouter, múltiplos números UAZAPI + Meta, humanização, tools/function calling, debounce, cadência, BANT scoring, guardrails, configuração rica por UI |

---

## Resumo Executivo

### O problema hoje

A Empire Business usa o **GoHighLevel (GHL)** como CRM. O GHL é uma ferramenta americana genérica, com limitações importantes:

1. **Custo alto** — planos caros em dólar, com cobrança por número de contatos/usuários
2. **Falta de personalização** — não é possível adaptar os relatórios ao nosso modelo de negócio
3. **Dependência externa** — qualquer mudança no GHL pode quebrar nossas integrações
4. **Dados fragmentados** — parte dos dados fica no GHL, parte no Supabase, o que complica análises
5. **Sem WhatsApp nativo** — o GHL tem uma integração limitada com WhatsApp

### A solução: Empire CRM

O **Empire CRM** é um CRM 100% próprio, construído do zero, que:

- **Centraliza tudo:** leads, contatos, mensagens, reuniões, contratos, faturamento — em um só lugar
- **É customizado para o nosso modelo:** MQL por tag, pipelines configuráveis, campos customizados
- **Tem WhatsApp nativo:** tanto a API Oficial quanto a UAZAPI (para maior flexibilidade)
- **É escalável:** sem limite de contatos, sem limite de usuários, sem limite de webhooks ou APIs
- **É nosso:** podemos alterar qualquer coisa, a qualquer momento

### Stack tecnológica

```
Frontend:  React 18 + TypeScript + Vite + Tailwind CSS
Backend:   Supabase (PostgreSQL + Auth + Storage + Edge Functions)
Deploy:    Vercel (frontend) + Supabase Cloud (backend)
WhatsApp:  Meta Cloud API (oficial) + UAZAPI (não-oficial) — ilimitado de números em ambos
Email:     Resend (transacional)
IA:        OpenRouter (gateway unificado para Claude, GPT-4, Gemini, Llama e +200 modelos)
```

---

## Glossário de Termos

> Esta seção explica todos os termos técnicos e de negócio usados neste PRD. Se você não entende um termo, procure aqui primeiro.

### Termos de Negócio

| Termo | Definição simples |
|-------|-------------------|
| **Lead** | Uma pessoa que demonstrou interesse no nosso produto. No sistema, cada lead é uma **oportunidade** (deal). |
| **Contato** | A pessoa por trás do lead. Um contato pode ter vários leads (várias oportunidades). |
| **MQL** | *Marketing Qualified Lead* — lead que foi qualificado pelo marketing como potencial cliente. Identificado pela TAG "MQL" no sistema. |
| **SQL** | *Sales Qualified Lead* — lead qualificado pelo time de vendas, pronto para negociação. |
| **SDR** | *Sales Development Representative* — o "pré-vendedor". Pessoa responsável por entrar em contato com o lead, qualificá-lo e agendar reunião com o closer. Pode ser humano, IA, ou humano com apoio de IA. |
| **SDR IA** | Agente de inteligência artificial que atua como SDR de forma autônoma — conversa com leads via WhatsApp, qualifica usando BANT, agenda reuniões e faz follow-up automático. Configurado com personalidade, horário, modelo de IA e ferramentas. |
| **Modo de Atendimento** | Define como cada número de WhatsApp opera: "Humano" (100% manual), "SDR IA" (100% automático) ou "Humano + IA" (SDR humano com sugestões e automações da IA). |
| **BANT** | *Budget, Authority, Need, Timeline* — método de qualificação de leads. Budget = orçamento disponível; Authority = quem decide; Need = qual problema/dor; Timeline = prazo para decisão. O SDR IA coleta essas informações naturalmente durante a conversa. |
| **Cadência** | Sequência programada de follow-ups automáticos. Exemplo: D+0 boas-vindas, D+1 follow-up se sem resposta, D+3 segundo follow-up, D+7 encerrar. Cada stage do pipeline pode ter sua própria cadência. |
| **Debounce** | Técnica que faz o sistema aguardar X segundos antes de processar a última mensagem de um lead, evitando responder antes do lead terminar de digitar. |
| **Closer** | Vendedor responsável por conduzir a reunião de vendas e fechar o contrato. |
| **Pipeline** | Um funil de vendas com etapas (stages). Exemplo: "Pré-Vendas MQL" tem as etapas: Novo → Conectado → Qualificado → Agendado → Reunião Realizada. |
| **Stage** | Uma etapa dentro de um pipeline. É onde o lead "está" no momento. |
| **Funil** | Agrupamento de campanhas por objetivo/produto. Exemplo: "CDAV" (Consultoria de Alto Valor). |
| **No-show** | Lead que agendou reunião mas não compareceu. |

### Termos Técnicos

| Termo | Definição simples |
|-------|-------------------|
| **Supabase** | Plataforma de banco de dados na nuvem. É o "servidor" onde todos os dados ficam armazenados. |
| **PostgreSQL** | O banco de dados que roda dentro do Supabase. É onde as tabelas ficam. |
| **Edge Function** | Um pequeno programa que roda "próximo ao usuário" para executar tarefas específicas (como receber webhooks ou chamar APIs externas). |
| **Webhook** | Uma notificação automática que um sistema envia para outro quando algo acontece. Ex: WhatsApp envia um webhook quando chega uma mensagem. |
| **API** | Interface de programação — permite que um sistema fale com outro. Ex: nosso CRM tem uma API que permite criar leads programaticamente. |
| **REST API** | Um tipo de API que usa URLs e verbos HTTP (GET, POST, PUT, DELETE) para operações. |
| **RLS** | *Row Level Security* — segurança a nível de linha no banco de dados. Garante que cada usuário só vê os dados do seu workspace. |
| **JWT** | *JSON Web Token* — um "crachá digital" que identifica um usuário autenticado. |
| **UUID** | *Universally Unique Identifier* — um identificador único global. Ex: `550e8400-e29b-41d4-a716-446655440000`. |
| **UPSERT** | Operação de banco que faz INSERT se o registro não existe, ou UPDATE se já existe. |
| **Cron Job** | Tarefa agendada que roda automaticamente em intervalos fixos. Ex: "sincronizar tags a cada 10 minutos". |
| **UTM** | Parâmetros de URL usados para rastrear a origem do tráfego. Ex: `utm_source=facebook`, `utm_campaign=cdav-jan`. |
| **Multi-tenancy** | Arquitetura onde vários clientes/empresas usam o mesmo sistema, mas com dados completamente isolados. |
| **Workspace** | O "espaço" isolado de cada empresa dentro do sistema. Todos os dados são separados por workspace. |

### Termos de Integração

| Termo | Definição simples |
|-------|-------------------|
| **WhatsApp Cloud API** | API oficial do WhatsApp fornecida pela Meta (Facebook). Requer aprovação da Meta e tem custo por conversa. |
| **UAZAPI** | Solução não-oficial que permite usar o WhatsApp Web como API. Mais flexível, sem custo por conversa, mas não tem suporte oficial da Meta. Suporta múltiplas instâncias simultâneas. |
| **WABA** | *WhatsApp Business Account* — conta empresarial do WhatsApp necessária para usar a API oficial. |
| **HSM** | *Highly Structured Message* — template de mensagem aprovado pela Meta para iniciar conversas. Obrigatório fora da janela de 24h. |
| **OpenRouter** | Gateway de IA que unifica o acesso a centenas de modelos (Claude, GPT-4, Gemini, Llama, etc.) com uma única chave de API. Toda integração de IA do Empire CRM passa pelo OpenRouter — nunca diretamente pelo provedor. Isso permite trocar de modelo pela UI sem mexer em código. |
| **Function Calling / Tools** | Capacidade dos modelos de IA de executar funções reais durante a conversa. Exemplo: enquanto conversa com um lead, o SDR IA pode chamar a tool `schedule_meeting` para agendar uma reunião diretamente no CRM. |
| **ActiveCampaign** | Plataforma de e-mail marketing e automações. Muitas vezes usada em paralelo ao CRM para nurturing de leads. |
| **LiveKit** | Servidor WebRTC de código aberto (SFU) que gerencia salas de vídeo. Usado como backend do "Google Meet próprio" do Empire CRM. |
| **SFU** | *Selective Forwarding Unit* — servidor de vídeo que recebe streams e repassa seletivamente, sem transcodificar. Suporta 100+ participantes por sala. |
| **Egress** | Funcionalidade do LiveKit que grava a reunião completa e exporta como arquivo MP4 para um storage externo (R2). |
| **Cloudflare R2** | Storage de objetos compatível com S3, sem custo de egress (download). Usado para armazenar as gravações das reuniões. 10 GB gratuitos. |
| **Soniox** | Serviço de reconhecimento de fala (*Speech-to-Text*) dual-channel em tempo real. Transcreve simultaneamente os dois lados da conversa. |
| **WebRTC** | Protocolo de comunicação de vídeo/áudio em tempo real que roda diretamente no navegador, sem precisar instalar nenhum software. |

---

## Tabela de Funcionalidades por Fase

> Esta tabela mostra quando cada funcionalidade será construída. "Fase 1" é o que virá primeiro (MVP), "Fase 2" vem depois, e assim por diante.

### Módulo: CRM Core

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Cadastro de contatos | 1 | Crítica |
| Criação de oportunidades | 1 | Crítica |
| Pipelines customizáveis | 1 | Crítica |
| Tags por contato | 1 | Crítica |
| Histórico de atribuição (UTMs/clicks) — tabela contato_atribuicoes | 1 | Crítica |
| Edição manual de UTMs (individual e em massa) | 1 | Crítica |
| Kanban de oportunidades | 1 | Alta |
| Campos customizados | 1 | Alta |
| Histórico de atividades | 1 | Alta |
| Importação via CSV | 1 | Alta |
| Deduplicação de contatos | 2 | Média |
| Merge de contatos duplicados | 3 | Baixa |
| Notas colaborativas em qualquer lead | 1 | Alta |
| @mentions com notificação ao membro | 2 | Média |
| Activity feed na timeline do lead | 1 | Alta |
| Tarefas vinculadas a lead/deal (follow-up) | 1 | Alta |
| Página central de atividades (hoje/amanhã/atrasadas) | 1 | Alta |
| Formulário estruturado de motivo de perda (Win/Loss) | 1 | Alta |
| Detecção de deals estagnados (badge + alerta) | 2 | Alta |
| Auto-routing de leads (round-robin, por carga) | 2 | Alta |
| Handoff SDR → Closer (nota estruturada) | 2 | Alta |

| Email transacional (Resend) no inbox | 1 | Alta |
| Email marketing via ActiveCampaign no inbox | 1 | Alta |
| Template de email (AC + nativo) | 1 | Alta |
| Email inbound (receber reply) | 2 | Alta |
| Tracking de abertura/clique de email | 2 | Média |
| Busca global (Ctrl+K) em contatos, oportunidades, conversas | 1 | Crítica |
| Itens recentes na busca global | 1 | Média |
| Activity log (timeline + audit unificado) | 1 | Crítica |
| Tarefas vinculadas a lead/deal | 1 | Alta |
| Conversas (agrupamento de mensagens por contato+canal) | 1 | Crítica |
| Janela de 24h WhatsApp na UI | 2 | Crítica |
| Transferência de conversa entre SDRs | 1 | Alta |
| API versioning (/v1) | 1 | Alta |
| Idempotency keys em POST da API | 1 | Alta |
| Batch operations na API (bulk contacts, bulk stage) | 1 | Média |
| Error handling & resilience (fila unificada, retry, dead letter) | 1 | Crítica |
| Data retention policy | 1 | Alta |
| Soft delete para oportunidades | 1 | Alta |

### Módulo: Comunicações

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Inbox unificado | 1 | Crítica |
| WhatsApp via UAZAPI | 1 | Crítica |
| WhatsApp via API Oficial | 2 | Alta |
| SMS | 2 | Alta |
| Email | 2 | Alta |
| Ligações (VoIP) | 3 | Média |
| Instagram DM | 3 | Baixa |
| Templates de mensagem | 1 | Alta |
| Auto-tag "conectado" | 1 | Alta |
| Controle de janela de 24h WhatsApp na UI | 2 | Crítica |
| Sugestões de resposta IA no inbox (Claude) | 2 | Alta |
| Resumo de conversa longa (IA) | 2 | Alta |
| Bot de qualificação autônoma (fora do horário) | 3 | Média |

### Módulo: Formulários

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Form builder drag-and-drop | 1 | Crítica |
| Embed via iframe/script | 1 | Crítica |
| Captura de UTM automática | 1 | Crítica |
| API de submissão | 1 | Crítica |
| API direta de criação de contato/oportunidade | 1 | Crítica |
| Validações configuráveis | 1 | Alta |
| Notificação ao SDR | 1 | Alta |
| Página de obrigado customizável | 2 | Média |
| A/B de formulários | 3 | Baixa |
| Checkbox de consentimento LGPD | 1 | Crítica |
| Link de agendamento público (Calendly-like) | 2 | Alta |

### Módulo: API & Webhooks

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| API keys por workspace | 1 | Crítica |
| Endpoints CRUD (contatos, opps) | 1 | Crítica |
| Webhooks de saída | 1 | Crítica |
| Webhooks de entrada | 1 | Alta |
| Paginação cursor-based | 1 | Alta |
| Log de webhooks | 1 | Alta |
| Retry automático | 1 | Alta |
| Rate limiting configurável | 2 | Média |
| SDK TypeScript | 3 | Baixa |

### Módulo: Automações

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Workflow builder visual | 3 | Alta |
| Trigger: novo lead | 2 | Alta |
| Trigger: mensagem recebida | 2 | Alta |
| Trigger: tag adicionada | 2 | Alta |
| Ação: enviar WhatsApp | 2 | Alta |
| Ação: adicionar tag | 2 | Alta |
| Ação: mover pipeline | 2 | Alta |
| Ação: notificar SDR | 2 | Alta |
| Sequências com delay | 3 | Média |
| Ação: ActiveCampaign | 3 | Média |

### Módulo: Notificações & SLA

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Notificações in-app (sino com badge) | 1 | Alta |
| SLA de primeiro contato configurável | 2 | Alta |
| Badge "sem resposta" no kanban | 2 | Alta |
| Push notification via browser (PWA) | 2 | Média |
| Alerta de lead sem atividade por X dias | 2 | Alta |
| Preferências de notificação por membro | 2 | Média |

### Módulo: Agenda & Scheduling

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Configuração de disponibilidade por membro | 2 | Alta |
| Página pública de agendamento (slug) | 2 | Alta |
| Criação automática de lead/reunião ao agendar | 2 | Alta |
| Email de confirmação + arquivo .ics para lead | 2 | Alta |
| Integração Google Calendar bidirecional | 3 | Média |
| Cancelar/reagendar via link do email | 2 | Média |


### Módulo: Mobile

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| PWA instalável (iOS + Android) | 2 | Alta |
| Inbox WhatsApp no mobile | 2 | Alta |
| Notificações push via browser (PWA) | 2 | Alta |
| Lista de tarefas do dia no mobile | 2 | Alta |
| App nativo React Native (iOS + Android) | 4 | Média |

### Módulo: Video Meet (Google Meet Próprio)

> Substitui o Google Meet por uma sala de vídeo 100% controlada pela Empire. O vendedor/closer conduz a reunião dentro do próprio CRM, com o contexto do lead visível ao lado, gravação automática em nuvem e transcrição em tempo real.

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Sala de vídeo própria (LiveKit WebRTC) | 1 | Crítica |
| Gravação automática em MP4 (Cloudflare R2) | 1 | Crítica |
| Tela de pré-entrada (PreJoin — câmera + mic) | 1 | Alta |
| Roles: host / guest / observer invisível | 1 | Alta |
| Encerramento automático ao host sair | 1 | Alta |
| Link único por reunião | 1 | Alta |
| Painel lateral com dados do lead na call | 1 | Alta |
| Exibir gravação na timeline do lead | 2 | Alta |
| Chat privado host ↔ observer (coaching ao vivo) | 2 | Média |
| Transcrição em tempo real (Soniox) | 2 | Média |
| Análise de IA pós-call (resumo, pontos fortes/fracos) | 2 | Média |
| Envio de convite por email com .ics (calendário) | 2 | Média |
| Notificação ao SDR/closer quando lead entrar | 2 | Média |
| Badge "AO VIVO" em tarefas enquanto reunião ativa | 3 | Baixa |
| Banner de recovery (detecta call deixada aberta) | 3 | Baixa |

### Módulo: Integrações

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| UAZAPI (WhatsApp não-oficial) | 1 | Crítica |
| LiveKit Cloud (videoconferência) | 1 | Crítica |
| Cloudflare R2 (storage de gravações) | 1 | Crítica |
| WhatsApp Cloud API (oficial) | 2 | Alta |
| Soniox (transcrição STT em tempo real) | 2 | Média |
| ActiveCampaign | 3 | Média |
| Meta Ads API | futuro | Baixa |
| Google Ads API | futuro | Baixa |
| Notion (criativos) | futuro | Baixa |

### Módulo: Controle de Acesso

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Multi-workspace | 1 | Crítica |
| Roles (Owner, Admin, SDR, Closer, Viewer) | 1 | Crítica |
| Permissões por módulo | 1 | Alta |
| Filtro de dados por SDR | 1 | Alta |
| Convite por email | 1 | Alta |
| SSO (Google OAuth) | 3 | Baixa |
| 2FA via TOTP (Google Authenticator) | 2 | Alta |
| 2FA obrigatório por workspace | 2 | Alta |

### Módulo: Workspace & Multi-Tenancy

> Infraestrutura que permite que **diferentes empresas** usem o mesmo sistema sem enxergar os dados uma da outra. Cada empresa é um workspace completamente isolado. Ver documento completo: [`18-MULTI-TENANCY.md`](./18-MULTI-TENANCY.md)

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| Cadastro de novo workspace (signup de empresa) | 1 | Crítica |
| Onboarding guiado (wizard de configuração inicial) | 1 | Alta |
| Isolamento por `workspace_id` + RLS em todas as tabelas | 1 | Crítica |
| Planos com limites definidos (Free / Pro / Enterprise) | 1 | Alta |
| Workspace switching na UI (usuário em múltiplos workspaces) | 2 | Alta |
| API Keys com escopos por endpoint | 2 | Alta |
| Webhook signature (HMAC) por workspace | 2 | Alta |
| Audit log de ações (quem fez o quê, quando) | 2 | Média |
| Rate limiting por workspace e por plano | 2 | Média |
| Transferência de ownership | 2 | Média |
| Exportação de dados do workspace (CSV/JSON) | 3 | Média |
| Suspensão e exclusão de workspace | 3 | Média |
| Backup e restore por workspace | 4 | Baixa |
| Integração Stripe Checkout (upgrade de plano) | 2 | Alta |
| Trial de 14 dias do plano Pro | 1 | Alta |
| Banner de upgrade ao atingir limite do plano | 1 | Alta |
| Cancelamento de assinatura self-service | 2 | Alta |
| Anonimização de contato (LGPD — direito ao esquecimento) | 2 | Alta |
| Exportação de dados do titular (portabilidade LGPD) | 2 | Alta |
| Sentry (erros frontend + edge functions) | 1 | Alta |
| Ambiente de staging separado do de produção | 1 | Crítica |
| Unit tests (Vitest) para funções utilitárias | 1 | Alta |
| E2E tests (Playwright) para cenários críticos | 1 | Alta |

### Módulo: SDR IA & Modos de Atendimento

> Sistema que permite atendimento por IA autônoma, por humano, ou por humano com apoio de IA. Toda integração de IA usa **OpenRouter** como gateway — modelo configurável pela UI sem necessidade de código. Ver documento completo: [`20-MODULO-SDR-IA.md`](./20-MODULO-SDR-IA.md)

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| 3 modos de atendimento por número (Humano / SDR IA / Humano+IA) | 1 | Crítica |
| SDR IA via OpenRouter (modelo escolhido na UI) | 1 | Crítica |
| Múltiplos números UAZAPI conectados simultaneamente (ilimitado) | 1 | Crítica |
| Múltiplos números Meta API conectados simultaneamente (ilimitado) | 2 | Crítica |
| Humanização: delay variável, indicador de digitação, divisão em partes | 1 | Crítica |
| System prompt configurável com contexto dinâmico do lead | 1 | Crítica |
| 9 tools de function calling (BANT, agenda, stage, handoff) | 1 | Crítica |
| Debounce de processamento (aguarda lead terminar de digitar) | 1 | Crítica |
| Fila de processamento com claim atômico (sem duplicatas) | 1 | Crítica |
| Guardrails: horário comercial, rate limit, max mensagens por conversa | 1 | Crítica |
| Auto-pause quando SDR humano intervém | 1 | Alta |
| Transferência para humano automática com notificação | 1 | Crítica |
| Cadência automática de follow-up por stage do pipeline | 1 | Alta |
| Cadência cancela automaticamente quando lead responde | 1 | Crítica |
| BANT scoring automático (score 15–100) | 1 | Alta |
| Sugestões de resposta IA para SDR humano (Modo Humano+IA) | 2 | Alta |
| Copiloto lateral com próximos passos sugeridos | 2 | Média |
| UI de configuração completa do agente (6 abas) | 1 | Crítica |
| Badge de status do agente no lead card (ativa/pausada/transferida) | 1 | Alta |
| Log de auditoria de todas as ações do SDR IA | 1 | Alta |
| Seletor de modelo OpenRouter na interface (qualquer modelo disponível) | 1 | Crítica |
| Configuração de chave OpenRouter via UI (sem mexer em código) | 1 | Crítica |
| Múltiplos agentes com escopos diferentes (por pipeline, por número) | 3 | Média |
| A/B test de system prompts | 4 | Baixa |

---

## Princípios de Desenvolvimento

Estes são os princípios que devem guiar todas as decisões técnicas durante o desenvolvimento:

### 1. Formulário/API como fonte primária de dados
O dado de um lead entra no sistema via **formulário nativo** ou **API direta**. O banco de dados do Empire CRM é a fonte de verdade — não depende de nenhum sistema externo para existir.

### 2. Webhooks são complementos, não fonte primária
Webhooks entram no Empire CRM por dois motivos específicos:
- **Mensagens** (WhatsApp/Instagram/etc.) — vinculadas a um contato já existente
- **Enriquecimento** (Hotmart, Calendly, sistemas externos) — complementam dados de um contato/oportunidade existente

Webhooks nunca são a forma principal de criar um lead. Se o contato não existe quando o webhook chega, o sistema cria um contato mínimo (pelo telefone/email) e aguarda dados completos.

### 3. Idempotência
A mesma operação executada duas vezes produz o mesmo resultado. Usar UPSERT com chaves naturais (external_message_id para mensagens, email/telefone para contatos).

### 4. Paginação obrigatória para grandes volumes
Nunca usar `.limit(N)` com N > 1000. O PostgREST retorna no máximo 1000 sem erro. Sempre paginar com `.range()` em loop.

### 5. Webhook como fonte de verdade
O dado que chega via webhook/API externa sempre sobrescreve o dado local. Nunca usar `COALESCE(local, externo)` para campos que devem ser atualizados.

### 6. Timezone padrão
- Armazenar todas as timestamps em UTC (ISO 8601)
- Converter para `America/Sao_Paulo` ao exibir ou filtrar por data
- Colunas de pipeline (data_conectado, data_fechado etc.) usam tipo `DATE` (sem hora)
- Timestamps de sistema usam `TIMESTAMPTZ`

### 7. Segurança por padrão
- Row Level Security (RLS) ativo em todas as tabelas
- Toda query filtra por `workspace_id`
- API keys nunca expostas no frontend
- Inputs sanitizados antes de processar

### 8. Todo dado pertence a um workspace
Nenhuma tabela de negócio existe fora de um workspace. Todo `INSERT` deve incluir `workspace_id`. Toda `SELECT` deve filtrar por `workspace_id`. O RLS é a garantia técnica no banco, mas o filtro explícito na query é a primeira linha de defesa — nunca depender só do RLS para não vazar dados entre empresas. Ver [`18-MULTI-TENANCY.md`](./18-MULTI-TENANCY.md) para a implementação completa.

### 9. Toda integração de IA passa pelo OpenRouter
Nunca chamar APIs de modelos de IA diretamente (Anthropic, OpenAI, Google). Toda chamada a LLMs deve usar o **OpenRouter** como gateway unificado (`https://openrouter.ai/api/v1`). Isso garante:
- Troca de modelo pela UI sem deploy
- Uma única chave de API para todos os modelos
- Fallback automático se um modelo ficar indisponível
- Visibilidade de custo por token na interface

A chave do OpenRouter é armazenada na tabela `integration_keys` (criptografada), nunca em variáveis de ambiente hardcoded no código. O padrão é sempre: DB-first → env fallback.

### 10. Humanização é obrigatória para o SDR IA
Mensagens enviadas pelo SDR IA nunca são disparadas imediatamente nem de uma só vez. Todo envio de IA deve seguir o pipeline de humanização: delay variável pré-resposta → indicador de digitação → simulação de velocidade humana de digitação → divisão em partes curtas → delay entre partes. Sem isso, o lead percebe o robô.

### 11. Conversas são a unidade de exibição do inbox
O inbox nunca mostra mensagens isoladas — mostra **conversas**. Cada conversa agrupa todas as mensagens de um contato em um canal (WhatsApp, Email, etc.). A tabela `conversas` gerencia estado (aberta, aguardando, resolvida), SLA (última mensagem inbound), janela de 24h (WhatsApp), e não lidas. Toda mensagem `INSERT` em `comunicacoes` deve ser vinculada a uma conversa.

### 12. Activity log é a fonte da timeline
Toda ação relevante no sistema (mudança de stage, adição de tag, transferência de conversa, conclusão de tarefa, reunião agendada) gera um registro na tabela `activity_log`. A timeline do lead card consulta `activity_log` — nunca é calculada dinamicamente cruzando múltiplas tabelas.

### 13. Email opera em dois modos: transacional (Resend) e marketing (ActiveCampaign)
Email não é um canal único — é dois. Email transacional (1:1, resposta direta no inbox) usa Resend. Email marketing (campanhas, sequências de nutrição) usa ActiveCampaign. Ambos aparecem no inbox como mensagens do canal `email`. O SDR pode escolher enviar via Resend (texto livre) ou via AC (template com variáveis).

---

## Lógicas de negócio a implementar do zero

O Empire CRM é um projeto **100% independente**, com Supabase próprio. As lógicas analíticas abaixo devem ser reimplementadas nativamente neste projeto, sem copiar código de nenhum projeto existente:

| Lógica | Onde implementar |
|--------|-----------------|
| Detecção de MQL por tag | `src/lib/utils/tags.ts` — `isMqlByTag(tags)` |
| Mapeamento campanha → funil | `src/lib/utils/funnels.ts` — `buildCampaignFunnelMap(data)` |
| Funções de timezone (SP) | `src/lib/utils/dates.ts` — `toSPISOStart/End`, `fmtDate` |
| Normalização de telefone | `src/lib/utils/phone.ts` |

**Design System:** DS1 Silver Empire v2.0 — implementar do zero em `src/components/ui/`, seguindo a paleta e tipografia definidas no documento de design.
