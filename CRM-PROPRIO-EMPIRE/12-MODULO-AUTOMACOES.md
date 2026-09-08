# 12 — Módulo: Automações

> **O que este documento cobre:** O sistema de automações do Empire CRM — workflow builder visual, triggers disponíveis, ações possíveis, delays, condições, sequências de mensagens e histórico de execução.

---

## O que são Automações?

**Automações** são sequências de ações que acontecem automaticamente quando algum evento ocorre.

**Analogia:** Pense numa linha de produção de fábrica. Quando um produto chega na esteira (trigger), a máquina executa uma série de operações (ações) sem precisar de uma pessoa operando. No CRM, quando um lead chega (trigger), a automação executa ações (enviar WhatsApp, adicionar tag, notificar SDR) sem ninguém precisar fazer manualmente.

**Exemplo simples:**
```
TRIGGER: Novo lead chega pelo formulário
AÇÃO 1:  Adicionar tag "novo-lead"
AÇÃO 2:  Aguardar 5 minutos
AÇÃO 3:  Enviar WhatsApp: "Oi {{nome}}! Vi que você se inscreveu..."
AÇÃO 4:  Notificar SDR Karina no Slack
```

---

## 1. Interface do Workflow Builder

```
┌──────────────────────────────────────────────────────────────────────┐
│  Automação: Boas-vindas MQL                          [Ativo ●]      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│         ┌─────────────────────┐                                      │
│         │ ⚡ TRIGGER           │                                      │
│         │ Tag adicionada      │                                      │
│         │ Tag: "mql"          │                                      │
│         └──────────┬──────────┘                                      │
│                    │                                                  │
│         ┌──────────▼──────────┐                                      │
│         │ 📱 ENVIAR MENSAGEM   │                                      │
│         │ Canal: WhatsApp      │                                      │
│         │ "Oi {{nome}}! Você  │                                      │
│         │  acabou de entrar   │                                      │
│         │  na nossa lista..." │                                      │
│         └──────────┬──────────┘                                      │
│                    │                                                  │
│         ┌──────────▼──────────┐                                      │
│         │ ⏱ AGUARDAR           │                                      │
│         │ 2 horas              │                                      │
│         └──────────┬──────────┘                                      │
│                    │                                                  │
│         ┌──────────▼──────────┐                                      │
│         │ ❓ CONDIÇÃO          │                                      │
│         │ SDR respondeu?      │                                      │
│         └────┬──────────┬─────┘                                      │
│              │ SIM       │ NÃO                                        │
│    ┌─────────▼──┐   ┌───▼───────────┐                                │
│    │ ✓ NADA     │   │ 🔔 NOTIFICAR   │                                │
│    │ (terminar) │   │ SDR: urgente! │                                │
│    └────────────┘   └───────────────┘                                │
│                                                                      │
│  [+ Adicionar Passo]                  [Salvar]  [Testar]  [Ativar]   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Triggers (O que dispara a automação)

### 2.1 Triggers de Contato

| Trigger | Quando ocorre | Configuração |
|---------|--------------|-------------|
| Contato criado | Novo contato inserido | Filtros: canal de origem, UTM |
| Tag adicionada | Tag específica adicionada | Qual tag: "mql", "conectado", etc. |
| Tag removida | Tag específica removida | Qual tag |
| Campo atualizado | Campo específico mudou | Qual campo, de/para qual valor |

### 2.2 Triggers de Oportunidade

| Trigger | Quando ocorre | Configuração |
|---------|--------------|-------------|
| Oportunidade criada | Nova oportunidade aberta | Pipeline específico? |
| Stage mudou | Oportunidade movida de stage | De qual stage? Para qual stage? |
| Oportunidade fechada | Status → "won" | — |
| Oportunidade perdida | Status → "lost" | Motivo de perda específico? |

### 2.3 Triggers de Comunicação

| Trigger | Quando ocorre | Configuração |
|---------|--------------|-------------|
| Mensagem recebida | Mensagem inbound | Canal específico? Contém palavra? |
| Formulário submetido | Submissão processada | Formulário específico? |

### 2.4 Triggers de Tempo

| Trigger | Quando ocorre | Configuração |
|---------|--------------|-------------|
| Data relativa | X dias após criação do lead | Quantos dias? |
| Sem atividade | X dias sem comunicação | Quantos dias? |
| Horário agendado | Cron (todo dia às 9h, etc.) | Cron expression |

---

## 3. Condições (Filtros de Execução)

A automação só executa se as condições forem verdadeiras:

```
Exemplos de condições:

