# Meta Ads - Mapeamento de Campos

Como cada campo da Meta Marketing API é mapeado para o banco de dados.

---

## 🗺️ Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                    META API → BANCO SUPABASE                     │
└─────────────────────────────────────────────────────────────────┘

Meta API Field (string/int)    Tabela           Coluna
────────────────────────────────────────────────────────
campaign_name       ──────────▶ insights       campaign_name
spend               ──────────▶ insights       spend (DECIMAL)
impressions         ──────────▶ insights       impressions (INTEGER)
actions (array)     ──────────▶ insights       actions (JSONB)
breakdowns          ──────────▶ breakdowns     age, gender, etc
```

---

## 📊 Tabela: `meta_ads_raw_insights`

Armazena o **JSON completo** da resposta da API antes de qualquer processamento.

| Coluna no Banco | Origem | Tipo | Descrição |
|-----------------|--------|------|-----------|
| `id` | Auto | UUID | ID interno |
| `api_endpoint` | Hardcoded | TEXT | `/insights` ou `/campaigns` |
| `params` | Request | JSONB | `{level: "ad", date_preset: "today"}` |
| `response_data` | API | JSONB | ⭐ JSON BRUTO completo da resposta |
| `http_status` | HTTP | INTEGER | 200, 400, 429, etc |
| `records_count` | Response | INTEGER | `data.length` |
| `fetch_started_at` | Now() | TIMESTAMPTZ | Início da chamada |
| `fetch_finished_at` | Now() | TIMESTAMPTZ | Fim da chamada |
| `processado_em` | NULL → Now() | TIMESTAMPTZ | Quando foi processado |
| `error_details` | Error | JSONB | `{message, code, type}` se erro |

**Exemplo de `params`:**
```json
{
  "level": "ad",
  "date_preset": "today",
  "fields": "campaign_name,spend,impressions,clicks",
  "breakdowns": "publisher_platform"
}
```

**Exemplo de `response_data`:**
```json
{
  "data": [
    {
      "campaign_name": "Campanha X",
      "spend": "4.36",
      "impressions": "82"
    }
  ],
  "paging": {...}
}
```

---

## 📊 Tabela: `meta_ads_insights` (Principal)

Armazena métricas processadas e normalizadas.

### Identificadores

| Coluna no Banco | Campo API | Transformação | Exemplo |
|-----------------|-----------|---------------|---------|
| `account_id` | account_id | String | `act_716772443330289` |
| `campaign_id` | campaign_id | String | `12020834567890123` |
| `adset_id` | adset_id | String | `12020834567890124` |
| `ad_id` | ad_id | String | `12020834567890125` |

### Data/Hora

| Coluna no Banco | Campo API | Transformação | Exemplo |
|-----------------|-----------|---------------|---------|
| `date` | date_start | PARSE → DATE | `2026-02-20` |
| `hour` | - | EXTRACT da hora da chamada | `14` (14h) |

> ⚠️ A API Meta retorna `date_start` e `date_stop` (sempre iguais para `today`).
> Extraímos a hora do momento da chamada para granularidade por hora.

### Métricas Básicas

| Coluna no Banco | Campo API | Transformação | Tipo | Exemplo |
|-----------------|-----------|---------------|------|---------|
| `spend` | spend | PARSE → DECIMAL | DECIMAL(12,2) | `4.36` |
| `impressions` | impressions | PARSE → INTEGER | INTEGER | `82` |
| `clicks` | clicks | PARSE → INTEGER | INTEGER | `3` |
| `reach` | reach | PARSE → INTEGER | INTEGER | `78` |
| `frequency` | frequency | PARSE → DECIMAL | DECIMAL(8,4) | `1.0208` |

### Métricas de Custo

| Coluna no Banco | Campo API | Transformação | Tipo | Exemplo |
|-----------------|-----------|---------------|------|---------|
| `ctr` | ctr | PARSE → DECIMAL | DECIMAL(8,4) | `2.0408` |
| `cpc` | cpc | PARSE → DECIMAL | DECIMAL(12,4) | `2.3800` |
| `cpm` | cpm | PARSE → DECIMAL | DECIMAL(12,4) | `48.5714` |
| `cpp` | cpp | PARSE → DECIMAL | DECIMAL(12,4) | - |

### Action Types (Colunas Práticas)

| Coluna no Banco | Origem | Tipo | Descrição |
|-----------------|--------|------|-----------|
| `landing_page_views` | `actions[*].action_type=="landing_page_view"` | INTEGER | Visualizações da landing page |
| `video_views` | `actions[*].action_type=="video_view"` | INTEGER | Visualizações de vídeo (~3s+) |
| `link_clicks` | `actions[*].action_type=="link_click"` | INTEGER | Cliques em links |
| `leads` | `actions[*].action_type=="lead"` | INTEGER | Leads gerados |
| `onsite_web_leads` | `actions[*].action_type=="onsite_web_lead"` | INTEGER | Leads no site |
| `fb_pixel_leads` | `actions[*].action_type=="offsite_conversion.fb_pixel_lead"` | INTEGER | Leads via Pixel FB |

**Extração via `jsonb_path_query_first`:**
```sql
v_landing_page_views := COALESCE(
    (jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "landing_page_view").value')::text)::INTEGER,
    0
);
```

**Métricas derivadas (SQL):**
```sql
-- CTR (já existe): ctr ou ROUND(clicks/impressions*100, 4)
-- CPM (já existe): cpm ou ROUND(spend/impressions*1000, 4)

