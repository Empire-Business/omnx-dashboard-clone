# Clara 2.0 — Arquitetura Distribuída

> **Branch:** `feat/clara-2.0-arquitetura`
> **Atualizado em:** 2026-07-14 BRT
> **Projeto Supabase:** `qzesffnkqgelmtfblzkr`

---

## 1. Visão Geral

A Clara 2.0 divide a edge function monolítica `bot-chat` em três funções especializadas:

| Função | Responsabilidade | Chave de Deploy |
|--------|------------------|-----------------|
| `bot-chat` | Orquestrador — auth, contexto, loop de tool calling, persistência | `verify_jwt = false` |
| `bot-chat-data` | Worker de dados — executa tools com escopo obrigatório da conta | `verify_jwt = false` |
| `bot-chat-synthesis` | Worker de síntese — chama Qwen via OpenRouter da própria conta | `verify_jwt = false` |

**Objetivo:** eliminar timeouts em análises longas. Cada worker pode ser escalado/otimizado independentemente, e o orquestrador fica enxuto.

## Telemetria e chamadas internas

Cada chamada OpenRouter registra, por `workspace_id`, somente feature, modelo,
resultado, tokens, duração e código sanitizado de erro. Prompts, respostas,
chaves e erros brutos não são persistidos. Relatórios semanais e Telegram
propagam a conta explicitamente; o Telegram falha fechado sem conta mapeada e
chamadas internas não persistem conversas sem um usuário autenticado válido.

---

## 2. Motivação

A função monolítica original executava:

1. Auth + permissão `clara_habilitado`
2. Tool calling via OpenRouter
3. Execução de ~15 tools diretamente no banco
4. Síntese final via OpenRouter

Com relatórios complexos, o tempo total chegava perto do limite de 150s das Edge Functions. Separar dados e síntese permite:

- Cada chamada ter seu próprio timeout (ex: 110s para síntese).
- Reutilizar workers por outros módulos futuros (ex: relatórios agendados).
- Isolar falhas: se a síntese falhar, podemos retry com fallback sem refazer as queries.

---

## 3. Fluxo de Requisição

```
Usuário → bot-chat (orquestrador)
              │
              ├─→ bot-chat-data (executa tools)
              │       └─→ Supabase (service_role)
              │
              └─→ bot-chat-synthesis (gera resposta)
                      └─→ OpenRouter (com fallback)
```

Passos:

1. `bot-chat` recebe `{ message, context?, conversation_id?, session_id? }`.
2. Autentica usuário e verifica `clara_habilitado`.
3. Carrega histórico e `bot_context`.
4. Valida `workspace_id` e membership; resolve a chave OpenRouter da própria conta no Vault.
5. Chama Qwen (diretamente no orquestrador, por enquanto) para decidir quais tools executar.
6. Envia as tools para `bot-chat-data` com `workspace_id`; o worker acrescenta o filtro de conta em cada leitura permitida.
7. Recebe os resultados e chama `bot-chat-synthesis` para gerar a resposta final com a mesma credencial da conta.
8. Persiste mensagens em `ai_messages` / `ai_conversations`, cuja conversa pertence a um único `workspace_id`.

---

## 4. Edge Functions

### 4.1 `bot-chat` (orquestrador)

**Arquivo:** `supabase/functions/bot-chat/index.ts`

Responsabilidades:
- Auth e permissão `clara_habilitado`.
- Montar system prompt com regras de negócio.
- Loop de tool calling (1 round de coleta + síntese final).
- Continuation mechanism via `ai_analysis_sessions`.
- Persistência de conversa.

Detalhes técnicos:
- Modelo de decisão e síntese: `qwen/qwen3.6-plus`.
- Chamada de síntese final delegada ao `bot-chat-synthesis`.
- Timeout por chamada de worker: padrão 110s.

### 4.2 `bot-chat-data`

**Arquivo:** `supabase/functions/bot-chat-data/index.ts`

Responsabilidades:
- Receber array de `{ name, arguments }`.
- Autenticar (JWT do usuário ou `BOT_INTERNAL_SECRET`).
- Executar cada tool via `executeTool()` em `_shared/clara/executors.ts`.
- Retornar resultados em paralelo/síncrono.

