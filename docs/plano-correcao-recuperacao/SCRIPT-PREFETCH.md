# Script: recuperacao-prefetch.js

> **Arquivo:** `supabase/functions/recuperacao-prefetch/index.ts`
> **Propósito:** Etapa 0 — coletar todos os dados necessários antes de executar a correção.

---

## O que o script faz

Executa 5 passos em sequência:

| Passo | O que faz | Fonte |
|-------|-----------|-------|
| 1 | Identifica os 246 leads problemáticos (só em Recuperação) | Supabase |
| 2 | Busca tags e `ghl_id` de cada contato | Supabase |
| 3 | Lista todos os pipelines e stages do GHL | API GHL `GET /pipelines` |
| 4 | Busca o `pipelineStageId` atual de cada opp em Recuperação | API GHL `GET /opportunities/{id}` × 246 |
| 5 | Classifica cada lead no pipeline de destino + salva JSON | — |

---

## Por que precisamos do Passo 4 (GET por opp)?

O campo `pipeline_stage_id` está **NULL no Supabase** para todos os leads de Recuperação —
os webhooks desse pipeline não enviam o estágio.

Precisamos do estágio atual para copiá-lo na duplicata que criaremos em Recuperação.
Sem ele, o lead seria criado no primeiro estágio (incorreto).

---

## Como executar

Edge function — usa a `GHL_API_KEY` já configurada nos secrets do Supabase.

```bash
# Deploy (se ainda não foi feito)
supabase functions deploy recuperacao-prefetch

# Chamar via curl
curl -X POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/recuperacao-prefetch \
  -H "Authorization: Bearer SEU_ANON_KEY" \
  -H "Content-Type: application/json" \
  > output/recuperacao-prefetch-$(date +%Y%m%d).json
```

Tempo estimado: ~1 minuto (246 chamadas × 150ms + rate limiting).

---

## Saída gerada

Arquivo: `output/recuperacao-prefetch-YYYYMMDD.json`

```json
{
  "gerado_em": "2026-03-17T...",
  "estatisticas": {
    "total": 246,
    "pre_vendas_mql": 133,
    "pre_vendas_nmql": 34,
    "vendas_mql": 53,
    "sem_classificacao": 26,
    "sem_stage_id": 0,
    "com_erro_api": 0,
    "sem_ghl_contact_id": 0
  },
  "pipelines": {
    "Pré-Vendas MQL": {
      "id": "sqchZ2kIIZljR6wJ6bko",
      "stages": {
        "Tentativa 1": "abc123",
        "Perdido": "def456"
      }
    }
  },
  "leads": [
    {
      "supabase_id": "...",
      "ghl_opportunity_id": "...",
      "contato_id": "...",
      "ghl_contact_id": "...",
      "nome": "João Silva",
      "titulo": "João Silva",
      "current_stage_id": "stage_id_em_recuperacao",
      "current_stage_name": "Em Andamento",
      "current_status": "open",
      "ghl_error": null,
      "tags": "mql,mailws100em100",
      "tem_reuniao": false,
      "data_reuniao": null,
      "destino": "pre_vendas_mql"
    }
  ]
}
```

---

## O que verificar no JSON antes de continuar

1. **`estatisticas.com_erro_api`** deve ser 0 (ou muito baixo)
2. **`estatisticas.sem_ghl_contact_id`** deve ser 0 (sem isso não dá pra criar nova opp)
3. **`pipelines`** — confirmar que cada pipeline de destino tem um stage chamado "Perdido" (ou equivalente)
4. **`leads` com `destino: "sem_classificacao"`** — revisar e decidir manualmente o que fazer com eles
5. **`current_stage_id` nulos** sem `ghl_error` — significa que a opp existe mas sem estágio definido no GHL

---

## Avisos de segurança

- O script é **somente leitura** — não altera nada no GHL nem no Supabase
- Pode ser executado quantas vezes quiser sem risco
- O arquivo de saída serve como **backup do estado atual** (necessário para rollback)
- Não commitar o arquivo de saída (contém dados sensíveis de leads)
