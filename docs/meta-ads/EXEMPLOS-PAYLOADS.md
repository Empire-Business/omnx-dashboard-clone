# Meta Ads - Exemplos de Payloads

Exemplos reais de respostas da Meta Marketing API.

---

## 📊 Exemplo 1: Insights Básicos (Level: Campaign)

**Requisição:**
```bash
GET /act_716772443330289/insights?
  fields=campaign_name,spend,impressions,clicks,reach&
  level=campaign&
  date_preset=today
```

**Resposta:**
```json
{
  "data": [
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ALL",
      "spend": "4.36",
      "impressions": "82",
      "clicks": "3",
      "reach": "78",
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    },
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ACELERADOR",
      "spend": "2.75",
      "impressions": "41",
      "clicks": "0",
      "reach": "40",
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    }
  ],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "NAZDZD"
    },
    "next": "https://graph.facebook.com/v18.0/act_.../insights?after=NAZDZD"
  }
}
```

---

## 📊 Exemplo 2: Insights Completos (Level: Ad)

**Requisição:**
```bash
GET /act_716772443330289/insights?
  fields=campaign_name,adset_name,ad_name,spend,impressions,clicks,reach,frequency,ctr,cpc,cpm&
  level=ad&
  date_preset=today
```

**Resposta:**
```json
{
  "data": [
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ALL",
      "adset_name": "00 - MixEnvolvimento Empire",
      "ad_name": "M1_O1_P28_CR-2_PG12",
      "spend": "2.38",
      "impressions": "49",
      "clicks": "1",
      "reach": "48",
      "frequency": "1.020833",
      "ctr": "2.040816",
      "cpc": "2.38",
      "cpm": "48.571429",
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    }
  ],
  "paging": {
    "cursors": {
      "after": "MzAwNjQ3NzEwNzMZD"
    }
  }
}
```

---

## 📊 Exemplo 3: Insights com Actions (Conversões)

**Requisição:**
```bash
GET /act_716772443330289/insights?
  fields=campaign_name,spend,actions,conversions&
  level=campaign&
  date_preset=today
```

**Resposta:**
```json
{
  "data": [
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ALL",
      "spend": "4.36",
      "actions": [
        {
          "action_type": "link_click",
          "value": "3"
        },
        {
          "action_type": "page_engagement",
          "value": "25"
        },
        {
          "action_type": "landing_page_view",
          "value": "2"
        },
        {
          "action_type": "onsite_web_lead",
          "value": "1"
        },
        {
          "action_type": "lead",
          "value": "1"
        },
        {
          "action_type": "offsite_conversion.fb_pixel_lead",
          "value": "1"
        },
        {
          "action_type": "video_view",
          "value": "26"
        },
        {
          "action_type": "post_reaction",
          "value": "2"
        },
        {
          "action_type": "post_engagement",
          "value": "25"
        }
      ],
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    }
  ]
}
```

**Tipos de Actions comuns:**
| Action Type | Descrição |
|-------------|-----------|
| `link_click` | Clique em link |
| `landing_page_view` | Visualização da landing page |
| `lead` | Lead gerado |
| `onsite_web_lead` | Lead no site |
| `offsite_conversion.fb_pixel_lead` | Lead via Pixel |
| `page_engagement` | Engajamento na página |
| `post_engagement` | Engajamento no post |
| `video_view` | Visualização de vídeo |
| `post_reaction` | Reação no post |
| `purchase` | Compra |
| `add_to_cart` | Adicionar ao carrinho |
| `initiate_checkout` | Iniciar checkout |
| `complete_registration` | Registro completo |

---

## 📊 Exemplo 4: Insights com Breakdowns

**Requisição:**
```bash
GET /act_716772443330289/insights?
  fields=campaign_name,spend,impressions,clicks&
  level=campaign&
  breakdowns=publisher_platform,impression_device&
  date_preset=today
```

