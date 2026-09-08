# Meta Marketing API (Facebook/Instagram Ads) - Documentação

| Campo | Valor |
|-------|-------|
| **Nome** | Meta Marketing API |
| **Categoria** | Publicidade / Analytics |
| **Status** | Documentado |
| **Data** | 2026-02-18 |
| **Fonte** | https://developers.facebook.com/docs/marketing-api/ |
| **Versão** | v24.0 (mais recente) |
| **Preço** | Gratuito (apenas custos de anúncios) |

---

## 1. Visão Geral

### O que é
A Meta Marketing API (anteriormente Facebook Marketing API) permite gerenciar campanhas publicitárias do Facebook, Instagram, Messenger e Audience Network programaticamente. Com ela é possível:

- Criar e gerenciar campanhas, conjuntos de anúncios e anúncios
- Obter relatórios de performance (insights) com métricas detalhadas
- Gerenciar audiências customizadas
- Acessar bibliotecas criativas (imagens, vídeos)
- Automatizar otimizações

### Hierarquia de Objetos

```
Business Manager
    └── Ad Account (act_123456789)
            └── Campaigns (Campanhas)
                    └── Ad Sets (Conjuntos de Anúncios)
                            └── Ads (Anúncios)
                                    └── Ad Creatives (Criativos)
```

### Para que serve neste projeto
Puxar **100% dos dados** de performance das campanhas publicitárias:
- Métricas de alcance, impressões, cliques
- Custos (spend, CPC, CPM, CTR)
- Conversões e ROAS
- Dados demográficos (idade, gênero, localização)
- Performance por dispositivo, plataforma, posicionamento

---

## 2. Autenticação

### Tipo
OAuth 2.0 com Access Tokens

### Permissões Necessárias

| Permissão | Descrição | Obrigatória |
|-------------|-----------|-------------|
| `ads_read` | Ler dados de anúncios | ✅ Sim |
| `ads_management` | Criar/editar anúncios | ❌ Opcional (só para gerenciamento) |
| `business_management` | Gerenciar Business Manager | ❌ Opcional |

### Como obter credenciais

#### Passo 1: Criar App no Facebook Developers
1. Acesse: https://developers.facebook.com/
2. Crie um novo app (tipo "Business")
3. Adicione o produto "Marketing API"

#### Passo 2: Configurar permissões
1. No dashboard do app, vá em **App Review > Permissions and Features**
2. Solicite acesso a `ads_read` (acesso padrão é suficiente para leitura)
3. Se precisar de acesso avançado, solicite revisão do app

#### Passo 3: Gerar Access Token

**Token de Curta Duração (1 hora):**
```
https://www.facebook.com/v24.0/dialog/oauth?
  client_id={APP_ID}
  &redirect_uri={REDIRECT_URI}
  &scope=ads_read
```

**Token de Longa Duração (60 dias):**
```bash
curl -X GET "https://graph.facebook.com/v24.0/oauth/access_token?
  grant_type=fb_exchange_token
  &client_id={APP_ID}
  &client_secret={APP_SECRET}
  &fb_exchange_token={SHORT_LIVED_TOKEN}"
```

**Token de Usuário do Sistema (não expira):**
- Recomendado para aplicações server-to-server
- Requer Business Manager verificado

### Headers necessários

```http
GET /v24.0/act_{AD_ACCOUNT_ID}/insights HTTP/1.1
Host: graph.facebook.com
Authorization: Bearer {ACCESS_TOKEN}
```

### Variáveis de ambiente

```bash
# .env.local
META_APP_ID=seu_app_id_aqui
META_APP_SECRET=seu_app_secret_aqui
META_ACCESS_TOKEN=token_de_longa_duracao_aqui
META_AD_ACCOUNT_ID=act_123456789
```

---

## 3. Endpoints Principais

### Base URL
```
https://graph.facebook.com/v24.0
```

### Estrutura de Endpoints

