# Empire CRM — Módulo: SDR IA & Modos de Atendimento

> **Versão:** 1.0  
> **Data:** Abril/2026  
> **Status:** Em elaboração  
> **Pré-requisito:** Leia [`07-INTEGRACAO-WHATSAPP.md`](./07-INTEGRACAO-WHATSAPP.md) e [`06-MODULO-COMUNICACOES.md`](./06-MODULO-COMUNICACOES.md) antes deste documento.

---

## O que é este módulo?

Este documento especifica o **sistema de SDR IA e os três modos de atendimento** do Empire CRM — a forma como o sistema responde a leads de forma automática, semi-automática ou completamente humana.

**Analogia simples:** Imagine que você tem uma equipe de vendas. Às vezes quem responde o lead é uma pessoa (SDR humano). Às vezes é um robô treinado (SDR IA). Às vezes é uma pessoa que tem um assistente apontando o que ela deve escrever (humano + IA). O Empire CRM suporta os três modos, e você pode escolher qual usar para cada pipeline, número de WhatsApp, ou até por horário do dia.

---

## Os Três Modos de Atendimento

### Modo 1 — SDR Humano

O atendimento é feito 100% pelo SDR humano. O sistema apenas:
- Recebe mensagens e exibe no inbox
- Notifica o SDR de novas mensagens
- Fornece contexto do lead ao lado da conversa (stage, histórico, score)
- Respeita SLA de resposta e alerta quando exceder o prazo

**Quando usar:** Times que preferem controle total, leads de alto valor onde personalização extrema é essencial, ou pipelines de fechamento onde o closer conduz pessoalmente.

### Modo 2 — SDR IA (Totalmente Autônomo)

O atendimento é feito 100% pelo agente de IA. O sistema:
- Recebe mensagens, processa com o LLM via OpenRouter
- Responde automaticamente humanizando o texto (delays, divisão em partes, indicadores de digitação)
- Qualifica o lead usando BANT (Budget, Authority, Need, Timeline)
- Agenda reuniões consultando a disponibilidade do Closer
- Move o lead pelo pipeline automaticamente
- Cria cadências de follow-up automáticas
- Transfere para humano quando detecta necessidade

**Quando usar:** Alto volume de leads onde é impossível ter SDR para cada um, leads frios de remarketing, atendimento fora do horário comercial, ou quando você quer escalar sem contratar.

### Modo 3 — Humano com IA de Suporte

O atendimento é feito pelo SDR humano, mas com assistência ativa da IA:
- **Sugestões de resposta:** IA gera 2–3 opções de resposta para o SDR clicar e adaptar
- **Automações de mensagem:** Sequências programadas (follow-up D+1, D+3, D+7) enviadas automaticamente, mas o SDR pode pausar ou editar
- **Copiloto lateral:** Painel lateral com resumo do lead, próximos passos sugeridos, alertas de objeções detectadas
- **Templates inteligentes:** IA escolhe o template mais adequado baseado no contexto da conversa

**Quando usar:** SDRs experientes que querem produtividade sem abrir mão do controle. O SDR responde mais rápido porque não escreve do zero — apenas revisa e aprova as sugestões.

---

## Configuração por Número (Multi-instância)

Cada número de WhatsApp conectado ao Empire CRM pode ter seu próprio modo de atendimento:

| Número | Modo | Agente IA | Uso típico |
|--------|------|-----------|-----------|
| +55 11 9xxxx-0001 | SDR IA | Ana (Copilot) | Leads frios, horário noturno |
| +55 11 9xxxx-0002 | Humano + IA | — | SDR Karina (suporte IA) |
| +55 11 9xxxx-0003 | Humano | — | Closer Rafael (reuniões) |
| +244 9xx-xxx-xxx | SDR IA | Ana (Angola) | Mercado Angola |

**Suporte a múltiplos números:**
- **UAZAPI:** Ilimitado — cada número é uma instância UAZAPI separada. Cada uma tem seu próprio QR Code, sessão WhatsApp Web e configurações.
- **Meta Cloud API:** Ilimitado — cada número de telefone registrado no WABA (WhatsApp Business Account) é uma instância. Cada uma precisa de aprovação da Meta.

Você pode conectar quantos números quiser em ambas as integrações, e cada um pode ter um modo e agente diferentes.

---

## Integração de IA via OpenRouter

### Por que OpenRouter e não API direta

O Empire CRM usa **OpenRouter** como gateway unificado para todos os modelos de IA. Isso significa:

1. **Uma chave de API, todos os modelos:** Com uma única chave OpenRouter, você acessa Claude, GPT-4, Gemini, Llama, Mistral e centenas de outros modelos sem gerenciar múltiplas chaves.
2. **Troca de modelo sem deploy:** Mude o modelo do agente SDR IA pela UI — sem mexer em código ou variáveis de ambiente.
3. **Custo otimizado:** O OpenRouter mostra o custo por token de cada modelo em tempo real. Você escolhe o melhor custo-benefício para cada caso.
4. **Fallback automático:** Se um modelo estiver fora do ar, OpenRouter redireciona para o próximo disponível.