**Resposta:**
```json
{
  "data": [
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ALL",
      "spend": "2.18",
      "impressions": "41",
      "clicks": "2",
      "publisher_platform": "facebook",
      "impression_device": "iPhone",
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    },
    {
      "campaign_name": "O1_aplicacao-_19-01-2026_CBO_QUENTE_ENVOLVIMENTO_ALL",
      "spend": "2.18",
      "impressions": "41",
      "clicks": "1",
      "publisher_platform": "instagram",
      "impression_device": "Android Smartphone",
      "date_start": "2026-02-20",
      "date_stop": "2026-02-20"
    }
  ]
}
```

**Valores de Breakdowns:**

**publisher_platform:**
- `facebook`
- `instagram`
- `messenger`
- `audience_network`

**impression_device:**
- `iPhone`
- `iPad`
- `Android Smartphone`
- `Android Tablet`
- `Desktop`

---

## 📊 Exemplo 5: Erro de Rate Limit

**Requisição:**
```bash
GET /act_716772443330289/insights?...
# Após muitas chamadas...
```

**Resposta (Erro 4):**
```json
{
  "error": {
    "message": "User request limit reached",
    "type": "OAuthException",
    "code": 4,
    "error_subcode": null,
    "fbtrace_id": "ABC123XYZ"
  }
}
```

**Headers na resposta:**
```http
X-FB-Ads-Insights-Throttle: {
  "app_id_util_pct": 95,
  "acc_id_util_pct": 87,
  "ads_api_access_tier": "standard_access"
}
Retry-After: 60
```

---

## 📊 Exemplo 6: Erro de Token Expirado

**Resposta (Erro 190):**
```json
{
  "error": {
    "message": "Error validating access token: Session has expired on...",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 463,
    "fbtrace_id": "DEF456ABC"
  }
}
```

---

## 📊 Exemplo 7: Video Metrics

**Requisição:**
```bash
GET /act_716772443330289/insights?
  fields=video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_avg_time_watched_actions&
  level=ad
```

**Resposta:**
```json
{
  "data": [
    {
      "video_p25_watched_actions": [
        {"action_type": "video_view", "value": "156"}
      ],
      "video_p50_watched_actions": [
        {"action_type": "video_view", "value": "98"}
      ],
      "video_p75_watched_actions": [
        {"action_type": "video_view", "value": "45"}
      ],
      "video_p100_watched_actions": [
        {"action_type": "video_view", "value": "23"}
      ],
      "video_avg_time_watched_actions": [
        {"action_type": "video_view", "value": "12.5"}
      ]
    }
  ]
}
```

---

## 📊 Exemplo 8: Dados da Conta

**Requisição:**
```bash
GET /act_716772443330289?fields=id,name,account_status,amount_spent,currency,timezone_name
```

**Resposta:**
```json
{
  "id": "act_716772443330289",
  "name": "Bm 1 - Conta de anúncios",
  "account_status": 1,
  "amount_spent": "70320633",
  "currency": "BRL",
  "timezone_name": "America/Sao_Paulo"
}
```

**Interpretação:**
- `amount_spent`: Total gasto na conta em centavos do currency
  - Valor real: R$ 703.206,33 (BRL)

---

## 📝 Notas sobre Tipos de Dados

| Campo na API | Tipo na API | Tipo no Banco | Exemplo |
|--------------|-------------|---------------|---------|
| `spend` | string (decimal) | DECIMAL | "4.36" → 4.36 |
| `impressions` | string (int) | INTEGER | "82" → 82 |
| `ctr` | string (decimal) | DECIMAL | "2.040816" → 2.04 |
| `actions` | array[object] | JSONB | [{"action_type":"lead","value":"1"}] |
| `date_start` | string | DATE | "2026-02-20" |

---

## 🔗 Próximos Passos

- Veja como mapeamos esses campos: [MAPEAMENTO-CAMPOS.md](./MAPEAMENTO-CAMPOS.md)
- Entenda as regras de extração: [REGRAS-EXTRACAO.md](./REGRAS-EXTRACAO.md)

---

*Exemplos reais da conta act_716772443330289*