| Objeto | Endpoint | Descrição |
|--------|----------|-----------|
| **Ad Account** | `/act_{AD_ACCOUNT_ID}` | Conta de anúncios |
| **Campaigns** | `/act_{AD_ACCOUNT_ID}/campaigns` | Campanhas |
| **Ad Sets** | `/act_{AD_ACCOUNT_ID}/adsets` | Conjuntos de anúncios |
| **Ads** | `/act_{AD_ACCOUNT_ID}/ads` | Anúncios |
| **Insights** | `/act_{AD_ACCOUNT_ID}/insights` | Métricas e relatórios |
| **Ad Creatives** | `/act_{AD_ACCOUNT_ID}/adcreatives` | Criativos |
| **Custom Audiences** | `/act_{AD_ACCOUNT_ID}/customaudiences` | Audiências |

### Endpoint: Insights (Métricas) ⭐

**GET /act_{AD_ACCOUNT_ID}/insights**

**Parâmetros obrigatórios:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `fields` | string | Campos a retornar (lista separada por vírgula) |

**Parâmetros opcionais:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `level` | enum | Nível de agregação: `account`, `campaign`, `adset`, `ad` |
| `time_range` | object | Período: `{"since":"2024-01-01","until":"2024-01-31"}` |
| `date_preset` | enum | Preset: `today`, `yesterday`, `last_7d`, `last_30d`, `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`, `last_year` |
| `breakdowns` | array | Dimensões: `age`, `gender`, `country`, `region`, `dma`, `impression_device`, `publisher_platform`, `platform_position`, etc |
| `filtering` | array | Filtros avançados |
| `limit` | int | Limite de resultados (padrão: 25, máx: 500) |
| `sort` | string | Ordenação: `spend_descending`, `impressions_descending` |

**Exemplo de Request:**
```bash
curl -G \
  -d "fields=campaign_name,spend,impressions,clicks,ctr,cpc,cpm,conversions,conversion_values" \
  -d "level=campaign" \
  -d "date_preset=last_30d" \
  -d "breakdowns=age,gender" \
  -d "limit=100" \
  -d "access_token={ACCESS_TOKEN}" \
  "https://graph.facebook.com/v24.0/act_{AD_ACCOUNT_ID}/insights"
```

**Exemplo de Response:**
```json
{
  "data": [
    {
      "campaign_name": "Campanha Black Friday",
      "spend": "1234.56",
      "impressions": "100000",
      "clicks": "5000",
      "ctr": "5.00",
      "cpc": "0.25",
      "cpm": "12.35",
      "conversions": [
        {"action_type": "purchase", "value": "150"},
        {"action_type": "add_to_cart", "value": "450"}
      ],
      "conversion_values": [
        {"action_type": "purchase", "value": "15000.00"}
      ],
      "age": "25-34",
      "gender": "female",
      "date_start": "2024-01-01",
      "date_stop": "2024-01-31"
    }
  ],
  "paging": {
    "cursors": {
      "before": "MAZDZD",
      "after": "MQZDZD"
    },
    "next": "https://graph.facebook.com/v24.0/act_..."
  }
}
```

### Endpoint: Campaigns

**GET /act_{AD_ACCOUNT_ID}/campaigns**

**Parâmetros:**
| Parâmetro | Descrição |
|-----------|-----------|
| `fields` | `id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time` |
| `effective_status` | Filtrar por status: `ACTIVE`, `PAUSED`, `ARCHIVED` |

**Exemplo:**
```bash
curl -G \
  -d "fields=id,name,status,objective,daily_budget" \
  -d "effective_status=['ACTIVE','PAUSED']" \
  -d "access_token={ACCESS_TOKEN}" \
  "https://graph.facebook.com/v24.0/act_{AD_ACCOUNT_ID}/campaigns"
```

### Endpoint: Ad Sets

**GET /act_{AD_ACCOUNT_ID}/adsets**

**Campos úteis:**
- `id`, `name`, `status`
- `daily_budget`, `lifetime_budget`
- `targeting` (audiência)
- `optimization_goal`
- `billing_event`
- `start_time`, `end_time`

