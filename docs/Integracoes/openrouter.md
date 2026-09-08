# Integração OpenRouter

OpenRouter é um gateway de LLMs que expõe uma API unificada compatível com OpenAI para centenas de modelos. O projeto usa OpenRouter para edge functions com IA.

---

## Configuração

| Item | Valor |
|------|-------|
| URL base | `https://openrouter.ai/api/v1/chat/completions` |
| Autenticação | `Authorization: Bearer <OPENROUTER_API_KEY>` |
| Secret Supabase | `OPENROUTER_API_KEY` |
| Headers obrigatórios | `HTTP-Referer: https://empire.business` / `X-Title: <nome da função>` |

Para verificar/adicionar o secret:
```bash
supabase secrets list
supabase secrets set OPENROUTER_API_KEY=sk-or-...
```

---

## Modelos em Uso

| Papel | ID OpenRouter | Notas |
|-------|---------------|-------|
| **Primário** | `z-ai/glm-5` | GLM-5 (Zhipu AI) |
| **Fallback** | `anthropic/claude-sonnet-4.6` | Claude Sonnet 4.6 — ativado automaticamente se o primário retornar vazio ou falhar |

---

## Edge Functions que Usam OpenRouter

### `prevendas-ai`

- **Propósito:** Análise one-shot de padrões de leads parados — identifica grupos, padrões e recomendações acionáveis para SDRs.
- **Tipo:** Com cache de 24h em `prevendas_ai_insights` (chave: `workspace_id + SHA256(payload)`).
- **Parâmetros:** `temperature: 0.3`, `max_tokens: 1500`
- **Payload de entrada:** `{ workspace_id, leads: LeadInfo[] }`
- **Payload de saída:** `{ resultado: { padroes, recomendacoes, grupos }, cached: boolean }`
- **Invocação:**
  ```ts
  supabase.functions.invoke('prevendas-ai', {
    body: { workspace_id, leads }
  })
  ```

---

## Pattern de Chamada com Fallback

As funções tentam o modelo primário; se retornar conteúdo vazio ou lançar exceção, o fallback é ativado. Erros do fallback propagam para o handler principal, que retorna `{ error: string }` com status 500.

```ts
let resultado: AiInsightsResult
try {
  resultado = await callOpenRouter(leads, apiKey, MODEL_PRIMARY)
} catch (err) {
  console.error('[prevendas-ai] primary model error, trying fallback:', err)
  resultado = await callOpenRouter(leads, apiKey, MODEL_FALLBACK)
}
```

---

## Deploy

Após editar a edge function:

```bash
supabase functions deploy prevendas-ai
```
