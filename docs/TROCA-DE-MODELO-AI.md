# Guia: Troca de Modelo de IA no Bot Empire

> Documento criado em 2026-04-14 após migração de `anthropic/claude-sonnet-4.6` → `qwen/qwen3.6-plus`.
> Registra todos os problemas encontrados, causas raiz e como fazer uma troca de modelo corretamente.

---

## Onde os modelos são configurados

| Função Edge | Arquivo | Campo | Papel |
|-------------|---------|-------|-------|
| `bot-chat` | `supabase/functions/bot-chat/index.ts` | `const MODEL = '...'` | Assistente analítico principal do dashboard |
| `prevendas-ai` | `supabase/functions/prevendas-ai/index.ts` | `const MODEL_PRIMARY = '...'` e `const MODEL_FALLBACK = '...'` | Análise de leads parados (aba Pré-Vendas) |

### ⛔ PROIBIDO: `anthropic/claude-sonnet-4.6` e qualquer modelo Anthropic/Claude neste app

**Motivo: custo.** Claude Sonnet é 4-5x mais caro por token que o Qwen.
**Regra:** nunca usar modelos `anthropic/*` ou `openai/*` em `bot-chat` ou `prevendas-ai`.
Se alguém sugerir trocar para Sonnet/Haiku/Opus/GPT — recusar. Usar sempre `qwen/qwen3.6-plus`.

### Modelos atuais (2026-06-18)

```typescript
// bot-chat/index.ts
const MODEL = 'deepseek/deepseek-v4-flash'  // rápido, barato, tool calling funciona
const MAX_ROUNDS = 10
const FORCE_SYNTHESIS_FROM = 2  // forçar síntese no round 2 (DeepSeek V4 Flash responde em ~10-30s)

// prevendas-ai/index.ts
const MODEL_PRIMARY = 'qwen/qwen3.6-plus'
const MODEL_FALLBACK = 'qwen/qwen3.6-plus'
```

> **Nota sobre reasoning:** `deepseek/deepseek-v4-flash` suporta reasoning opcional. No `callOpenRouter`, enviamos `reasoning: { effort: 'none' }` para manter latência baixa e evitar thinking tokens.

Todos os modelos são acessados via **OpenRouter** (`https://openrouter.ai/api/v1/chat/completions`).
A chave de API fica na secret do Supabase: `OPENROUTER_API_KEY`.

---

## Como testar um modelo antes de trocar

Antes de mudar o `MODEL` na função, teste o modelo diretamente no terminal:

```bash
# 1. Verificar se o modelo existe e responde
curl -s -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "NOME_DO_MODELO_AQUI",
    "messages": [{"role": "user", "content": "oi"}],
    "max_tokens": 50
  }' | jq '{content: .choices[0].message.content, error: .error}'

# 2. Verificar se suporta tool calling (obrigatório para bot-chat)
curl -s -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "NOME_DO_MODELO_AQUI",
    "messages": [{"role": "user", "content": "quantos mqls em março 2026?"}],
    "tools": [{"type":"function","function":{"name":"query_funnel_cohort","description":"Retorna funil","parameters":{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"}},"required":["start_date","end_date"]}}}],
    "tool_choice": "auto",
    "max_tokens": 200
  }' | jq '{finish_reason: .choices[0].finish_reason, tool_called: .choices[0].message.tool_calls[0].function.name, error: .error}'
# Esperado: finish_reason = "tool_calls", tool_called = "query_funnel_cohort"

# 3. Medir latência (crítico — ver seção "Modelos Thinking")
time curl -s -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "NOME_DO_MODELO_AQUI",
    "messages": [{"role": "user", "content": "quantos mqls em março 2026?"}],
    "tools": [{"type":"function","function":{"name":"query_funnel_cohort","description":"Retorna funil","parameters":{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"}},"required":["start_date","end_date"]}}}],
    "tool_choice": "auto",
    "max_tokens": 500
  }' | jq '{reasoning_tokens: .usage.completion_tokens_details.reasoning_tokens, total_tokens: .usage.total_tokens}'
```

