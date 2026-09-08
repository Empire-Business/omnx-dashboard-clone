# Meta Ads - Processo de Extração

Documentação completa do fluxo de extração de dados da Meta Marketing API.

---

## 🔄 Visão Geral do Fluxo

```
┌──────────────────────────────────────────────────────────────────────┐
│                         FLUXO COMPLETO                                │
└──────────────────────────────────────────────────────────────────────┘

HORA: 14:00
      │
      ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   pg_cron Job    │────▶│  Edge Function   │────▶│    Meta API      │
│  (1 em 1 hora)   │     │  sync-meta-ads   │     │  /insights       │
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                │                          │
                                │                          │
                                │◄─────────────────────────┘
                                │     JSON Response
                                │
                                ▼
                       ┌──────────────────┐
                       │  meta_ads_raw_   │  ◄── Fonte de verdade
                       │  insights        │      (JSON bruto)
                       └──────────────────┘
                                │
                                │ Processa
                                ▼
                       ┌──────────────────┐
                       │  meta_ads_       │  ◄── Métricas
                       │  insights        │      normalizadas
                       └──────────────────┘
                                │
                                │ Se houver breakdowns
                                ▼
                       ┌──────────────────┐
                       │  meta_ads_       │  ◄── Segmentações
                       │  insights_       │
                       │  breakdowns      │
                       └──────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  meta_ads_       │  ◄── Log da execução
                       │  sync_log        │
                       └──────────────────┘
```

---

## 📋 Etapas Detalhadas

### ETAPA 1: Disparo do Cron (pg_cron)

**Quando:** A cada 1 hora (ex: 14:00, 15:00, 16:00...)

**Como:**
```sql
SELECT cron.schedule(
  'sync-meta-ads-hourly',
  '0 * * * *',  -- Toda hora no minuto 0
  'SELECT sync_meta_ads_job();'
);
```

**O que faz:**
- Chama a função PostgreSQL `sync_meta_ads_job()`
- Essa função invoca a Edge Function via HTTP

---

### ETAPA 2: Edge Function `sync-meta-ads`

**Arquivo:** `supabase/functions/sync-meta-ads/index.ts`

**Passos:**

#### 2.1 - Inicialização
```typescript
// 1. Ler variáveis de ambiente
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN');
const AD_ACCOUNT_ID = Deno.env.get('META_AD_ACCOUNT_ID');

// 2. Iniciar log
const syncLog = {
  started_at: new Date().toISOString(),
  status: 'running',
  records_fetched: 0,
  records_inserted: 0
};
```

#### 2.2 - Chamar Meta API
```typescript
// Construir URL
const url = new URL(`https://graph.facebook.com/v18.0/${AD_ACCOUNT_ID}/insights`);

// Adicionar parâmetros
url.searchParams.append('fields', 'campaign_name,adset_name,ad_name,spend,impressions,clicks,reach,frequency,ctr,cpc,cpm,actions,conversions');
url.searchParams.append('level', 'ad');
url.searchParams.append('date_preset', 'today');
url.searchParams.append('limit', '500');

// Fazer requisição
const response = await fetch(url.toString(), {
  headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
});
```

#### 2.3 - Salvar JSON Bruto
```typescript
const responseData = await response.json();

// Inserir na tabela raw
const { data: rawData, error: rawError } = await supabase
  .from('meta_ads_raw_insights')
  .insert({
    api_endpoint: '/insights',
    params: { level: 'ad', date_preset: 'today', ... },
    response_data: responseData,  // ⭐ JSON BRUTO
    http_status: response.status,
    records_count: responseData.data?.length || 0,
    fetch_started_at: startTime,
    fetch_finished_at: new Date().toISOString(),
    processado_em: null  // Marca como não processado
  })
  .select('id')
  .single();
```

---

### ETAPA 3: Processamento (Função PostgreSQL)

**Função:** `processar_meta_ads_raw(raw_id UUID)`

**Chamada:**
```sql
-- Processa um registro raw específico
SELECT processar_meta_ads_raw('uuid-do-raw');