"Apenas executar se o lead for MQL"
→ Campo: contato.tags  Operador: contém  Valor: mql

"Apenas executar se o lead veio do Facebook"
→ Campo: contato.utm_source  Operador: é igual a  Valor: facebook

"Apenas executar se está no pipeline Pré-Vendas"
→ Campo: oportunidade.pipeline_nome  Operador: é igual a  Valor: Pré-Vendas MQL

"Apenas executar se o SDR ainda não respondeu"
→ Campo: contato.ultima_mensagem_outbound  Operador: não existe  

Operadores disponíveis:
- é igual a / não é igual a
- contém / não contém
- está vazio / não está vazio
- é maior que / é menor que (para números e datas)
```

---

## 4. Ações Disponíveis

### 4.1 Comunicação

**Enviar Mensagem:**
```json
{
  "tipo": "enviar_mensagem",
  "canal": "whatsapp",         // "whatsapp" | "sms" | "email"
  "template_id": "uuid",       // Template pré-definido
  "mensagem": "Oi {{nome}}, tudo bem?",  // Ou mensagem livre
  "instance_id": "uuid"        // Instância UAZAPI (opcional)
}
```

**Variáveis disponíveis na mensagem:**
```
{{nome}}            → Nome do contato
{{email}}           → Email
{{telefone}}        → Telefone
{{sdr_nome}}        → Nome do SDR responsável
{{pipeline}}        → Nome do pipeline atual
{{stage}}           → Nome da stage atual
{{data_hoje}}       → Data atual (15/04/2026)
{{link_agenda}}     → Link do Calendly do workspace
{{workspace_nome}}  → Nome do workspace
```

### 4.2 CRM

**Adicionar Tag:**
```json
{ "tipo": "adicionar_tag", "tags": ["mql", "quente"] }
```

**Remover Tag:**
```json
{ "tipo": "remover_tag", "tags": ["frio"] }
```

**Mover de Stage:**
```json
{ "tipo": "mover_stage", "stage_id": "uuid-stage-qualificado" }
```

**Atualizar Campo:**
```json
{ "tipo": "atualizar_campo", "campo": "sdr_name", "valor": "Karina Lima" }
```

**Criar Tarefa:**
```json
{
  "tipo": "criar_tarefa",
  "titulo": "Ligar para {{nome}} amanhã",
  "responsavel_id": "{{sdr_id}}",
  "prazo_horas": 24
}
```

### 4.3 Notificações

**Notificar Usuário:**
```json
{
  "tipo": "notificar_usuario",
  "usuario_id": "{{owner_id}}",
  "mensagem": "Lead {{nome}} está {{dias_sem_resposta}} dias sem resposta!",
  "urgencia": "alta"            // "normal" | "alta"
}
```

**Enviar Email Interno:**
```json
{
  "tipo": "email_interno",
  "para": "ops@empire.com",
  "assunto": "Novo MQL — {{nome}}",
  "corpo": "Lead {{nome}} ({{email}}) acabou de ser qualificado como MQL."
}
```

### 4.4 Controle de Fluxo

**Aguardar:**
```json
{ "tipo": "aguardar", "horas": 24 }  // Esperar X horas antes do próximo passo
```

**Condição (if/else):**
```json
{
  "tipo": "condicao",
  "campo": "contato.tags",
  "operador": "contem",
  "valor": "mql",
  "proximo_sim": "uuid-step-A",
  "proximo_nao": "uuid-step-B"
}
```

**Terminar:**
```json
{ "tipo": "terminar" }  // Encerra a automação para este contato
```

### 4.5 Integrações

**Chamar Webhook:**
```json
{
  "tipo": "webhook",
  "url": "https://n8n.meudominio.com/webhook/abc",
  "method": "POST",
  "payload": {
    "nome": "{{nome}}",
    "email": "{{email}}",
    "evento": "novo_mql"
  }
}
```

**ActiveCampaign:**
```json
{
  "tipo": "activecampaign",
  "acao": "adicionar_lista",  // "adicionar_lista" | "disparar_automacao" | "adicionar_tag"
  "lista_id": "123"
}
```

---

## 5. Delays e Horário de Envio

**RF-AUT-001:** Delays são configuráveis em minutos, horas ou dias.

**RF-AUT-002:** Horário de envio respeitado:
```
Aguardar 2 horas + enviar só em horário comercial