**Critérios mínimos para o `bot-chat`:**
- ✅ Tool calling funciona (`finish_reason = "tool_calls"`)
- ✅ Latência por round < 15s (o bot faz até 8 rounds → risco de timeout com >15s/round)
- ✅ Responde em português
- ✅ `reasoning_tokens` idealmente 0 ou muito baixo (ver seção abaixo)

---

## ⚠️ Problema crítico: Modelos Thinking (reasoning)

### O que são

Modelos como Qwen3.x, DeepSeek-R1, o1/o3 da OpenAI e outros "thinking models" geram **tokens de raciocínio interno** antes de responder. Esses tokens aparecem no campo `reasoning` ou `reasoning_tokens` da resposta.

### O problema para o bot-chat

O `bot-chat` faz um **loop de até 8 rounds de tool calling**. Cada round = 1 chamada à API. Com um thinking model:

| Modelo | Latência/round | 8 rounds (máx) | Risco |
|--------|---------------|----------------|-------|
| `claude-sonnet-4.6` | ~2-3s | ~24s | ✅ Seguro |
| `qwen/qwen3.6-plus` | ~11-21s | ~88-168s | ⚠️ Timeout |

O Supabase Edge Functions tem limite de **60s de wall clock** (Pro). Com thinking habilitado, 3+ rounds já podem ultrapassar esse limite.

### Como verificar se o modelo pensa

```bash
# Se reasoning_tokens > 0, o modelo está pensando
jq '.usage.completion_tokens_details.reasoning_tokens'
# Se o campo 'reasoning' existe na mensagem, o modelo está pensando
jq '.choices[0].message.reasoning'
```

### Tentar desabilitar thinking

Testamos as seguintes abordagens para `qwen/qwen3.6-plus` — **nenhuma funcionou completamente**:

```json
// Não funciona — ainda gera reasoning_tokens
{ "thinking": {"type": "disabled"} }

// Não funciona — parâmetro rejeitado pelo OpenRouter
{ "provider": {"qwen": {"enable_thinking": false}} }

// Reduz um pouco, mas não elimina
// Adicionar "/no_thinking" no final do system prompt e user message
```

### Recomendação

⛔ **NUNCA trocar para `anthropic/*` (Sonnet/Haiku/Opus) — custo proibido para este app.**

Se precisar de um modelo alternativo ao `deepseek/deepseek-v4-flash`, opções:
- `qwen/qwen3.6-plus` — modelo anterior; funciona mas com thinking não desligável e latência alta
- `qwen/qwen2.5-72b-instruct` — Qwen sem thinking
- `google/gemini-flash-1.5` — rápido, sem thinking

---

## ⚠️ Problema crítico: JWT ES256 e verify_jwt

### O que aconteceu

O Supabase rotacionou os JWTs do projeto de **HS256** (chave simétrica) para **ES256** (chave assimétrica). O validador nativo de JWT das Edge Functions do Supabase só aceita HS256 → toda chamada era barrada com `401 Invalid JWT` **antes de chegar no código da função**.

### Sintoma

O usuário via no frontend:
```
⚠️ Erro ao consultar os dados: Edge Function returned a non-2xx status code
```

O Supabase JS SDK (`supabase.functions.invoke()`) esconde o body do erro 4xx/5xx e exibe apenas essa mensagem genérica.

### Diagnóstico

```bash
# Fazer login e pegar token
TOKEN=$(curl -s -X POST "https://<projeto>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <anon_key>" -H "Content-Type: application/json" \
  -d '{"email":"user@email.com","password":"senha"}' | jq -r '.access_token')

# Ver prefixo do JWT — ES256 começa com eyJhbGciOiJFUzI1NiI
echo $TOKEN | cut -c1-40

# Chamar a função
curl -s -X POST "https://<projeto>.supabase.co/functions/v1/bot-chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"oi"}' | jq
# Se retornar {"code":401,"message":"Invalid JWT"} → é o problema do ES256
```