-- Ou processa todos os pendentes
SELECT processar_meta_ads_pendentes();
```

**Passos:**

#### 3.1 - Ler JSON Bruto
```sql
DECLARE
  v_raw_record RECORD;
  v_insight_data JSONB;
BEGIN
  -- Buscar o registro raw
  SELECT * INTO v_raw_record 
  FROM meta_ads_raw_insights 
  WHERE id = p_raw_id;
  
  -- Extrair array de dados
  v_insight_data := v_raw_record.response_data->'data';
```

#### 3.2 - Inserir em `meta_ads_insights`
```sql
  -- Loop através de cada insight
  FOR i IN 0..jsonb_array_length(v_insight_data) - 1 LOOP
    INSERT INTO meta_ads_insights (
      account_id,
      campaign_id,
      adset_id,
      ad_id,
      date,
      hour,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      ctr,
      cpc,
      cpm,
      actions,
      conversions,
      raw_insight_id,
      fetched_at
    )
    SELECT
      v_raw_record.params->>'account_id',
      v_insight_data->i->>'campaign_id',
      v_insight_data->i->>'adset_id',
      v_insight_data->i->>'ad_id',
      (v_insight_data->i->>'date_start')::DATE,
      EXTRACT(HOUR FROM v_raw_record.fetch_finished_at)::INTEGER,
      (v_insight_data->i->>'spend')::DECIMAL,
      (v_insight_data->i->>'impressions')::INTEGER,
      (v_insight_data->i->>'clicks')::INTEGER,
      (v_insight_data->i->>'reach')::INTEGER,
      (v_insight_data->i->>'frequency')::DECIMAL,
      (v_insight_data->i->>'ctr')::DECIMAL,
      (v_insight_data->i->>'cpc')::DECIMAL,
      (v_insight_data->i->>'cpm')::DECIMAL,
      v_insight_data->i->'actions',
      v_insight_data->i->'conversions',
      p_raw_id,
      v_raw_record.fetch_finished_at;
```

#### 3.3 - Inserir Breakdowns (se houver)
```sql
    -- Se tem breakdowns, inserir na tabela separada
    IF v_raw_record.params ? 'breakdowns' THEN
      INSERT INTO meta_ads_insights_breakdowns (
        insights_id,
        age,
        gender,
        country,
        publisher_platform,
        spend,
        impressions,
        clicks
      )
      SELECT
        currval('meta_ads_insights_id_seq'),
        v_insight_data->i->>'age',
        v_insight_data->i->>'gender',
        v_insight_data->i->>'country',
        v_insight_data->i->>'publisher_platform',
        (v_insight_data->i->>'spend')::DECIMAL,
        (v_insight_data->i->>'impressions')::INTEGER,
        (v_insight_data->i->>'clicks')::INTEGER;
    END IF;
  END LOOP;
```

#### 3.4 - Marcar como Processado
```sql
  -- Atualizar raw como processado
  UPDATE meta_ads_raw_insights
  SET processado_em = NOW()
  WHERE id = p_raw_id;
  
END;
```

---

### ETAPA 4: Log de Execução

**Tabela:** `meta_ads_sync_log`

**Inserção:**
```sql
INSERT INTO meta_ads_sync_log (
  started_at,
  finished_at,
  status,
  records_fetched,
  records_inserted,
  execution_time_ms
)
VALUES (
  '2026-02-20 14:00:00',
  '2026-02-20 14:00:15',
  'success',
  150,
  150,
  15000
);
```

---

## 🔄 Fluxo de Erros

### Se a Meta API retornar erro:

```
Meta API
    │
    ▼ Erro 4xx/5xx
Edge Function
    │
    ▼ Salva erro no raw
┌──────────────────┐
│  meta_ads_raw_   │  ◄── error_details preenchido
│  insights        │      processado_em = NULL
└──────────────────┘
    │
    ▼ Loga erro