### Configuração

```
Configurações → Integrações → OpenRouter
  → Chave de API: sk-or-v1-xxxx
  → Salvar
```

A chave fica armazenada na tabela `integration_keys` (criptografada), nunca no código.

### Modelos recomendados por uso

| Caso de uso | Modelo recomendado | Custo relativo |
|-------------|-------------------|----------------|
| SDR IA (resposta conversacional) | `anthropic/claude-sonnet-4-6` | Médio |
| Sugestões rápidas no inbox | `anthropic/claude-haiku-4-5` | Baixo |
| Análise de conversa complexa | `anthropic/claude-opus-4-6` | Alto |
| Fallback econômico | `mistralai/mistral-large` | Baixo |
| Qualquer modelo personalizado | Qualquer modelo do OpenRouter | Variável |

**Regra:** O modelo é configurável por agente na UI. Não existe modelo fixo no código.

### Padrão de chamada via OpenRouter

```typescript
// Usando OpenRouter como base_url do SDK Anthropic
import Anthropic from '@anthropic-ai/sdk'

const openrouterKey = await getIntegrationKey('openrouter', 'api_key')

const client = new Anthropic({
  apiKey: openrouterKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://app.empirecrm.com',
    'X-Title': 'Empire CRM SDR IA',
  }
})

const response = await client.messages.create({
  model: agent.model,  // ex: "anthropic/claude-sonnet-4-6"
  max_tokens: agent.max_tokens,
  temperature: agent.temperature,
  system: systemPrompt,
  messages: conversationHistory,
  tools: agentTools,
})
```

---

## Arquitetura do Agente SDR IA

### Princípios de design

O agente **não é um chatbot genérico**. É um vendedor com função (tools) e autonomia limitada:

- **Um agente por workspace** como padrão, mas suporta múltiplos agentes com escopos diferentes (ex: um agente para leads frios, outro para leads quentes)
- **Temperature 0.7** — conversacional sem alucinar
- **Máximo 5 iterações de tool calls** por resposta — evita loops infinitos
- **max_tokens: 4096** — respostas longas o suficiente para qualificação completa

### Banco de dados — Tabela `ai_sales_agents`

```sql
CREATE TABLE ai_sales_agents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  name                  TEXT NOT NULL,
  description           TEXT,
  system_prompt         TEXT NOT NULL,
  personality_traits    JSONB,        -- ex: ["acolhedora", "direta", "objetiva"]
  target_stages         TEXT[],       -- stages onde o agente atua
  model                 TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4-6',
  temperature           NUMERIC DEFAULT 0.7,
  max_tokens            INTEGER DEFAULT 4096,
  is_active             BOOLEAN DEFAULT true,
  cadence_steps         JSONB,        -- sequências de follow-up por stage
  settings              JSONB,        -- configurações de comportamento
  created_by            UUID REFERENCES workspace_members(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Settings do agente (JSONB)

```json
{
  "working_hours_start": "08:00",
  "working_hours_end": "23:00",
  "working_days": [1, 2, 3, 4, 5, 6],
  "response_delay_min_ms": 2000,
  "response_delay_max_ms": 5000,
  "debounce_seconds": 30,
  "message_split_max_length": 300,
  "max_messages_per_conversation": 50,
  "auto_pause_when_human_replies": true,
  "typing_speed_cpm": 300,
  "rate_limit_per_hour": 20,
  "rate_limit_per_day": 100,
  "lock_duration_ms": 180000,
  "max_retries": 3,
  "batch_size": 10,
  "meeting_duration_minutes": 30,
  "context_history_limit": 50,
  "fallback_message": "Desculpe, tive um probleminha técnico. Já aviso um de nossos consultores! 🙏"
}
```

---

## Sistema de Tools (Function Calling)

O agente precisa **agir**, não apenas conversar. Ferramentas permitem que o agente execute ações reais no CRM enquanto conversa.

### As 9 ferramentas essenciais

| Tool | action_type | Por que é crítica |
|------|-------------|------------------|
| `qualify_bant` | `qualify_bant` | Registra qualificação BANT + calcula score do lead |
| `update_lead` | `update_lead` | Atualiza dados do lead (nome, email, Instagram, empresa) |
| `check_availability` | `check_availability` | Verifica agenda do Closer antes de oferecer horário |
| `schedule_meeting` | `schedule_meeting` | Agenda reunião — o objetivo FINAL do SDR |
| `reschedule_meeting` | `reschedule_meeting` | Reagendar/cancelar — leads pedem muito |
| `change_stage` | `change_stage` | Move o lead no funil — progresso visível no CRM |
| `notify_human` | `notify_human` | Transferência humana — saber quando parar é tão importante quanto persistir |
| `mark_lost` | `mark_lost` | Marcar como perdido — o agente precisa saber quando não é o cliente ideal |
| `schedule_followup` | `schedule_followup` | Agendar follow-up futuro — "me liga semana que vem" |

### Banco de dados — Tabela `ai_agent_tools`

```sql
CREATE TABLE ai_agent_tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,
  agent_id      UUID NOT NULL REFERENCES ai_sales_agents(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,   -- O Claude lê isso para decidir QUANDO usar
  parameters    JSONB NOT NULL,   -- JSON Schema dos parâmetros de entrada
  action_type   TEXT NOT NULL,   -- ação mapeada no servidor
  action_config JSONB,
  priority      INTEGER DEFAULT 10,
  is_active     BOOLEAN DEFAULT true
);
```

### Exemplo de definição de tool

```json
{
  "name": "qualify_bant",
  "description": "Registra a qualificação BANT de um lead. Use quando descobrir informações sobre orçamento, autoridade de decisão, necessidade ou prazo de compra.",
  "parameters": {
    "type": "object",
    "properties": {
      "budget": { "type": "string", "description": "Orçamento disponível" },
      "authority": { "type": "string", "description": "Nível de autoridade de decisão" },
      "need": { "type": "string", "description": "Principal necessidade/dor do lead" },
      "timeline": { "type": "string", "description": "Prazo para decisão" },
      "company_name": { "type": "string", "description": "Nome da empresa" },
      "monthly_revenue": { "type": "string", "description": "Faturamento mensal" },
      "employee_count": { "type": "number", "description": "Número de funcionários" }
    }
  }
}
```

**Lições sobre tools:**
- Cada tool TEM que ter `description` clara para o modelo entender QUANDO usá-la
- Tool calls são logadas e visíveis no chat (mensagens de sistema com emoji) — transparência total para o time de vendas
- `schedule_meeting` exige email — o agente pergunta antes de executar, nunca agenda incompleto
- O loop de tool calls é limitado a 5 iterações para evitar loops infinitos

---

## Debounce e Fila de Processamento

**O erro #1 do SDR IA:** responder antes do lead terminar de digitar.

### O problema

Se o lead manda 3 mensagens em 10 segundos ("Oi", "Tudo bem?", "Quero saber o preço"), você NÃO quer que o agente processe 3 vezes. Você quer que ele espere o lead terminar e responda com contexto completo.

### Fluxo com debounce

```
Mensagem inbound do lead
  → Salva em comunicacoes (inbound)
  → Trigger DB: enqueue_message_for_ai_agent()
    → Cancela TODAS as mensagens pendentes anteriores do mesmo lead
    → Cria nova entrada com scheduled_for = now + 30s (debounce)
  → Fire-and-forget POST para edge function ai-sdr-agent
