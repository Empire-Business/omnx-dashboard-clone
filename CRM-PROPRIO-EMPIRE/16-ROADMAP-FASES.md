# 16 — Roadmap por Fases

> **O que este documento cobre:** Em que ordem construir o Empire CRM, o que é MVP (mínimo para funcionar), o que vem depois, e como priorizar.

---

## Filosofia de Priorização

**Regra de ouro:** Construa o que você USARIA AMANHÃ primeiro. Não construa features que "seriam legais ter" antes das features sem as quais o sistema não funciona.

**Critério de priorização:**
1. **Crítico:** Sem isso, o sistema não pode substituir o GHL
2. **Alto:** Sem isso, a experiência é muito pior que o GHL
3. **Médio:** Melhora a vida, mas pode esperar
4. **Baixo:** "Nice to have", futuro

---

## FASE 1 — MVP (Meses 1-3)

**Objetivo:** Um sistema funcional que possa receber novos leads e que os SDRs consigam usar no dia a dia.

**O que está no MVP:**

### Backend e Infraestrutura
- [ ] Setup do projeto Supabase (novo projeto)
- [ ] Schema completo do banco (migrations)
- [ ] RLS em todas as tabelas
- [ ] Edge Functions: webhook-whatsapp, api
- [ ] Sistema de autenticação (email/senha)
- [ ] Multi-workspace básico

### CRM Core
- [ ] CRUD de contatos (criar, editar, ver, buscar)
- [ ] Histórico de atribuição (UTMs/clicks) — tabela contato_atribuicoes
- [ ] Edição manual de UTMs (individual e em massa) com auditoria
- [ ] CRUD de oportunidades
- [ ] Pipelines customizáveis
- [ ] Stages com tipos automáticos (conectado, agendado, fechado, perdido)
- [ ] Tags por contato
- [ ] Timeline de atividades básica

### Inbox Unificado
- [ ] Integração UAZAPI (receber + enviar mensagens WhatsApp)
- [ ] Lista de conversas em tempo real (Supabase Realtime)
- [ ] Histórico de mensagens por contato
- [ ] Templates de mensagem básicos
- [ ] Auto-tag "conectado" ao receber mensagem

### Construtor de Formulários
- [ ] Form builder drag-and-drop (campos básicos)
- [ ] Captura de UTM automática
- [ ] API de submissão pública
- [ ] Embed via script JS e iframe
- [ ] Deduplicação por email/telefone

### API Pública
- [ ] API keys por workspace
- [ ] Endpoints: contatos (CRUD), oportunidades (CRUD), formulários (submit)
- [ ] Rate limiting básico

### Controle de Acesso
- [ ] Roles: Owner, Admin, SDR, Closer, Viewer
- [ ] Filtro de dados por SDR
- [ ] Convite de membros por email

### Design e UX
- [ ] DS1 Silver Empire v2.0 implementado
- [ ] Layout responsivo (desktop + tablet)
- [ ] Sidebar com navegação principal
- [ ] Toasts de feedback (sonner)

**Entregável do MVP:** SDRs conseguem receber leads via formulário, ver no inbox, responder pelo WhatsApp, e mover no pipeline — tudo em um sistema só.

---

## FASE 2 — Comunicação Completa + Automações (Meses 4-5)

**Objetivo:** Experiência de comunicação completa e automações básicas de fluxo.

### Comunicações
- [ ] WhatsApp API Oficial (Meta Cloud API)
- [ ] Janela de 24h respeitada
- [ ] Templates HSM (criação e envio para aprovação)
- [ ] SMS (via Twilio ou Sinch)
- [ ] Email (via Resend)
- [ ] Instagram DM (via Meta Graph API)
- [ ] Notificação sonora + badge de não-lidos

### Automações Básicas
- [ ] Triggers: contato.criado, tag.adicionada, stage.mudou
- [ ] Ações: enviar_mensagem, adicionar_tag, notificar_usuario
- [ ] Delay simples (aguardar X horas)
- [ ] Histórico de execução

### Webhooks de Saída
- [ ] Criação de webhooks ilimitados
- [ ] Payload configurável
- [ ] Retry automático (5 tentativas, backoff exponencial)
- [ ] Log de entregas