### Fix: deploy com `--no-verify-jwt`

A solução é desabilitar a validação JWT da plataforma. A função já faz sua própria validação internamente via `supabase.auth.getUser()` — então **não há perda de segurança**.

```bash
supabase functions deploy bot-chat --no-verify-jwt
supabase functions deploy prevendas-ai --no-verify-jwt
```

> **Isso deve ser feito em QUALQUER redeploy futuro dessas funções.**
> O flag não persiste automaticamente entre deploys.

### Alternativa via config.toml

Você pode configurar permanentemente no `supabase/config.toml`:

```toml
[functions.bot-chat]
verify_jwt = false

[functions.prevendas-ai]
verify_jwt = false
```

Com isso, o simples `supabase functions deploy bot-chat` já aplica o flag.

---

## Passo a passo: como trocar de modelo

### 1. Escolher o novo modelo

Verificar no OpenRouter: `https://openrouter.ai/models`

Critérios:
- Suporta tool calling / function calling
- Latência < 10s por chamada
- Não é thinking model (ou permite desabilitar thinking)
- Tem créditos disponíveis na conta OpenRouter

### 2. Testar o modelo

Executar os 3 testes da seção "Como testar um modelo" acima.

### 3. Alterar o arquivo

**bot-chat:**
```typescript
// supabase/functions/bot-chat/index.ts — linha ~8
const MODEL = 'novo/modelo-aqui'
```

**prevendas-ai:**
```typescript
// supabase/functions/prevendas-ai/index.ts — linhas ~8-9
const MODEL_PRIMARY = 'novo/modelo-aqui'
const MODEL_FALLBACK = 'novo/modelo-aqui'  // pode ser diferente se quiser fallback
```

### 4. Deploy com --no-verify-jwt (OBRIGATÓRIO)

```bash
supabase functions deploy bot-chat --no-verify-jwt
supabase functions deploy prevendas-ai --no-verify-jwt
```

### 5. Rodar testes Playwright

```bash
cd eb-dash2
npx playwright test bot-chat --timeout=90000
```

Os testes verificam:
- Bot responde com número correto de MQLs
- Usa COHORT para funil (data_lead_recebido)
- Usa PRODUTIVIDADE para faturamento (data_pagamento_entrada)
- Avisa sobre cohort imaturo (< 60 dias)
- Não confunde ILIKE com regex para detecção de tag MQL

---

## Modelos testados

| Modelo (OpenRouter) | Tool Calling | Latência/round | Thinking | Resultado |
|---------------------|:---:|---:|:---:|---|
| `anthropic/claude-sonnet-4.6` | ✅ | ~2-3s | ❌ | ✅ Funcionou perfeitamente |
| `qwen/qwen3.6-plus` | ✅ | ~11-21s | ✅ (não desligável) | ❌ Variância alta — falha em análises ≥3 domínios (total >110s); revertido em 2026-04-20 |
| `z-ai/glm-5` | ✅ | ~3-5s | ❌ | ✅ Era o primário do prevendas-ai |
| `deepseek/deepseek-v4-flash` | ✅ | ~10-30s | ❌ (desligável via `reasoning: {effort: 'none'}`) | ✅ 10/10 testes Playwright passaram; mais barato que Qwen |

---

## Estrutura do loop de tool calling (bot-chat)

O `bot-chat` implementa um loop de 2 rounds otimizado para Qwen 3.6 Plus:

```
Round 1 (coleta): usuário → modelo com tools → tool_calls paralelos
  - Qwen pode chamar N tools de uma vez (for tc of assistantMsg.tool_calls)
  - Timeout: 45s
  - max_tokens: 4096

Round 2 (síntese): dados coletados → injeção "escreva agora" → modelo SEM tools → resposta final
  - Timeout: 110s (Qwen precisa de ~60-90s de thinking + geração para relatórios)
  - max_tokens: 8192
  - finish_reason='tool_calls' no round 2 é IGNORADO — Clara extrai o texto mesmo assim

Proteções:
- LOOP_BUDGET_MS = 135_000 — guarda 20s antes de iniciar novo round
- Rounds de síntese sempre capturam o conteúdo independente do finish_reason
- Síntese de emergência: se loop encerrou sem resposta mas havia dados, tenta 1 call extra
```

**Por que 2 rounds e não mais?** Qwen 3.6 Plus gasta ~25-35s em "thinking tokens" antes de produzir qualquer output. Com 4 rounds de tool calls, o budget seria exaurido antes da síntese. Com 2 rounds (1 coleta + 1 síntese), temos margem confortável.

### Arquitetura de decomposição paralela (frontend)

Para perguntas que abrangem 3+ domínios ("análise completa de aquisição, orgânico e tráfego"), o frontend em `useBotChat.ts` detecta automaticamente via `isComplexQuery()` e divide em 4 chamadas paralelas independentes (`Promise.allSettled`):

- `📊 Aquisição` — funil cohort, MQLs, leads, taxas de conversão
- `🌱 Orgânico` — canais orgânicos, volume de MQLs, taxa de conversão
- `📢 Tráfego Pago` — Meta Ads: ROAS, CPMQL, spend, eficiência
- `💰 Vendas & Cadência` — reuniões, taxa de fechamento, faturamento, ticket médio

Cada call é focada em um único domínio → não chega no budget. A UI mostra um placeholder progressivo que é atualizado conforme cada domínio conclui (~30s total vs 120s+ sequencial).

---

## Continuation mechanism (respostas longas)

O `bot-chat` implementa um mecanismo de continuação para quando o modelo atinge o limite de tokens no meio de uma resposta longa (`finish_reason='length'`):

```
Quando finish_reason = 'length' (resposta cortada):
  1. Acumula o texto parcial em finalAnswer +=
  2. Injeta no histórico: assistant(partial) + user("Continue de onde parou")
  3. Repete o loop — até MAX_CONTINUATIONS = 3 vezes extras
  4. Para quando: budget < 20s restantes OU continuationCount >= MAX_CONTINUATIONS

Resultado: até 4 × 8.192 = ~32.768 tokens de resposta efetiva por pergunta
```

Parâmetros relevantes:
- `MAX_CONTINUATIONS = 3` — máximo de pedaços extras após o trecho inicial
- `LOOP_BUDGET_MS = 135_000` — guarda de 20s por round; continuações respeitam esse guard
- `truncateToolResult(maxChars=20_000)` — impede tool results de encher o context window
- `FORCE_SYNTHESIS_FROM = 2` — força síntese no round 2 (1 round de coleta com Qwen)

Impacto em custo: apenas em relatórios que naturalmente excedem 8k tokens de completion.

### Atalho Perfil de Comprador

Para queries de "perfil de comprador", o bot usa um caminho especial:
1. Chama `get_buyer_profile(messages_per_buyer=8)` diretamente — sem loop
2. Embute os dados (limitados a 15k chars) no system prompt
3. Pede síntese com timeout=120s
4. Se falhar → retorna mensagem de erro clara (não cai no loop principal — sem budget)

Este atalho evita o loop agentic para esse caso específico que precisa ler muitas mensagens.

---

## Referências

- `supabase/functions/bot-chat/index.ts` — função principal do assistente
- `supabase/functions/prevendas-ai/index.ts` — análise de leads parados
- `eb-dash2/src/hooks/useBotChat.ts` — hook frontend que chama a função
- `eb-dash2/tests/bot-chat.spec.ts` — testes Playwright do bot
- `docs/ARQUITETURA.md` — stack completa do projeto