```

### Banco de dados — Tabela `ai_agent_message_queue`

```sql
CREATE TABLE ai_agent_message_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,
  contato_id       UUID NOT NULL REFERENCES contatos(id),
  comunicacao_id   UUID REFERENCES comunicacoes(id),
  conversa_id      UUID,
  message_content  TEXT NOT NULL,
  scheduled_for    TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  attempts         INTEGER DEFAULT 0,
  max_attempts     INTEGER DEFAULT 3,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

### Funções SQL críticas

```sql
-- Inserir na fila com debounce (cancela anteriores do mesmo lead)
CREATE OR REPLACE FUNCTION enqueue_message_for_ai_agent(
  p_workspace_id  UUID,
  p_contato_id    UUID,
  p_comunicacao_id UUID,
  p_content       TEXT,
  p_debounce_seconds INT DEFAULT 30
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  -- Cancela pendentes anteriores do mesmo lead
  UPDATE ai_agent_message_queue
  SET status = 'cancelled', updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND contato_id = p_contato_id
    AND status = 'pending';

  -- Insere nova entrada com debounce
  INSERT INTO ai_agent_message_queue
    (workspace_id, contato_id, comunicacao_id, message_content, scheduled_for)
  VALUES
    (p_workspace_id, p_contato_id, p_comunicacao_id, p_content,
     now() + (p_debounce_seconds * INTERVAL '1 second'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Claim atômico (evita processamento duplicado entre workers)
CREATE OR REPLACE FUNCTION claim_queue_messages(p_batch_size INT DEFAULT 10)
RETURNS TABLE(id UUID, workspace_id UUID, contato_id UUID, message_content TEXT)
AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_agent_message_queue q
  SET status = 'processing', updated_at = now()
  FROM (
    SELECT id FROM ai_agent_message_queue
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) sub
  WHERE q.id = sub.id
  RETURNING q.id, q.workspace_id, q.contato_id, q.message_content;
END;
$$ LANGUAGE plpgsql;

-- Recovery: reseta mensagens travadas em 'processing' há mais de 3 min
CREATE OR REPLACE FUNCTION process_ai_agent_queue() RETURNS VOID AS $$
BEGIN
  UPDATE ai_agent_message_queue
  SET status = 'pending', updated_at = now()
  WHERE status = 'processing'
    AND updated_at < now() - INTERVAL '3 minutes';
END;
$$ LANGUAGE plpgsql;
```