---

## FASE 3 — Automações Avançadas + ActiveCampaign (Meses 6-7)

**Objetivo:** Automações visuais completas e integração bidirecional com ActiveCampaign.

### Workflow Builder
- [ ] Interface drag-and-drop visual
- [ ] Todos os triggers disponíveis
- [ ] Todas as ações disponíveis
- [ ] Condições if/else
- [ ] Sequências com delay respeitando horário comercial
- [ ] Proteção anti-loop
- [ ] Teste de automação (modo sandbox)

### ActiveCampaign
- [ ] Sync bidirecional de contatos
- [ ] Sync de tags
- [ ] Webhook AC → Empire CRM
- [ ] Disparar automação no AC como ação do workflow

### Importação Avançada
- [ ] Importação via CSV com mapeamento visual
- [ ] Deduplicação em massa
- [ ] Validação e relatório de erros

---

## FASE 4 — Enterprise + Solidificação (Meses 8-9)

**Objetivo:** Funcionalidades enterprise para uso estável em larga escala. A migração de dados de sistemas antigos (ex: GHL) é uma tarefa opcional desta fase, executada somente se necessário.

### Features Enterprise
- [ ] SSO via Google OAuth
- [ ] Audit log (quem fez o quê, quando)
- [ ] Exportação de dados (CSV, JSON)
- [ ] Backup e restore por workspace
- [ ] SLA de resposta para suporte

### API Avançada
- [ ] SDK TypeScript (npm package)
- [ ] Documentação interativa (OpenAPI/Swagger)
- [ ] Webhooks de entrada com mapeamento avançado
- [ ] Rate limiting configurável por workspace

### Importação de Dados Históricos (Opcional)
- [ ] Ferramenta de importação via CSV (contatos + oportunidades)
- [ ] Script de migração do GHL (para quem vem do GHL) — ver documento 15
- [ ] Script de migração de outros CRMs (Pipedrive, HubSpot, Salesforce)
- [ ] Interface de validação pós-importação

> **Nota:** Esta seção só é relevante se você precisar trazer histórico de outro sistema. O Empire CRM funciona 100% sem ela.

---

## FASE 5 — Futuro / Backlog

Features que serão avaliadas conforme necessidade:

- [ ] App mobile nativo (iOS/Android)
- [ ] Integração Google Ads API
- [ ] VoIP nativo (discagem pelo CRM)
- [ ] Webchat (chat ao vivo no site)
- [ ] Chat interno entre membros da equipe
- [ ] Relatórios customizáveis (drag-and-drop)
- [ ] Inteligência Artificial: resumo automático de conversas
- [ ] Score preditivo de fechamento (ML)
- [ ] Integração TikTok Ads

---

## Cronograma Estimado

```
Mês 1:   Setup + CRM Core (contatos, oportunidades, pipelines)
Mês 2:   Inbox UAZAPI + Formulários + API básica
Mês 3:   Testes do MVP + ajustes + primeiros leads reais
Mês 4:   WhatsApp Oficial + SMS + Email
Mês 5:   Automações básicas + Workflow Builder inicial
Mês 6:   Workflow Builder completo
Mês 7:   ActiveCampaign + Importação CSV
Mês 8:   Enterprise (SSO, audit log, backup/restore)
Mês 9:   API avançada (SDK, OpenAPI) + importação histórica (se necessário)
Mês 10+: Features futuras (app mobile, VoIP, IA)
```

---

## Critérios de Go-Live do MVP (Fim da Fase 1)

Para considerar o MVP pronto para uso real:

- [ ] 100 leads criados via formulário → aparecem no CRM
- [ ] SDR consegue ver, filtrar e responder leads via inbox em < 5 cliques
- [ ] Mensagem WhatsApp enviada pelo CRM chega ao lead em < 5 segundos
- [ ] Nenhum lead "desaparece" (sem pipeline_id NULL, sem dados truncados)
- [ ] API de criação de lead funciona e retorna `contact_id` e `opportunity_id`
- [ ] 3 SDRs usando o sistema por 5 dias úteis consecutivos sem reclamação crítica

---

*Fim do Roadmap — Voltar ao [PRD Principal](./PRD.md)*