Configuração:
- Dias: Segunda a Sexta
- Horário: 09h - 18h (America/Sao_Paulo)

Comportamento:
- Se o delay terminar às 22h → mensagem vai para fila
- Mensagem sai no próximo dia útil às 09h
```

---

## 6. Sequências de Mensagens (Drip)

Uma automação pode ser uma sequência longa de mensagens ao longo de dias:

```
Automação: "Nurturing 14 dias"
─────────────────────────────────
Dia 0  (Imediato): WhatsApp boas-vindas
Dia 1  (+24h):     WhatsApp com case de sucesso
Dia 3  (+2 dias):  WhatsApp com pergunta de qualificação
       → SE respondeu: notificar SDR + parar sequência
       → SE não respondeu: continuar
Dia 5  (+2 dias):  WhatsApp com vídeo de prova social
Dia 7  (+2 dias):  WhatsApp com convite para call
       → SE agendou: tag "agendado" + parar sequência
       → SE não agendou: continuar
Dia 10 (+3 dias):  Email de nurturing longo
Dia 14 (+4 dias):  WhatsApp "última tentativa"
       → Nenhuma resposta: tag "inativo" + parar sequência
```

---

## 7. Histórico de Execução

Cada execução da automação é registrada:

```
Automação "Boas-vindas MQL" — Histórico

┌─────────────────┬──────────────┬────────────┬─────────────────────┐
│ Contato         │ Iniciou em   │ Status     │ Último passo        │
├─────────────────┼──────────────┼────────────┼─────────────────────┤
│ João Silva      │ 15/04 14:32  │ ✓ Completo │ WhatsApp enviado    │
│ Maria Costa     │ 15/04 11:15  │ ⏳ Aguard.  │ Aguardando 2h...   │
│ Pedro Lima      │ 14/04 09:00  │ ✗ Erro     │ Falha no WhatsApp   │
│ Ana Santos      │ 14/04 08:30  │ ⏸ Parado   │ Condição: não MQL  │
└─────────────────┴──────────────┴────────────┴─────────────────────┘
```

Ao clicar em um contato: ver log detalhado de cada passo executado.

---

## 8. Proteção Anti-Loop

**RF-AUT-003:** Uma automação não pode disparar para o mesmo contato mais de uma vez por hora (por padrão). Isso evita loops infinitos.

**Exemplo de loop que precisamos prevenir:**
```
Automação A: quando tag "novo" adicionada → adiciona tag "ativo"
Automação B: quando tag "ativo" adicionada → adiciona tag "novo"
→ Loop infinito!
```

**Solução:** Cada automação registra quando foi executada para cada contato. Se tentativa de re-executar dentro de 1 hora → ignorar.

---

## 9. Critérios de Aceite

- [ ] Criação de automação pelo workflow builder funciona (drag-and-drop)
- [ ] Trigger "tag adicionada" dispara dentro de 30 segundos do evento
- [ ] Envio de WhatsApp pela automação chega ao lead
- [ ] Delay de "aguardar 24h" respeita horário comercial configurado
- [ ] Condição if/else funciona corretamente
- [ ] Histórico de execução mostra cada passo com timestamp
- [ ] Proteção anti-loop previne execuções repetidas dentro de 1h
- [ ] Automação pode ser pausada/ativada sem perder as execuções em andamento
- [ ] Teste de automação executa sem criar dados reais (modo sandbox)

---

*Próximo: [13 — Módulo Metas](./13-MODULO-METAS.md)*