### Lock por lead (evita processamento duplicado)

```sql
-- Adicionar em conversas (ou tabela dedicada)
ALTER TABLE ai_agent_conversations ADD COLUMN processing_lock_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION try_acquire_agent_lock(
  p_contato_id UUID,
  p_lock_duration_ms INT DEFAULT 180000  -- 3 minutos
) RETURNS BOOLEAN AS $$
DECLARE v_result BOOLEAN;
BEGIN
  UPDATE ai_agent_conversations
  SET processing_lock_until = now() + (p_lock_duration_ms * INTERVAL '1 millisecond')
  WHERE contato_id = p_contato_id
    AND (processing_lock_until IS NULL OR processing_lock_until < now())
  RETURNING true INTO v_result;

  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_agent_lock(p_contato_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE ai_agent_conversations
  SET processing_lock_until = NULL
  WHERE contato_id = p_contato_id;
END;
$$ LANGUAGE plpgsql;
```

---

## Humanização das Mensagens

**O lead NÃO pode sentir que está falando com um robô.**

### A sequência completa de humanização

```
1. Delay pré-resposta: 2–5 segundos aleatórios
   (simula o tempo de ler e pensar)

2. Indicador de digitação: envia /composing via WhatsApp
   (mostra "digitando..." para o lead)

3. Simulação de digitação: (tamanho / 300 CPM) × 60.000ms, máximo 8s
   (simula velocidade de digitação humana)

4. Divisão em partes:
   - Primeiro quebra por parágrafos
   - Depois por frases (quando exceder 300 chars)
   - Cada parte vira uma bolha separada no WhatsApp

5. Delay entre partes: 0,5–1,5 segundos
   (simula o tempo entre enviar uma mensagem e outra)

6. Rate limiting: máximo por hora e por dia por instância
```

### Exemplo antes e depois

**Sem humanização:**
```
Agente envia: "Oi Maria! Tudo bem? 
Posso te ajudar com informações sobre nossos serviços. 
Qual é o seu principal interesse?" — imediatamente, tudo junto

→ Parece robô
```

**Com humanização:**
```
→ 3s de delay
→ Envia "digitando..."
→ 2s de simulação de digitação
→ Envia "Oi Maria! Tudo bem?"
→ 1s de delay
→ "digitando..."
→ 3s de simulação
→ Envia "Posso te ajudar com informações sobre nossos serviços."
→ 1s de delay
→ "digitando..."
→ 2s de simulação
→ Envia "Qual é o seu principal interesse?"

→ Parece humano!
```

### Implementação (TypeScript)

```typescript
async function sendHumanizedResponse(
  text: string,
  contactPhone: string,
  instance: WhatsAppInstance,
  settings: AgentSettings
) {
  const delay = randomBetween(settings.response_delay_min_ms, settings.response_delay_max_ms)
  await sleep(delay)

  const parts = splitMessageIntoParts(text, settings.message_split_max_length)

  for (let i = 0; i < parts.length; i++) {
    // Indicador de digitação (mostra "digitando..." no WhatsApp)
    await sendTypingIndicator(instance, contactPhone, 3000)

    // Simular tempo de digitação humana
    const typingDelay = Math.min(
      (parts[i].length / settings.typing_speed_cpm) * 60000,
      8000
    )
    await sleep(typingDelay)

    // Enviar a parte
    await sendWhatsAppMessage(instance, contactPhone, parts[i])

    // Salvar no banco como mensagem outbound da IA
    await saveMessage(parts[i], contactId, 'ai_agent')

    // Delay entre partes
    if (i < parts.length - 1) {
      await sleep(randomBetween(500, 1500))
    }
  }
}
```

---

## Contexto Injetado no Prompt

O system prompt enviado ao modelo NÃO é apenas o texto que o usuário configurou. Ele inclui dinamicamente o contexto atual do lead:

```
[system_prompt configurado pelo usuário]

---
CONTEXTO ATUAL:

## Dados do Lead
- Nome: {contato.nome}
- Telefone: {contato.telefone}
- Email: {contato.email}
- Stage atual: {stage.nome}
- Score: {oportunidade.lead_quality_score}
- BANT: Budget={budget}, Authority={authority}, Need={need}, Timeline={timeline}
- Notas: {notas}
- Lead desde: {data_lead_recebido}

## Histórico de Mensagens (últimas 50)
[2026-04-15 10:32] Lead: "Oi, vi o anúncio de vocês"
[2026-04-15 10:33] Agente: "Olá! Que bom que você entrou em contato..."
[2026-04-15 10:33] Sistema: [TOOL] qualify_bant executado — Budget: "não informado"

## Tarefas e Reuniões
- [agendada] Reunião com Rafael Closer — 2026-04-20 às 14h

## Stages disponíveis no pipeline
novo: Novo Lead
conectado: Conectado
qualificado: Qualificado
agendado: Reunião Agendada
perdido: Perdido

---
INSTRUÇÕES IMPORTANTES:
- Responda em português do Brasil, de forma natural
- Mensagens curtas — máximo 300 caracteres por parte
- NÃO use markdown, asteriscos ou formatação especial
- Use emojis com moderação (máximo 1 por mensagem)
- Hoje é 2026-04-15. Horário de Brasília: 10:33
```