┌──────────────────┐
│  meta_ads_       │  ◄── status = 'error'
│  sync_log        │
└──────────────────┘
```

### Retry Automático:

```typescript
// Implementação de retry com exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      // Se rate limit, espera e tenta novamente
      if (response.status === 429) {
        const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
    }
  }
}
```

---

## ⏱️ Timestamps Importantes

| Timestamp | Onde é gerado | Significado |
|-----------|---------------|-------------|
| `fetch_started_at` | Edge Function | Momento da chamada à API |
| `fetch_finished_at` | Edge Function | Momento da resposta da API |
| `fetched_at` | Copiado para insights | Igual ao fetch_finished_at |
| `created_at` | Banco (default) | Quando inserimos no banco |
| `processado_em` | Função PostgreSQL | Quando processamos o raw |

---

## 📊 Queries Úteis

### Ver últimas extrações:
```sql
SELECT 
  date_trunc('hour', fetch_finished_at) as hora,
  COUNT(*) as registros_raw,
  SUM(records_count) as total_api
FROM meta_ads_raw_insights
GROUP BY 1
ORDER BY 1 DESC
LIMIT 24;
```

### Ver taxa de processamento:
```sql
SELECT 
  DATE(fetch_finished_at) as data,
  COUNT(*) FILTER (WHERE processado_em IS NOT NULL) as processados,
  COUNT(*) FILTER (WHERE processado_em IS NULL) as pendentes,
  COUNT(*) FILTER (WHERE error_details IS NOT NULL) as erros
FROM meta_ads_raw_insights
GROUP BY 1
ORDER BY 1 DESC;
```

### Reprocessar falhos:
```sql
-- Reprocessar registros com erro
SELECT processar_meta_ads_raw(id)
FROM meta_ads_raw_insights
WHERE error_details IS NOT NULL
  AND processado_em IS NULL;
```

---

## 🔒 Segurança

### Onde fica cada dado sensível:

| Dado | Local | Segurança |
|------|-------|-----------|
| `META_ACCESS_TOKEN` | `.env.local` | Nunca commitado |
| `META_APP_SECRET` | `.env.local` | Nunca exposto |
| JSON Bruto | `meta_ads_raw_insights` | Apenas server-side |
| Métricas | `meta_ads_insights` | RLS configurado |

### RLS (Row Level Security):

```sql
-- Apenas usuários autenticados podem ler
CREATE POLICY "Enable read access for authenticated users"
ON meta_ads_insights
FOR SELECT
TO authenticated
USING (true);

-- Ninguém pode deletar (append-only)
CREATE POLICY "Disable delete"
ON meta_ads_insights
FOR DELETE
TO authenticated
USING (false);
```

---

## 📈 Escalabilidade

### Paginação:

Se a API retornar mais de 500 registros:

```typescript
let nextUrl = initialUrl;
const allData = [];

while (nextUrl) {
  const response = await fetch(nextUrl);
  const data = await response.json();
  
  allData.push(...data.data);
  
  // Salvar cada página como raw separado
  await saveRaw(data);
  
  nextUrl = data.paging?.next || null;
  
  // Respeitar rate limit
  if (nextUrl) await sleep(1000);
}
```

### Batch Insert:

Para não sobrecarregar o banco:

```typescript
// Inserir em lotes de 100
const batchSize = 100;
for (let i = 0; i < insights.length; i += batchSize) {
  const batch = insights.slice(i, i + batchSize);
  await supabase.from('meta_ads_insights').insert(batch);
}
```

---

## 📝 Checklist de Implementação

- [ ] Edge Function criada e deployada
- [ ] Variáveis de ambiente configuradas no Supabase
- [ ] Tabelas criadas no banco
- [ ] Função `processar_meta_ads_raw()` criada
- [ ] Cron job configurado (1h)
- [ ] RLS configurado nas tabelas
- [ ] Retry com exponential backoff implementado
- [ ] Paginação implementada
- [ ] Logs de erro funcionando
- [ ] Teste manual realizado
- [ ] Monitoramento configurado

---

## 🔗 Links Relacionados

- [REGRAS-EXTRACAO.md](./REGRAS-EXTRACAO.md) - Regras de negócio
- [MAPEAMENTO-CAMPOS.md](./MAPEAMENTO-CAMPOS.md) - Mapeamento de campos
- [EVENTOS.md](./EVENTOS.md) - Endpoints da API

---

*Processo baseado na Meta Marketing API v18.0*