Variáveis de ambiente:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_INTERNAL_SECRET` (opcional, para chamadas service-to-service)

### 4.3 `bot-chat-synthesis`

**Arquivo:** `supabase/functions/bot-chat-synthesis/index.ts`

Responsabilidades:
- Receber `{ system_prompt, messages, stream? }`.
- Chamar OpenRouter com fallback automático entre modelos autorizados.
- Retornar resposta completa ou stream SSE.

Modelos de fallback (ordem):

1. `deepseek/deepseek-v4-flash`
2. `deepseek/deepseek-v4-pro`
3. `qwen/qwen3.7-plus`
4. `z-ai/glm-5.2`
5. `minimax/minimax-m3`
6. `x-ai/grok-4.3`

> **Regra do projeto:** NUNCA usar `anthropic/*` ou `openai/*` nestas funções.

Variáveis de ambiente:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `OPENROUTER_API_KEY`
- `BOT_INTERNAL_SECRET` (opcional)

---

## 5. Código Compartilhado

### 5.1 `_shared/clara/tools.ts`

Definições das ~15 tools usadas no function calling (formato OpenRouter).

### 5.2 `_shared/clara/executors.ts`

Implementações das tools: queries Supabase, agregações, formatação.

### 5.3 `_shared/clara/helpers.ts`

Funções auxiliares: paginação, detecção de MQL por tag, formatação de moeda, etc.

---

## 6. Segurança

- `verify_jwt = false` em todas as três funções (rotação JWT ES256).
- Auth feita manualmente no orquestrador e nos workers.
- `SUPABASE_SERVICE_ROLE_KEY` usada **apenas** em `bot-chat-data`, nunca no frontend.
- Chamadas service-to-service podem usar `BOT_INTERNAL_SECRET` como reforço.

---

## 7. Deploy

```bash
# Deployar todas as funções (sempre --no-verify-jwt)
npx supabase functions deploy bot-chat-data --project-ref qzesffnkqgelmtfblzkr --no-verify-jwt
npx supabase functions deploy bot-chat-synthesis --project-ref qzesffnkqgelmtfblzkr --no-verify-jwt
npx supabase functions deploy bot-chat --project-ref qzesffnkqgelmtfblzkr --no-verify-jwt
```

Configuração em `supabase/config.toml`:

```toml
[functions.bot-chat]
verify_jwt = false

[functions.bot-chat-data]
verify_jwt = false

[functions.bot-chat-synthesis]
verify_jwt = false
```

---

## 8. Testes

Suite Playwright: `tests/clara/clara-e2e.spec.ts`

```bash
cd /Users/bguzela/Desenvolvimento/GHL-SUPABASE
export BASE_URL=http://localhost:3223
npx playwright test tests/clara/clara-e2e.spec.ts --project=chromium
```

Resultado esperado: **5/5 testes passando**.

Cenários cobertos:
1. Vendas por closer/produto/forma de pagamento (`query_vendas_detalhado`).
2. Pré-vendas — reuniões, no-shows e comparecimento (`query_pre_vendas`).
3. Traqueamento — ranking de criativos (`query_criativos`).
4. Traqueamento — listar canais de tráfego pago (`list_utm_sources`).
5. Traqueamento — desempenho de canal específico (`query_trafego_pago`).

---

## 9. Módulos de Dados Implementados (Clara)

| Módulo | Tool | RPC/Função SQL | Descrição |
|--------|------|----------------|-----------|
| Vendas | `query_vendas_detalhado` | `analisar_vendas` | Faturamento, entrada, ticket médio por closer, produto ou forma de pagamento. |
| Pré-Vendas | `query_pre_vendas` | `analisar_pre_vendas` | Reuniões agendadas, no-shows, comparecimento e taxas por SDR/closer. |
| Criativos | `query_criativos` | `analisar_criativos` | Ranking de criativos cruzando Meta Ads × CRM pelo padrão `CR-xxx`. |
| Canais de Tráfego | `list_utm_sources` | `utm_sources` | Lista canais/campanhas configuradas (`utm_sources`, `utm_campaigns`). |
| Desempenho de Canal | `query_trafego_pago` | `query_trafego_pago` | Investimento Meta, leads, MQLs, vendas e ROAS por canal/campanha (modos cohort e produtividade). |
| Região (Meta Ads) | `query_meta_ads_region` | `analisar_meta_ads_por_regiao` | Investimento Meta por região/estado cruzado com vendas do CRM. |

> **Regra de resposta:** a Clara foi instruída a usar **apenas** números e nomes retornados pelas tools. Nunca inventar closers, SDRs, produtos, canais ou valores.

## 10. Próximos Passos (pós-arquitetura)

- [ ] Aba dedicada "Clara" no dashboard com histórico de conversas.
- [ ] Rotinas automatizadas de relatórios por e-mail via Resend.
- [ ] Streaming de respostas delegado ao `bot-chat-synthesis`.
- [ ] Tool calling de decisão também delegado ao `bot-chat-synthesis`.
- [ ] Cache de resultados de tools para consultas repetidas.

## 10.1 Configuração por conta

O painel **Relatórios > Configurar Clara** guarda preferências exclusivamente em
`clara_workspace_settings`, uma linha por `workspace_id`. Owner e admin podem
alterar instruções persistentes, contexto de negócio, regras de resposta,
módulos/tools permitidos, limites de resposta/retenção e instruções de
relatórios agendados. Cada mudança gera um registro sanitizado de auditoria.

O catálogo da OpenRouter é consultado somente pela Edge Function
`clara-settings`, usando a chave BYOK do próprio workspace. A chave e a resposta
bruta do provedor nunca chegam ao navegador. A política atual mantém
`qwen/qwen3.6-plus` como único modelo executável em `bot-chat` e
`prevendas-ai`; o catálogo é informativo até existir revisão explícita dessa
política e allowlist correspondente.

---

## 11. Troubleshooting

### Timeout no orquestrador
Verifique se `bot-chat-data` e `bot-chat-synthesis` respondem rápido. Cada worker deve levar < 45s.

### Modelo não responde
O fallback deve tentar automaticamente. Verifique logs no Supabase Dashboard.

### "Não autorizado"
Confira se o token do usuário é válido e se `BOT_INTERNAL_SECRET` está configurado para chamadas internas.
