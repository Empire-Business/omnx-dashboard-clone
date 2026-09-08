# sync-contact-attribution — Repair de UTM/TT para leads `form-fb`

| Campo | Valor |
|-------|-------|
| **Status** | ✅ IMPLEMENTADO |
| **Atualizado em** | 2026-04-16 BRT |
| **Edge function** | `supabase/functions/sync-contact-attribution/index.ts` |
| **Cron** | `sync-contact-attribution` — a cada 5 min, offset `:01` |
| **Trigger (novo)** | `trg_attribution_on_contact` em `contatos` — enfileira imediatamente ao INSERT/UPDATE |
| **Fonte operacional** | `GET /contacts/{id}` do GHL |
| **Escopo** | contatos com tag `[cp] form-fb` e `contact_source` iniciado por `Facebook` |

## O que resolve

Leads de formulário do Facebook estavam chegando com os campos locais `utm_*` vazios e, por consequência, os custom fields equivalentes no GHL também ficavam vazios.

O repair usa o bloco `attributionSource` / `lastAttributionSource` do próprio contato no GHL, que já espelha os dados trazidos da Meta, e traduz isso para o padrão interno do projeto:

- `utm_source` → código interno como `iads-28`
- `utm_campaign` → número interno como `32`
- `utm_medium` → objetivo (`O1` → `1`)
- `utm_content` → criativo (`CR-248`)
- `utm_term` → código completo (`M1_O1_P29_CR-248_PG32`)

Os campos `tt_*` são preenchidos em modo best-effort com base nos IDs e metadados que o GHL já expõe no contato.

## Regra de elegibilidade

Para um contato ser processado, precisa ter:
- `ghl_id` preenchido
- tag `[cp] form-fb` presente em `tags` (esta é a **fonte de verdade** — suficiente sozinha)
- `contact_source` começando com `facebook` **OU** `contact_source = NULL` (o GHL nem sempre popula esse campo)
- pelo menos um campo base vazio (`utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`)
- `attribution_skip = FALSE`

## Regra de sobrescrita

- nunca sobrescreve custom field já preenchido no GHL
- nunca sobrescreve coluna local já preenchida em `contatos`
- só atua em contatos elegíveis com lacuna nos campos base (`utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`)
- ignora contatos com `attribution_skip = TRUE` (attribution exaurida)

## Mecanismo anti-loop (attribution_skip)

Contatos cujo GHL não retorna `attributionSource` utilizável ficam em loop infinito sem o mecanismo de skip. Para resolver:

- Coluna `attribution_attempts INT DEFAULT 0` — incrementada a cada tentativa sem resultado
- Coluna `attribution_skip BOOLEAN DEFAULT FALSE` — quando `attribution_attempts >= 10`, a edge function marca `TRUE`
- Trigger e edge function ignoram contatos com `attribution_skip = TRUE`
- Para marcar manualmente: `UPDATE contatos SET attribution_skip = TRUE WHERE id = '<uuid>';`

**Contatos conhecidos sem attributionSource no GHL (marcados na migration `20260413000001`):**
- Rubens Cunha (`23186f02-473a-4ab7-b2f2-df284d6c20fc`)
- Tatiana Coelho (`44161bf9-1278-4829-97d1-f4f46ba96894`)

## Tradução do tracking code

O código em `attributionSource.utmContent` vem no formato:

```text
M1_O1_P29_CR-248_PG32
```

O sync converte isso assim:

- `P29` → lookup em `utm_sources.public_code` → `utm_source = iads-28`
- `PG32` → lookup em `utm_campaigns.page_code` → `utm_campaign = 32`
- `O1` → `utm_medium = 1`
- `CR-248` → `utm_content = CR-248`
- código completo → `utm_term`

## Como funciona

### Camada 1 — Trigger (imediato, sem depender do cron)

Quando um contato é inserido ou tem `tags`, `contact_source` ou campos UTM atualizados:
- `trg_attribution_on_contact` dispara `trg_fn_enqueue_attribution_on_contact()`
- A função verifica todas as pré-condições (tag, source, campos vazios, `attribution_skip`)
- Se elegível, enfileira imediatamente o `GET /contacts/{id}` na `ghl_api_jobs`

Isso garante que novos leads sejam processados **na mesma transação do webhook**, sem depender do cron de 5 minutos.

### Camada 2 — Edge function (cron + drain)

1. drena jobs `done`/`dead` do caller `sync-contact-attribution-write`
2. drena jobs `done`/`dead` do caller `sync-contact-attribution-fetch`
3. lê o contato remoto retornado pelo GHL
4. resolve os campos internos do projeto
5. atualiza `contatos` localmente só nas lacunas
6. enfileira `PUT /contacts/{id}` na `ghl_api_jobs` para preencher os custom fields vazios
7. marca os jobs tratados com `handled_at`
8. **novo:** quando attribution vazia → incrementa `attribution_attempts`; se >= 10 → marca `attribution_skip = TRUE`

## Comportamento operacional importante

Hoje o repair funciona em duas passadas:

1. uma execução enfileira o `GET /contacts/{id}` do GHL
2. a execução seguinte consome esse resultado, atualiza `contatos` e enfileira o `PUT /contacts/{id}`

Então o cron é automático, mas não é instantâneo para lead novo. O desenho atual é confiável como repair assíncrono; ele não garante preenchimento em uma única execução.

## Nota operacional

O endpoint `PUT /contacts/{id}` do GHL aceita o payload com `customFields`, mas rejeita `locationId` nesse fluxo específico. A versão ativa do sync envia somente:

```json
{
  "customFields": [
    { "id": "FIELD_ID", "value": "..." }
  ]
}
```

## Configuração

Os IDs reais dos custom fields do GHL ficam em:

- `ghl_custom_field_mappings`

Mapeamentos seedados:

- `utm_source`
- `utm_campaign`
- `utm_medium`
- `utm_content`
- `utm_term`
- `tt_content`
- `tt_term`
- `tt_campaign`
- `tt_source`
- `tt_medium`

## Backfill manual

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-attribution" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"backfill": true, "batch_size": 100, "apply_batch_size": 300}'
```

**Quando `backfill: true`**, a janela é automaticamente ampliada para 365 dias (independente do `days_back` informado). Repita o comando até `fetch_enqueued` retornar `0`.

Para janela ainda mais ampla (leads muito antigos), passe explicitamente:
```json
{"backfill": true, "days_back": 730, "batch_size": 100, "apply_batch_size": 300}
```

## Verificação

```sql
SELECT
  COUNT(*) FILTER (WHERE contact_source ILIKE 'Facebook%' AND tags ILIKE '%[cp] form-fb%' AND utm_source IS NULL) AS source_null,
  COUNT(*) FILTER (WHERE contact_source ILIKE 'Facebook%' AND tags ILIKE '%[cp] form-fb%' AND utm_term IS NULL)   AS term_null
FROM contatos;
```

## Casos ainda não resolvíveis só com GHL

Validação em 2026-04-09:

- `Rubens Cunha`
- `Tatiana Coelho`

Nesses dois contatos, o `attributionSource` do GHL não traz `utmContent`, `campaignId` nem `adId`. Sem esse material, não existe derivação segura para `utm_source`, `utm_campaign`, `utm_content` e `utm_term`. Para cobrir esses casos, o próximo passo é buscar a attribution direto na Meta Lead Ads API.
