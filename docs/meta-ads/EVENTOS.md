# Meta Ads - Endpoints e Eventos

Documentação dos endpoints da Meta Marketing API utilizados na integração.

---

## 🔗 Endpoints Principais

### Base URL
```
https://graph.facebook.com/v18.0
```

### Autenticação
Todas as requisições exigem:
```
access_token=SEU_TOKEN
```

---

## 📡 Endpoints Utilizados

### 1. Conta de Anúncios (Ad Account)

**Endpoint:** `GET /{AD_ACCOUNT_ID}`

**Descrição:** Obtém informações básicas da conta de anúncios.

**Parâmetros:**
| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `fields` | string | Sim | Campos a retornar |

**Exemplo:**
```bash
GET /act_716772443330289?fields=id,name,account_status,currency
```

**Resposta:**
```json
{
  "id": "act_716772443330289",
  "name": "Bm 1 - Conta de anúncios",
  "account_status": 1,
  "currency": "BRL"
}
```

**Status da conta:**
| Código | Significado |
|--------|-------------|
| 1 | ACTIVE (ativa) |
| 2 | DISABLED (desativada) |
| 3 | UNSETTLED (pagamento pendente) |
| 7 | PENDING_RISK_REVIEW (em análise) |
| 9 | IN_GRACE_PERIOD (período de carência) |
| 100 | PENDING_CLOSURE (pendente de fechamento) |
| 101 | CLOSED (fechada) |
| 201 | ANY_ACTIVE (qualquer ativa) |
| 202 | ANY_CLOSED (qualquer fechada) |

---

### 2. Insights (Métricas) ⭐ Principal

**Endpoint:** `GET /{AD_ACCOUNT_ID}/insights`

**Descrição:** Obtém métricas de performance (spend, impressões, cliques, conversões).

**Parâmetros obrigatórios:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `fields` | string | Lista de campos separados por vírgula |

**Parâmetros opcionais:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `level` | enum | account, campaign, adset, ad |
| `date_preset` | enum | today, yesterday, last_7d, last_30d, this_month |
| `time_range` | object | {"since":"2024-01-01","until":"2024-01-31"} |
| `breakdowns` | array | age, gender, country, publisher_platform |
| `filtering` | array | Filtros avançados |
| `limit` | int | Máximo de resultados (padrão: 25, máx: 500) |
| `action_attribution_windows` | array | Janelas de atribuição |

**Exemplo completo:**
```bash
GET /act_716772443330289/insights?
  fields=campaign_name,spend,impressions,clicks,ctr,cpc,actions&
  level=campaign&
  date_preset=today&
  breakdowns=publisher_platform&
  limit=100
```

---

### 3. Campanhas (Campaigns)

**Endpoint:** `GET /{AD_ACCOUNT_ID}/campaigns`

**Descrição:** Lista todas as campanhas da conta.

**Parâmetros:**
| Parâmetro | Descrição |
|-----------|-----------|
| `fields` | id, name, status, objective, daily_budget, lifetime_budget |
| `effective_status` | ACTIVE, PAUSED, DELETED, ARCHIVED |

**Exemplo:**
```bash
GET /act_716772443330289/campaigns?
  fields=id,name,status,objective,daily_budget&
  effective_status=['ACTIVE','PAUSED']
```

---

### 4. Conjuntos de Anúncios (Ad Sets)

**Endpoint:** `GET /{AD_ACCOUNT_ID}/adsets`

**Descrição:** Lista todos os adsets (conjuntos de anúncios).

**Campos úteis:**
- `id`, `name`, `status`
- `daily_budget`, `lifetime_budget`
- `targeting` (audiência detalhada)
- `optimization_goal`
- `billing_event`
- `start_time`, `end_time`

---

### 5. Anúncios (Ads)

**Endpoint:** `GET /{AD_ACCOUNT_ID}/ads`

**Descrição:** Lista todos os anúncios criativos.

**Campos úteis:**
- `id`, `name`, `status`
- `creative` (referência ao criativo)
- `adset_id`, `campaign_id`

---

## 📊 Levels (Níveis de Agregação)

O parâmetro `level` define a granularidade dos dados:

| Level | Dados retornados | Uso recomendado |
|-------|------------------|-----------------|
| `account` | Totais da conta | Visão geral rápida |
| `campaign` | Por campanha | Análise de campanha |
| `adset` | Por conjunto | Análise de audiência |
| `ad` | Por anúncio | Análise de criativo |

**Na nossa integração:** Usamos `level=ad` para máxima granularidade.

---

## 📅 Date Presets (Períodos Pré-definidos)

| Preset | Período |
|--------|---------|
| `today` | Hoje (até agora) |
| `yesterday` | Ontem completo |
| `last_3d` | Últimos 3 dias |
| `last_7d` | Últimos 7 dias |
| `last_14d` | Últimos 14 dias |
| `last_28d` | Últimos 28 dias |
| `last_30d` | Últimos 30 dias |
| `last_90d` | Últimos 90 dias |
| `this_month` | Mês atual (até agora) |
| `last_month` | Mês passado completo |
| `this_quarter` | Trimestre atual |
| `this_year` | Ano atual |
| `last_year` | Ano passado |

**Na nossa integração:** Usamos `today` para extrair dados do dia atual a cada hora.

---

## 🔍 Breakdowns (Segmentações)

Permitem dividir os dados em dimensões:

| Breakdown | Descrição | Exemplo |
|-----------|-----------|---------|
| `age` | Faixa etária | 18-24, 25-34, 35-44... |
| `gender` | Gênero | male, female, unknown |
| `country` | País | BR, US, AR... |
| `region` | Região/Estado | São Paulo, Rio de Janeiro... |
| `dma` | DMA (mercado designado) | São Paulo DMA |
| `impression_device` | Dispositivo | iPhone, Android, Desktop |
| `publisher_platform` | Plataforma | facebook, instagram, messenger, audience_network |
| `platform_position` | Posição | feed, stories, reels, marketplace |

**Limite:** Máximo 3 breakdowns por requisição.

**Combinações comuns:**
```
breakdowns=age,gender,publisher_platform
breakdowns=impression_device,publisher_platform
breakdowns=country,region
```

---

## ⏱️ Rate Limits

### Limites por Conta

| Tipo de Acesso | Limite |
|----------------|--------|
| Standard Access | ~200 chamadas/hora/conta |
| Advanced Access | Maior capacidade (requer aprovação) |

### Headers de Rate Limit

```http
X-FB-Ads-Insights-Throttle: {
  "app_id_util_pct": 45,
  "acc_id_util_pct": 20,
  "ads_api_access_tier": "standard_access"
}
```

### Boas Práticas

1. Use `limit` máximo (500) para reduzir chamadas
2. Evite ranges muito grandes (> 90 dias)
3. Implemente retry com exponential backoff
4. Monitore os headers de throttle

---

## 🔄 Paginação

Quando há mais resultados que o `limit`:

```json
{
  "data": [...],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "MQZDZD"
    },
    "next": "https://graph.facebook.com/v18.0/act_...?after=MQZDZD"
  }
}
```

**Como paginar:**
```bash
# Primeira página
GET /insights?limit=500

# Próximas páginas (usar URL do 'next')
GET /insights?limit=500&after=MQZDZD
```

---

## 📚 Documentação Oficial

- [Insights API Reference](https://developers.facebook.com/docs/marketing-api/insights/)
- [Fields Reference](https://developers.facebook.com/docs/marketing-api/insights/parameters/)
- [Breakdowns Reference](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)

---

*Documentação baseada na Meta Marketing API v18.0*