-- Conversão da página: leads / landing_page_views
ROUND(SUM(leads)::numeric / NULLIF(SUM(landing_page_views), 0) * 100, 2) AS conversao_pagina_pct

-- Connect Rate: landing_page_views / link_clicks
ROUND(SUM(landing_page_views)::numeric / NULLIF(SUM(link_clicks), 0) * 100, 2) AS connect_rate_pct

-- Video Hook Rate: video_views / impressions
ROUND(SUM(video_views)::numeric / NULLIF(SUM(impressions), 0) * 100, 2) AS video_hook_rate_pct
```

### Conversões (JSONB)

| Coluna no Banco | Campo API | Transformação | Tipo |
|-----------------|-----------|---------------|------|
| `actions` | actions | ARRAY → JSONB | JSONB |
| `conversions` | conversions | ARRAY → JSONB | JSONB |
| `conversion_values` | conversion_values | ARRAY → JSONB | JSONB |
| `cost_per_action_type` | cost_per_action_type | ARRAY → JSONB | JSONB |

**Exemplo de `actions` (JSONB):**
```json
[
  {"action_type": "lead", "value": "3"},
  {"action_type": "landing_page_view", "value": "12"},
  {"action_type": "video_view", "value": "156"}
]
```

**Query para extrair leads (via JSONB):**
```sql
SELECT 
  campaign_id,
  date,
  (jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value'))::int as leads
FROM meta_ads_insights
WHERE actions @> '[{"action_type": "lead"}]';
```

### Vídeo (JSONB)

| Coluna no Banco | Campos API | Transformação |
|-----------------|------------|---------------|
| `video_metrics` | video_p25, p50, p75, p95, p100, avg_time | OBJETO → JSONB |

**Estrutura:**
```json
{
  "p25": 156,
  "p50": 98,
  "p75": 45,
  "p95": 30,
  "p100": 23,
  "avg_time_seconds": 12.5
}
```

### Quality Rankings

| Coluna no Banco | Campo API | Tipo |
|-----------------|-----------|------|
| `quality_ranking` | quality_ranking | TEXT |
| `engagement_rate_ranking` | engagement_rate_ranking | TEXT |
| `conversion_rate_ranking` | conversion_rate_ranking | TEXT |

**Valores possíveis:**
- `ABOVE_AVERAGE` (Acima da média)
- `AVERAGE` (Na média)
- `BELOW_AVERAGE_35` (Abaixo - inferior a 35% dos anúncios)
- `BELOW_AVERAGE_20` (Abaixo - inferior a 20% dos anúncios)
- `BELOW_AVERAGE_10` (Abaixo - inferior a 10% dos anúncios)

### Metadados

| Coluna no Banco | Origem | Descrição |
|-----------------|--------|-----------|
| `raw_insight_id` | raw_insights.id | FK → tabela raw |
| `created_at` | NOW() | Quando inserimos no banco |
| `fetched_at` | raw_insights.fetch_finished_at | Quando API respondeu |

---

## 📊 Tabela: `meta_ads_insights_breakdowns`

Segmentações demográficas e técnicas.

### Chave Estrangeira

| Coluna no Banco | Origem | Tipo |
|-----------------|--------|------|
| `insights_id` | meta_ads_insights.id | UUID (FK) |

### Breakdowns

| Coluna no Banco | Campo API | Valores Possíveis |
|-----------------|-----------|-------------------|
| `age` | age | `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` |
| `gender` | gender | `male`, `female`, `unknown` |
| `country` | country | `BR`, `US`, `AR`, etc (ISO 3166-1 alpha-2) |
| `region` | region | `São Paulo`, `Rio de Janeiro`, etc |
| `impression_device` | impression_device | `iPhone`, `Android Smartphone`, `Desktop`, etc |
| `publisher_platform` | publisher_platform | `facebook`, `instagram`, `messenger`, `audience_network` |
| `platform_position` | platform_position | `feed`, `stories`, `reels`, `marketplace`, `video_feeds` |

### Métricas da Segmentação

| Coluna no Banco | Campo API | Tipo |
|-----------------|-----------|------|
| `spend` | spend | DECIMAL |
| `impressions` | impressions | INTEGER |
| `clicks` | clicks | INTEGER |
| `conversions` | conversions | JSONB |

**Exemplo:**
```sql
-- Quanto gastamos no Instagram para mulheres 25-34?
SELECT 
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressions
FROM meta_ads_insights_breakdowns
WHERE publisher_platform = 'instagram'
  AND gender = 'female'
  AND age = '25-34'
  AND date = '2026-02-20';
```

---

## 📊 Tabela: `meta_ads_campaigns`

Metadados das campanhas (atualizados periodicamente).

| Coluna no Banco | Campo API | Tipo | Observação |
|-----------------|-----------|------|------------|
| `campaign_id` | id | TEXT (UNIQUE) | ID único no Meta |
| `account_id` | account_id | TEXT | `act_...` |
| `name` | name | TEXT | Nome da campanha |
| `status` | status | TEXT | `ACTIVE`, `PAUSED`, `ARCHIVED` |
| `objective` | objective | TEXT | `CONVERSIONS`, `ENGAGEMENT`, `REACH`, etc |
| `daily_budget` | daily_budget | DECIMAL | Em centavos do currency. Ex: 5000 = R$50,00 |
| `lifetime_budget` | lifetime_budget | DECIMAL | Ou daily, ou lifetime |
| `start_time` | start_time | TIMESTAMPTZ | Início da campanha |
| `stop_time` | stop_time | TIMESTAMPTZ | Término (NULL se contínua) |
| `created_at` | created_time | TIMESTAMPTZ | Criado no Meta |
| `updated_at` | updated_time | TIMESTAMPTZ | Última atualização |
| `fetched_at` | NOW() | TIMESTAMPTZ | Quando buscamos |

**Objectivos comuns:**
- `CONVERSIONS` - Conversões
- `ENGAGEMENT` - Engajamento
- `REACH` - Alcance
- `BRAND_AWARENESS` - Awareness de marca
- `TRAFFIC` - Tráfego
- `LEAD_GENERATION` - Geração de leads
- `MESSAGES` - Mensagens

---

## 📊 Tabela: `meta_ads_sync_log`

Log de execuções da sincronização.

| Coluna no Banco | Origem | Tipo | Descrição |
|-----------------|--------|------|-----------|
| `id` | Auto | UUID | ID do log |
| `started_at` | NOW() | TIMESTAMPTZ | Início da execução |
| `finished_at` | NOW() | TIMESTAMPTZ | Fim da execução |
| `status` | Calculado | TEXT | `success`, `error`, `partial` |
| `records_fetched` | Count | INTEGER | Total de registros na API |
| `records_inserted` | Count | INTEGER | Registros salvos no banco |
| `error_message` | Error | TEXT | Mensagem se falhou |
| `execution_time_ms` | Diff | INTEGER | Tempo total em ms |

---

## 🔢 Transformações de Tipo

### String → DECIMAL
```javascript
// API retorna: "4.36"
// Banco: 4.36
const spend = parseFloat(apiResponse.spend);
```

### String → INTEGER
```javascript
// API retorna: "82"
// Banco: 82
const impressions = parseInt(apiResponse.impressions, 10);
```

### Array → JSONB
```javascript
// API retorna: [{action_type: "lead", value: "3"}]
// Banco: JSONB (guarda como está)
const actions = JSON.stringify(apiResponse.actions);
```

### Budget (Centavos → Reais)
```javascript
// API retorna: 5000 (centavos)
// Banco: 50.00 (reais)
const daily_budget = apiResponse.daily_budget / 100;
```

---

## 📁 Relacionamentos

```
meta_ads_raw_insights
    │ 1:N
    ▼
meta_ads_insights
    │ 1:N
    ▼
meta_ads_insights_breakdowns

meta_ads_campaigns (independente, atualizado separadamente)
```

---

## 📝 Notas Importantes

1. **Valores NULL:** A API pode omitir campos em vez de retornar null. Tratar como NULL no banco.

2. **Currency:** Todos os valores monetários (`spend`, `budgets`) estão no currency da conta (`currency` na tabela account).

3. **Ações:** O campo `actions` é um array que pode ter dezenas de tipos diferentes. Guardamos como JSONB para flexibilidade.

4. **Breakdowns:** Quando usamos breakdowns na API, cada combinação vira uma linha na tabela `breakdowns`, ligada ao `insights` pai.

---

## 🔗 Links Relacionados

- [EVENTOS.md](./EVENTOS.md) - Endpoints disponíveis
- [EXEMPLOS-PAYLOADS.md](./EXEMPLOS-PAYLOADS.md) - Exemplos reais
- [PROCESSO-EXTRACAO.md](./PROCESSO-EXTRACAO.md) - Fluxo de extração

---

*Mapeamento baseado na Meta Marketing API v18.0*