**Por que isso é fundamental:** Sem contexto, o agente repete perguntas, esquece o que o lead disse e parece um chatbot genérico. Com contexto, ele continua uma conversa coerente.

---

## Guardrails de Segurança

| Guardrail | Como funciona | Por que importa |
|-----------|---------------|-----------------|
| **Horário comercial** | Fora do horário, o agente loga mas NÃO responde. Mensagem de sistema é inserida no chat. | Ninguém quer receber msg de robô às 3h da manhã |
| **Rate limit** | Máximo de mensagens por hora e por dia por instância WhatsApp | Evita bloqueio do WhatsApp e spam |
| **Max mensagens por conversa** | Se exceder, transfere automaticamente para humano | Evita conversas infinitas sem resolução |
| **Auto-pause** | Se um atendente humano responder, o agente pausa automaticamente | Evita que agente e humano respondam ao mesmo tempo |
| **Fallback de erro** | Se a API falhar, envia mensagem amigável ao lead | Não deixa o lead sem resposta |
| **3 retries com backoff** | Se OpenRouter retornar 429, tenta até 3 vezes com delay exponencial | Resiliência contra rate limits da API |
| **Processing lock** | Lock por lead com timeout de 3 minutos | Evita processamento duplicado |
| **Queue recovery** | Mensagens em 'processing' por +3 min voltam para 'pending' | Recuperação automática de falhas |

### Banco de dados — Rate limiting

```sql
CREATE TABLE ai_agent_send_counts (
  instance_id    UUID NOT NULL,   -- FK whatsapp_instances
  window_start   TIMESTAMPTZ NOT NULL,
  window_type    TEXT NOT NULL,   -- 'hour' | 'day'
  message_count  INTEGER DEFAULT 0,
  UNIQUE (instance_id, window_start, window_type)
);
```

### Verificação de horário comercial

```typescript
function isWithinWorkingHours(settings: AgentSettings): boolean {
  const spTime = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  )
  const dayOfWeek = spTime.getDay()   // 0=Dom, 1=Seg...
  const currentMinutes = spTime.getHours() * 60 + spTime.getMinutes()

  const [startH, startM] = settings.working_hours_start.split(':').map(Number)
  const [endH, endM] = settings.working_hours_end.split(':').map(Number)

  return settings.working_days.includes(dayOfWeek)
    && currentMinutes >= (startH * 60 + startM)
    && currentMinutes <= (endH * 60 + endM)
}
```

---

## Cadência (Follow-up Automático)

**O SDR que não faz follow-up é SDR morto.**

Quando um lead entra em um stage do funil, ele é automaticamente matriculado na cadência daquele stage.

### Configuração de cadência (JSONB no agente)

```json
{
  "novo": [
    {
      "step_order": 0,
      "action_type": "ai_message",
      "content": "Envie uma mensagem de boas-vindas calorosa e pergunte qual é o principal interesse do lead",
      "delay_minutes": 5,
      "only_if_no_reply": false
    },
    {
      "step_order": 1,
      "action_type": "ai_message",
      "content": "Faça um follow-up amigável — o lead ainda não respondeu. Seja breve e direto.",
      "delay_minutes": 1440,
      "only_if_no_reply": true
    },
    {
      "step_order": 2,
      "action_type": "template_message",
      "content": "Olá! Vi que você demonstrou interesse. Ainda posso ajudar? 😊",
      "delay_minutes": 4320,
      "only_if_no_reply": true,
      "post_action": {
        "type": "move_stage",
        "target_stage": "perdido"
      }
    }
  ],
  "qualificado": [
    {
      "step_order": 0,
      "action_type": "ai_message",
      "content": "O lead está qualificado mas sem reunião agendada. Proponha uma reunião de 30 minutos.",
      "delay_minutes": 60,
      "only_if_no_reply": false
    }
  ]
}
```

### Banco de dados — Matrículas de cadência

```sql
CREATE TABLE ai_agent_cadence_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  contato_id      UUID NOT NULL REFERENCES contatos(id),
  oportunidade_id UUID REFERENCES oportunidades(id),
  agent_id        UUID NOT NULL REFERENCES ai_sales_agents(id),
  stage           TEXT NOT NULL,
  current_step    INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  -- 'active' | 'replied' | 'completed' | 'cancelled'
  next_action_at  TIMESTAMPTZ,
  enrolled_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contato_id, agent_id, stage)
);
```

### Regra crítica: lead responde → cadência para

```sql
-- Trigger em comunicacoes: quando lead responde, cancela cadência ativa
CREATE OR REPLACE FUNCTION cancel_cadence_on_reply() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE ai_agent_cadence_enrollments
    SET status = 'replied', updated_at = now()
    WHERE contato_id = NEW.contato_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cancel_cadence_on_reply
AFTER INSERT ON comunicacoes
FOR EACH ROW EXECUTE FUNCTION cancel_cadence_on_reply();
```