### Endpoint: Ads

**GET /act_{AD_ACCOUNT_ID}/ads**

**Campos úteis:**
- `id`, `name`, `status`
- `creative` (referência ao criativo)
- `adset_id`, `campaign_id`
- `tracking_specs`

---

## 4. Métricas (Fields) Disponíveis

### Métricas Básicas

| Métrica | Descrição | Tipo |
|---------|-----------|------|
| `spend` | Gasto total | string (decimal) |
| `impressions` | Impressões | string (int) |
| `clicks` | Cliques totais | string (int) |
| `reach` | Alcance único | string (int) |
| `frequency` | Frequência média | string (decimal) |

### Métricas de Custo

| Métrica | Descrição | Fórmula |
|---------|-----------|---------|
| `cpc` | Custo por clique | spend / clicks |
| `cpm` | Custo por mil impressões | (spend / impressions) * 1000 |
| `ctr` | Taxa de cliques | (clicks / impressions) * 100 |
| `cpp` | Custo por resultado | spend / results |
| `cost_per_unique_click` | Custo por clique único | spend / unique_clicks |

### Métricas de Conversão

| Métrica | Descrição |
|---------|-----------|
| `conversions` | Lista de conversões por tipo |
| `conversion_values` | Valor das conversões |
| `cost_per_conversion` | Custo por conversão |
| `purchase_roas` | ROAS de compra |
| `actions` | Todas as ações (link_click, post_engagement, etc) |
| `cost_per_action_type` | Custo por tipo de ação |

### Métricas de Engajamento

| Métrica | Descrição |
|---------|-----------|
| `post_engagement` | Engajamento em posts |
| `page_engagement` | Engajamento na página |
| `link_click` | Cliques em links |
| `photo_view` | Visualizações de foto |
| `video_view` | Visualizações de vídeo |
| `video_p25_watched_actions` | 25% do vídeo assistido |
| `video_p50_watched_actions` | 50% do vídeo assistido |
| `video_p75_watched_actions` | 75% do vídeo assistido |
| `video_p95_watched_actions` | 95% do vídeo assistido |
| `video_p100_watched_actions` | 100% do vídeo assistido |
| `video_avg_time_watched_actions` | Tempo médio assistido |

### Métricas de Qualidade

| Métrica | Descrição |
|---------|-----------|
| `quality_ranking` | Ranking de qualidade |
| `engagement_rate_ranking` | Ranking de engajamento |
| `conversion_rate_ranking` | Ranking de conversão |

### Campos de Identificação

| Campo | Descrição |
|-------|-----------|
| `account_id` | ID da conta |
| `account_name` | Nome da conta |
| `campaign_id` | ID da campanha |
| `campaign_name` | Nome da campanha |
| `adset_id` | ID do conjunto |
| `adset_name` | Nome do conjunto |
| `ad_id` | ID do anúncio |
| `ad_name` | Nome do anúncio |

---

## 5. Breakdowns (Dimensões)

Permitem segmentar os dados:

| Breakdown | Descrição |
|-----------|-----------|
| `age` | Faixa etária |
| `gender` | Gênero |
| `country` | País |
| `region` | Região |
| `dma` | DMA (Designated Market Area) |
| `impression_device` | Dispositivo (iPhone, Android, Desktop) |
| `publisher_platform` | Plataforma (facebook, instagram, messenger, audience_network) |
| `platform_position` | Posição (feed, stories, reels, etc) |
| `device_platform` | Plataforma do dispositivo (mobile, desktop) |

**Exemplo combinando breakdowns:**
```
breakdowns=age,gender,country,publisher_platform
```

---

## 6. Rate Limits

### Limites por Conta de Anúncios

| Tipo de Acesso | Limite |
|----------------|--------|
| **Standard Access** | Limitado - adequado para desenvolvimento |
| **Advanced Access** | Maior capacidade - requer revisão do app |

### Header de Rate Limit

Cada resposta inclui headers com uso atual:

```http
X-FB-Ads-Insights-Throttle: {
  "app_id_util_pct": 45,        // % do limite do app usado
  "acc_id_util_pct": 20,        // % do limite da conta usado
  "ads_api_access_tier": "standard_access"
}

X-Ad-Account-Usage: {
  "acc_id_util_pct": 15
}
```

### Boas Práticas para Rate Limits

1. **Use filtros** para reduzir volume de dados
2. **Evite consultar dados muito antigos** (mais de 13 meses tem restrições)
3. **Use `date_preset`** em vez de ranges personalizados quando possível
4. **Use requisições assíncronas** para grandes volumes
5. **Monitore os headers** e implemente backoff quando próximo do limite

### Erro de Rate Limit

```json
{
  "error": {
    "message": "User request limit reached",
    "type": "OAuthException",
    "code": 4,
    "error_subcode": ...
  }
}
```

---

## 7. SDKs e Instalação

### JavaScript/TypeScript (Node.js)

```bash
npm install facebook-nodejs-business-sdk
```

```typescript
import bizSdk from 'facebook-nodejs-business-sdk';

const FacebookAdsApi = bizSdk.FacebookAdsApi;
const AdAccount = bizSdk.AdAccount;

FacebookAdsApi.init(process.env.META_ACCESS_TOKEN);

const account = new AdAccount(process.env.META_AD_ACCOUNT_ID);

account.getInsights(
  ['spend', 'impressions', 'clicks'],
  { date_preset: 'last_30d' }
).then((insights) => {
  console.log(insights);
});
```

### Python

```bash
pip install facebook-business
```

```python
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount

FacebookAdsApi.init(
  app_id='YOUR_APP_ID',
  app_secret='YOUR_APP_SECRET',
  access_token='YOUR_ACCESS_TOKEN'
)

account = AdAccount('act_<AD_ACCOUNT_ID>')
insights = account.get_insights(
  fields=['spend', 'impressions', 'clicks'],
  params={'date_preset': 'last_30d'}
)

for insight in insights:
  print(insight)
```

### PHP

```bash
composer require facebook/php-business-sdk
```

---

## 8. Exemplos de Uso

### Exemplo 1: Extrair todos os dados básicos