---

## Scoring BANT

A tool `qualify_bant` calcula automaticamente um score de 15 a 100:

| Critério | Pontos | Condição |
|----------|--------|----------|
| Nome da empresa | +15 | Se informou `company_name` |
| Número de funcionários | +10 | Se informou `employee_count` |
| Faturamento ≥ R$30k/mês | +25 | `monthly_revenue >= 30000` |
| Faturamento ≥ R$10k/mês | +15 | `monthly_revenue >= 10000` |
| Faturamento menor | +5 | `monthly_revenue < 10000` |
| Budget demonstrado | +15 | Se informou `budget` |
| Authority (decisor) | +10 | Se informou `authority` |
| Need (dor real) | +15 | Se informou `need` |
| Timeline (prazo definido) | +10 | Se informou `timeline` |

O sistema aceita formatos brasileiros: "R$ 30.000,00", "30k", "30mil", "30000".

---

## Transferência para Humano

O agente DEVE saber quando parar. A tool `notify_human` é acionada quando:

1. Lead pede explicitamente por uma pessoa
2. Conversa excede `max_messages_per_conversation`
3. Situação fora do escopo do agente
4. Lead qualificado pronto para negociação complexa
5. Qualquer situação que o prompt não cobre

### O que acontece ao transferir

1. Status da conversa muda para `transferred`
2. Mensagem de sistema inserida no chat: "🤝 Transferido para atendimento humano — Motivo: [razão]"
3. SDR humano recebe notificação push: "Lead [Nome] aguarda atendimento"
4. O agente PARA completamente de responder
5. Para reativar o agente: botão "Retomar IA" no inbox

---

## Banco de Dados — Tabelas Completas

```sql
-- Conversas do agente por lead
CREATE TABLE ai_agent_conversations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL,
  contato_id              UUID NOT NULL REFERENCES contatos(id),
  oportunidade_id         UUID REFERENCES oportunidades(id),
  agent_id                UUID NOT NULL REFERENCES ai_sales_agents(id),
  status                  TEXT NOT NULL DEFAULT 'active',
  -- 'active' | 'paused' | 'transferred' | 'completed'
  total_messages_sent     INTEGER DEFAULT 0,
  last_processed_at       TIMESTAMPTZ,
  processing_lock_until   TIMESTAMPTZ,
  paused_by               UUID REFERENCES workspace_members(id),
  paused_reason           TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, contato_id, agent_id)
);

-- Log de auditoria de todas as ações do agente
CREATE TABLE ai_agent_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL,
  contato_id        UUID NOT NULL REFERENCES contatos(id),
  conversation_id   UUID REFERENCES ai_agent_conversations(id),
  agent_id          UUID REFERENCES ai_sales_agents(id),
  tipo              TEXT NOT NULL,
  -- 'message_sent' | 'tool_called' | 'transferred' | 'error' | 'cadence_step'
  tool_name         TEXT,
  tool_input        JSONB,
  tool_result       JSONB,
  message_preview   TEXT,
  input_tokens      INTEGER,
  output_tokens     INTEGER,
  model             TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Follow-ups agendados pelo agente
CREATE TABLE ai_agent_scheduled_followups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  contato_id      UUID NOT NULL REFERENCES contatos(id),
  agent_id        UUID NOT NULL REFERENCES ai_sales_agents(id),
  instrucao       TEXT NOT NULL,   -- instrução para o agente na hora de enviar
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Triggers (Automação no Banco)

```sql
-- Enfileira mensagem inbound para processamento pelo agente
CREATE OR REPLACE FUNCTION trg_fn_enqueue_for_ai_agent() RETURNS TRIGGER AS $$
DECLARE
  v_agent_id UUID;
  v_debounce INT;
  v_settings JSONB;
BEGIN
  -- Só processa mensagens inbound de leads
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;

  -- Busca agente ativo para este workspace + lead
  SELECT a.id, a.settings INTO v_agent_id, v_settings
  FROM ai_sales_agents a
  JOIN ai_agent_conversations c ON c.agent_id = a.id
  WHERE c.workspace_id = NEW.workspace_id
    AND c.contato_id = NEW.contato_id
    AND c.status = 'active'
    AND a.is_active = true
  LIMIT 1;

  IF v_agent_id IS NULL THEN RETURN NEW; END IF;

  -- Cancela cadência ativa (lead respondeu)
  UPDATE ai_agent_cadence_enrollments
  SET status = 'replied'
  WHERE workspace_id = NEW.workspace_id
    AND contato_id = NEW.contato_id
    AND status = 'active';

  -- Obtém debounce das settings
  v_debounce := COALESCE((v_settings->>'debounce_seconds')::INT, 30);

  -- Enfileira com debounce
  PERFORM enqueue_message_for_ai_agent(
    NEW.workspace_id, NEW.contato_id, NEW.id, NEW.corpo, v_debounce
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enqueue_for_ai_agent
AFTER INSERT ON comunicacoes
FOR EACH ROW EXECUTE FUNCTION trg_fn_enqueue_for_ai_agent();
```

---

## Fluxo End-to-End Completo

```
Lead envia mensagem via WhatsApp
  → UAZAPI ou Meta API recebe
    → Webhook chega na edge function webhook-whatsapp
      → Identifica instância WhatsApp (por token ou instance_id)
      → Extrai telefone (normaliza formatos +55, 55, 0055)
      → Busca contato por telefone (fuzzy match, múltiplos formatos)
      → Se não encontrar → cria contato mínimo
      → Salva em comunicacoes (direction: inbound)
      → Trigger DB: enqueue_message_for_ai_agent (debounce 30s)
      → Fire-and-forget para edge function ai-sdr-agent

ai-sdr-agent (process_queue):
  → process_ai_agent_queue() — reseta mensagens travadas
  → claim_queue_messages() — claim atômico com SKIP LOCKED
  → Para cada lead na batch:
    a. try_acquire_agent_lock (lock por lead)
    b. Verifica horário comercial
    c. Verifica status da conversa ('active')
    d. Verifica max mensagens por conversa
    e. Verifica rate limit (msgs/hora e msgs/dia)
    f. Coleta contexto: dados do lead + histórico + tarefas + pipeline
    g. Monta system prompt com contexto dinâmico
    h. Monta histórico de mensagens de comunicacoes
    i. Carrega tools ativas do agente
    j. Chama OpenRouter com o modelo configurado
    k. LOOP DE TOOLS (máximo 5 iterações):
       - Se tool_calls: executa cada tool, loga, insere msg de sistema, continua
       - Se texto: captura como resposta final, break
    l. sendHumanizedResponse (delays, digitação, divisão em partes)
    m. Salva em comunicacoes (direction: outbound, sender_type: ai_agent)
    n. Atualiza conversa: incrementa total_messages_sent, last_processed_at
    o. Incrementa contadores de rate limit
    p. Loga em ai_agent_logs (tokens, preview)
    q. release_agent_lock
```

---

## UI de Configuração — Tela "Agentes IA"

### Dashboard card (topo da página)

| Métrica | Descrição |
|---------|-----------|
| Conversas ativas | Quantas conversas com IA ativa |
| Mensagens enviadas hoje | Total do dia atual |
| Pendentes na fila | Mensagens aguardando processamento |
| Conversas transferidas | Que precisam de atenção humana |

### Tab 1: Personalidade

- Nome do agente (ex: "Ana — Consultora Empire")
- Descrição curta
- **Seletor de modelo:** Dropdown com todos os modelos do OpenRouter (busca por nome, mostra custo/token)
- Temperature slider (0 = preciso, 1 = criativo)
- **System Prompt:** textarea grande com preview de como o prompt será enviado ao modelo
- Traits de personalidade: chips configuráveis (ex: "acolhedora", "direta", "empática")

### Tab 2: Comportamento

- Horário de funcionamento (início/fim)
- Dias da semana (toggle buttons Seg–Dom)
- Delay de resposta: min/max segundos (slider duplo)
- Debounce (segundos para aguardar antes de processar)
- Tamanho máximo de parte de mensagem (caracteres)
- Max mensagens por conversa antes de transferir
- Auto-pause quando humano responde (toggle)
- Mensagem de fallback de erro (textarea)
- **Avançado** (colapsável): velocidade de digitação CPM, rate limits/hora e /dia, lock duration, max retries, batch size

### Tab 3: Funil & Estágios

- CRUD dos stages do pipeline (drag-to-reorder)
- Seletor de stages alvo: onde o agente atua
- Mapa de reativação: "quando lead em 'perdido' responde → mover para 'qualificado'"

### Tab 4: Cadência

Para cada stage: editor visual de sequência de steps
- Tipo de ação: IA gera mensagem / Template fixo
- Delay em minutos/horas/dias
- Conteúdo ou instrução para o agente
- Só se não houver resposta (toggle)
- Ação pós-completação: mover de stage / notificar humano / marcar perdido

### Tab 5: Ferramentas (Tools)

- Lista de tools instaladas com toggle ativo/inativo
- Botão "Instalar padrão" que planta as 9 ferramentas essenciais
- Editor de tool: nome, descrição, JSON Schema de parâmetros, action_type, prioridade

### Tab 6: Números WhatsApp

- Lista de instâncias WhatsApp conectadas
- Para cada número: selecionar modo (IA, Humano, Humano+IA) e qual agente usa
- Status de conexão em tempo real (verde/vermelho)
- Botão para reconectar (gerar novo QR Code)

---

## Exemplo de System Prompt (Seed)

```
Você é a Ana, consultora de vendas da Empire Business.

## Sobre a Empire
A Empire é referência em consultoria de marketing digital para negócios de alto ticket. 
Trabalhamos com empresas que faturam acima de R$30k/mês e querem escalar suas vendas.

## Seu Objetivo
1. Dar boas-vindas calorosas e criar conexão genuína
2. Entender o negócio e os desafios do lead
3. Qualificar (BANT) de forma natural, sem parecer interrogatório
4. Agendar uma reunião com um de nossos consultores sênior
5. Se o lead não for o perfil ideal, ser honesta e não desperdiçar o tempo de ninguém

## Regras
- NUNCA cite preços — direcione sempre para a reunião
- Faça uma pergunta de cada vez — nunca duas no mesmo bloco
- Seja direta mas acolhedora
- Use o nome do lead quando puder
- Mensagens curtas — máximo 2–3 frases por parte
- Emojis com moderação (máximo 1 por mensagem)
- Se o lead pedir para falar com uma pessoa → use a tool notify_human imediatamente
```

---

## Tabela de Funcionalidades

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| 3 modos de atendimento (Humano / IA / Humano+IA) | 1 | Crítica |
| SDR IA via OpenRouter (modelo configurável por UI) | 1 | Crítica |
| Suporte a múltiplos números UAZAPI (ilimitado) | 1 | Crítica |
| Suporte a múltiplos números Meta API (ilimitado) | 2 | Crítica |
| Humanização: delay, digitação, divisão em partes | 1 | Crítica |
| System prompt configurável com contexto dinâmico | 1 | Crítica |
| 9 tools de function calling (BANT, agenda, stage) | 1 | Crítica |
| Debounce de 30s (aguarda lead terminar de digitar) | 1 | Crítica |
| Fila de processamento com claim atômico | 1 | Crítica |
| Lock por lead (evita processamento duplicado) | 1 | Crítica |
| Guardrails: horário, rate limit, max msgs | 1 | Crítica |
| Auto-pause quando humano responde | 1 | Alta |
| Transferência para humano (notify_human tool) | 1 | Crítica |
| Cadência automática de follow-up por stage | 1 | Alta |
| Cancelar cadência quando lead responde | 1 | Crítica |
| BANT scoring automático (15–100) | 1 | Alta |
| Sugestões de resposta IA para SDR humano (Modo 3) | 2 | Alta |
| Automações de mensagem para SDR humano (Modo 3) | 2 | Alta |
| Copiloto lateral com próximos passos sugeridos | 2 | Média |
| UI de configuração completa (6 tabs) | 1 | Crítica |
| Dashboard card com métricas do agente | 1 | Alta |
| Log de auditoria de todas as ações do agente | 1 | Alta |
| Badge de status do agente no lead card | 1 | Alta |
| Seletor de modelo OpenRouter na UI | 1 | Crítica |
| Botão "Retomar IA" após transferência humana | 1 | Alta |
| Recuperação automática de mensagens travadas | 1 | Alta |
| Multiple agents (agente por pipeline ou por número) | 3 | Média |
| Análise de performance do agente (taxa conversão) | 3 | Média |
| A/B test de system prompts | 4 | Baixa |
```

---

## Chaves de Integração (Padrão DB-first)

```typescript
// Padrão para buscar qualquer chave de API:
// 1. Busca na tabela integration_keys (configurada pelo usuário na UI)
// 2. Se não encontrar, usa variável de ambiente como fallback

const openrouterKey = await getIntegrationKey('openrouter', 'api_key', 'OPENROUTER_API_KEY')
const uazapiToken   = await getIntegrationKey('uazapi', 'admin_token', 'UAZAPI_ADMIN_TOKEN')
```

### Tabela `integration_keys`

```sql
CREATE TABLE integration_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  service     TEXT NOT NULL,     -- 'openrouter', 'uazapi', 'meta_whatsapp', etc.
  key_name    TEXT NOT NULL,     -- 'api_key', 'admin_token', 'phone_number_id'
  key_value   TEXT NOT NULL,     -- valor criptografado (usar Supabase Vault)
  is_active   BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES workspace_members(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, service, key_name)
);
```

| Serviço | key_name | Fallback env |
|---------|----------|-------------|
| `openrouter` | `api_key` | `OPENROUTER_API_KEY` |
| `uazapi` | `subdomain` | `UAZAPI_SUBDOMAIN` |
| `uazapi` | `admin_token` | `UAZAPI_ADMIN_TOKEN` |
| `meta_whatsapp` | `access_token` | `META_ACCESS_TOKEN` |
| `meta_whatsapp` | `phone_number_id` | `META_PHONE_NUMBER_ID` |
| `soniox` | `api_key` | `SONIOX_API_KEY` |

---

*Documento criado em Abril/2026 — Empire Business*  
*Complementa: [`06-MODULO-COMUNICACOES.md`](./06-MODULO-COMUNICACOES.md) | [`07-INTEGRACAO-WHATSAPP.md`](./07-INTEGRACAO-WHATSAPP.md) | [`12-MODULO-AUTOMACOES.md`](./12-MODULO-AUTOMACOES.md)*