```typescript
const fetchCampaignData = async () => {
  const fields = [
    'campaign_name',
    'spend',
    'impressions',
    'clicks',
    'ctr',
    'cpc',
    'cpm',
    'reach',
    'frequency',
    'conversions',
    'conversion_values',
    'actions',
    'cost_per_action_type'
  ];

  const params = {
    level: 'campaign',
    date_preset: 'last_30d',
    breakdowns: ['age', 'gender'],
    limit: 500
  };

  const response = await fetch(
    `https://graph.facebook.com/v24.0/act_${AD_ACCOUNT_ID}/insights?` +
    `fields=${fields.join(',')}&` +
    `level=${params.level}&` +
    `date_preset=${params.date_preset}&` +
    `breakdowns=${params.breakdowns.join(',')}&` +
    `limit=${params.limit}&` +
    `access_token=${ACCESS_TOKEN}`
  );

  const data = await response.json();
  return data;
};
```

### Exemplo 2: Extrair dados por dispositivo e plataforma

```typescript
const fetchDeviceData = async () => {
  const fields = [
    'campaign_name',
    'adset_name',
    'ad_name',
    'spend',
    'impressions',
    'clicks',
    'conversions'
  ];

  const params = {
    level: 'ad',
    date_preset: 'last_7d',
    breakdowns: ['impression_device', 'publisher_platform', 'platform_position'],
    filtering: [{ field: 'ad.impressions', operator: 'GREATER_THAN', value: 0 }]
  };

  // Fetch data...
};
```

### Exemplo 3: Extrair dados históricos completos

```typescript
const fetchAllHistoricalData = async () => {
  const allData = [];
  let nextUrl = null;

  const baseUrl = `https://graph.facebook.com/v24.0/act_${AD_ACCOUNT_ID}/insights`;
  const params = new URLSearchParams({
    fields: 'campaign_name,spend,impressions,clicks,reach,conversions',
    level: 'campaign',
    time_range: JSON.stringify({ since: '2023-01-01', until: '2024-12-31' }),
    limit: '500',
    access_token: ACCESS_TOKEN
  });

  let url = `${baseUrl}?${params}`;

  do {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.data) {
      allData.push(...data.data);
    }

    nextUrl = data.paging?.next || null;
    url = nextUrl;

    // Respeitar rate limits
    if (nextUrl) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } while (nextUrl);

  return allData;
};
```

### Exemplo 4: Extrair conversões específicas

```typescript
const fetchConversions = async () => {
  const fields = [
    'campaign_name',
    'spend',
    'actions',
    'conversions',
    'conversion_values',
    'cost_per_conversion'
  ];

  const params = {
    level: 'campaign',
    date_preset: 'this_month',
    action_attribution_windows: ['1d_click', '7d_click', '28d_click', '1d_view']
  };

  // actions retornará todos os tipos de conversão:
  // - link_click
  // - post_engagement
  // - page_engagement
  // - purchase
  // - add_to_cart
  // - initiate_checkout
  // - lead
  // - complete_registration
  // - etc...
};
```

---

## 9. Webhooks

A Meta também fornece webhooks para notificações em tempo real sobre mudanças em anúncios.

### Eventos Disponíveis

| Evento | Descrição |
|--------|-----------|
| `ad_account_update` | Mudanças na conta |
| `campaign_update` | Mudanças em campanhas |
| `adset_update` | Mudanças em conjuntos |
| `ad_update` | Mudanças em anúncios |
| `leadgen_complete` | Novo lead gerado |

### Configuração
1. No dashboard do app, vá em **Webhooks**
2. Selecione "Ads Management"
3. Configure URL e token de verificação
4. Subscreva nos eventos desejados

---

## 10. Erros Comuns

| Código | Significado | Solução |
|--------|-------------|---------|
| 4 | Rate limit atingido | Implementar retry com backoff |
| 100 | Parâmetro inválido | Verificar campos e parâmetros |
| 190 | Access token expirado | Renovar token |
| 200 | Permissão negada | Verificar se tem acesso à conta |
| 80004 | Conta não encontrada | Verificar AD_ACCOUNT_ID |
| 1487534 | Limite de dados por chamada | Reduzir período ou campos |

---

## 11. Checklist de Integração

Antes de usar em produção:
- [ ] App criado no Facebook Developers
- [ ] Permissão `ads_read` concedida
- [ ] Access token gerado e testado
- [ ] ID da conta de anúncios confirmado
- [ ] Rate limits compreendidos
- [ ] Retry com exponential backoff implementado
- [ ] Paginação de resultados implementada
- [ ] Logs de erros configurados
- [ ] Cache para dados históricos (opcional)

---

## 12. Links Úteis

- [Documentação Oficial](https://developers.facebook.com/docs/marketing-api/)
- [Insights API Reference](https://developers.facebook.com/docs/marketing-api/insights/)
- [Fields Reference](https://developers.facebook.com/docs/marketing-api/insights/parameters/)
- [Breakdowns Reference](https://developers.facebook.com/docs/marketing-api/insights/breakdowns/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- [Business Manager](https://business.facebook.com/)

---

## 13. Notas do Projeto

### Decisões Tomadas

1. **Token**: Usar token de longa duração (60 dias) ou token de sistema
2. **Nível de dados**: Extrair no nível de `ad` para máxima granularidade
3. **Breakdowns padrão**: `age`, `gender`, `country`, `publisher_platform`
4. **Frequência**: Extrair diariamente para tabela própria

### Pendências

- [ ] Criar tabela `meta_ads_insights`
- [ ] Criar edge function para extração automática
- [ ] Configurar agendamento (cron)
- [ ] Documentar mapeamento de campos em `docs/webhooks-ghl/`

---

*Documentação criada em: 2026-02-18*  
*Meta Marketing API v24.0*
