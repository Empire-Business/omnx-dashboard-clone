# Meta Ads - Regras de Extração

Regras de negócio e decisões sobre como extrair e processar dados da Meta Marketing API.

---

## 🎯 Regras Fundamentais

### R1: Extração Hourly (A Cada 1 Hora)

**Regra:** A sincronização deve rodar **a cada 1 hora**, no minuto 0.

**Por quê:**
- Dados do dia atual são acumulativos na Meta API
- Extrair a cada hora nos dá granularidade temporal
- Não sobrecarrega a API (rate limits)

**Implementação:**
```sql
-- Cron: Toda hora no minuto 0
SELECT cron.schedule(
  'sync-meta-ads-hourly',
  '0 * * * *',
  'SELECT sync_meta_ads_job();'
);
```

**Exemplo:**
- 14:00 → Extrai dados de 00:00 até 14:00 do dia atual
- 15:00 → Extrai dados de 00:00 até 15:00 do dia atual (acumulativo)

---

### R2: Sempre Salvar JSON Bruto (Raw First)

**Regra:** Antes de qualquer processamento, salvar o **JSON completo** da resposta da API.

**Por quê:**
- Fonte de verdade sempre preservada
- Permite reprocessamento se houver erro
- Facilita debug e auditoria
- Segue mesmo padrão dos webhooks GHL

**Fluxo obrigatório:**
```
API → JSON Bruto (raw_insights) → Processamento → insights/breakdowns
```

**NUNCA:**
```
API → Processamento direto → insights (sem salvar raw)
```

---

### R3: Todas as Métricas Disponíveis

**Regra:** Extrair **todas as métricas** possíveis, mesmo que não usemos agora.

**Lista obrigatória:**
```
Básicas:     spend, impressions, clicks, reach, frequency
Custo:       ctr, cpc, cpm, cpp
Conversão:   conversions, conversion_values, actions, cost_per_action_type
Engajamento: post_engagement, page_engagement, link_click, video_view
Vídeo:       video_p25, p50, p75, p95, p100_watched_actions
Qualidade:   quality_ranking, engagement_rate_ranking
```

**Por quê:**
- É mais fácil ignorar campos do que adicionar depois
- Meta API tem limitação de histórico (13 meses)
- Se precisarmos no futuro, já teremos os dados

---

### R4: Level = Ad (Máxima Granularidade)

**Regra:** Sempre extrair no nível `ad` (anúncio), nunca em níveis superiores.

**Comparação:**
| Level | Granularidade | Quando usar |
|-------|---------------|-------------|
| `account` | Total da conta | Overview rápido |
| `campaign` | Por campanha | Análise de campanha |
| `adset` | Por conjunto | Análise de audiência |
| `ad` ✅ | Por anúncio | **Análise de criativo** |

**Por quê:**
- Podemos agregar depois (campaign = SUM por campaign_id)
- Não podemos desagregar (campanha → anúncio é impossível)
- Criativo é o que mais impacta performance

**Exceção:** Para atualizar metadados de campanhas (`meta_ads_campaigns`), usar endpoint separado `/campaigns`.

---

### R5: Date Preset = Today

**Regra:** Usar sempre `date_preset=today` para extrair dados do dia atual.

**Por quê:**
- Dados históricos da Meta API são "finalizados" após 28h
- Dados de hoje são "provisórios" e mudam ao longo do dia
- Extrair today a cada hora nos dá evolução do dia

**Comportamento:**
```
14:00 → Retorna dados de 00:00 até 14:00
15:00 → Retorna dados de 00:00 até 15:00 (inclui 14:00-15:00)
```

**Atenção:** Isso significa que teremos **dados duplicados** se não tratarmos:

| Hora | Registro | Spend |
|------|----------|-------|
| 14:00 | Campanha X | R$ 100,00 |
| 15:00 | Campanha X | R$ 120,00 (R$ 100 + R$ 20 novos) |

**Solução:** Usar `fetched_at` + `date` como chave de upsert.

---

### R6: Upsert por (date, hour, ad_id)

**Regra:** Nunca duplicar registros. Usar UPSERT com chave composta.

**Chave única:** `(date, hour, ad_id)`

**Implementação:**
```sql
INSERT INTO meta_ads_insights (
  date, hour, ad_id, spend, impressions, ...
)
VALUES (...)
ON CONFLICT (date, hour, ad_id) 
DO UPDATE SET
  spend = EXCLUDED.spend,
  impressions = EXCLUDED.impressions,
  updated_at = NOW();
```

**Por quê:**
- Se rodar o job 2x na mesma hora, não duplica
- Se a Meta ajustar dados retroativamente, atualizamos
- Mantém consistência do banco

---

### R7: Tratamento de Rate Limits

**Regra:** Implementar retry com exponential backoff ao receber erro 429 (rate limit).

**Estratégia:**
```
Tentativa 1: Falha (429)
   ↓ Espera 1 segundo
Tentativa 2: Falha (429)
   ↓ Espera 2 segundos
Tentativa 3: Falha (429)
   ↓ Espera 4 segundos
Tentativa 4: Falha → Aborta e loga erro
```

**Código:**
```typescript
const delays = [1000, 2000, 4000]; // ms

for (let i = 0; i < delays.length; i++) {
  const response = await fetch(url);
  
  if (response.status === 429) {
    await sleep(delays[i]);
    continue;
  }
  
  return response;
}

throw new Error('Rate limit exceeded after retries');
```

---

### R8: Paginação Automática

**Regra:** Se houver mais de 500 resultados, buscar todas as páginas automaticamente.

**Limite da API:** `limit=500` (máximo)

**Fluxo:**
```
Chamada 1: Retorna 500 registros + next cursor
   ↓ Usa cursor
Chamada 2: Retorna 500 registros + next cursor
   ↓ Usa cursor
Chamada 3: Retorna 123 registros (sem next)
   ↓ Fim
```

**Cada página é salva como raw separado** (não concatena tudo em um JSON só).

---

### R9: Dados de Conta em Tabela Separada

**Regra:** Metadados de campanhas (nome, status, orçamento) devem ficar em tabela separada (`meta_ads_campaigns`).

**Frequência:** Atualizar 1x ao dia (não a cada hora).

**Por quê:**
- Nome/status muda pouco
- Evita poluir a tabela de insights (que muda toda hora)
- Facilita JOINs para relatórios

**Cron separado:**
```sql
-- Uma vez ao dia às 6h
SELECT cron.schedule(
  'sync-meta-campaigns-daily',
  '0 6 * * *',
  'SELECT sync_meta_campaigns_job();'
);
```

---

### R10: Breakdowns Opcionais

**Regra:** Breakdowns (segmentações) são opcionais. Se usados, salvar em tabela separada.

**Comportamento:**
```
Sem breakdowns:
  API → raw → insights (apenas)

Com breakdowns:
  API → raw → insights → breakdowns (1:N)
```

**Por quê:**
- Uma linha de insight pode ter múltiplas segmentações
- Ex: mesma campanha tem dados para 18-24, 25-34, etc
- Normalização do banco

**Implementação:**
```sql
-- insights
INSERT INTO meta_ads_insights (...) VALUES (...) RETURNING id;

-- breakdowns (para cada combinação)
INSERT INTO meta_ads_insights_breakdowns (insights_id, age, gender, spend, ...)
VALUES (last_id, '25-34', 'female', 12.50, ...);
```

---

### R11: Tratamento de Erros

**Regra:** Todo erro deve ser logado com detalhes suficientes para debug.

**O que salvar:**
```json
{
  "error_details": {
    "message": "User request limit reached",
    "code": 4,
    "type": "OAuthException",
    "fbtrace_id": "ABC123",
    "timestamp": "2026-02-20T14:05:00Z"
  }
}
```

**Status no sync_log:**
- `success` - Tudo funcionou
- `partial` - Alguns dados salvos, outros falharam
- `error` - Falha total

**Alerta:** Erros devem ser monitorados (futuro: notificação).

---

### R12: Currency em Conta

**Regra:** Todos os valores monetários estão no currency da conta. Não converter.

**Conta atual:** `BRL` (Reais)

**Onde verificar:**
```bash
GET /act_716772443330289?fields=currency
# Retorna: "BRL"
```

**Campos afetados:**
- `spend`
- `daily_budget` (na tabela campaigns)
- `lifetime_budget`

**Conversão:** A Meta já retorna em reais (não em centavos).

---

### R13: Actions como JSONB

**Regra:** O campo `actions` (array de conversões) deve ser salvo como JSONB sem modificação.

**Por quê:**
- Meta tem ~50 tipos diferentes de actions
- Tipos variam por campanha (leads, compras, etc)
- Estrutura muda com o tempo

**Query para extrair dados:**
```sql
-- Quantos leads hoje?
SELECT 
  date,
  SUM((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value'))::int) as leads
FROM meta_ads_insights
WHERE date = '2026-02-20'
GROUP BY date;
```

---

## 🧮 Regras de Cálculo

### Cálculo de Métricas Derivadas

Algumas métricas NÃO vêm da API, mas podemos calcular:

| Métrica | Fórmula | Vem da API? |
|---------|---------|-------------|
| CTR | (clicks / impressions) × 100 | ✅ Sim |
| CPC | spend / clicks | ✅ Sim |
| CPM | (spend / impressions) × 1000 | ✅ Sim |
| ROAS | conversion_value / spend | ❌ Calcular |
| CPA | spend / conversions | ❌ Calcular |

**Regra:** Usar valores da API quando disponíveis, calcular apenas se necessário.

---

## 📋 Checklist de Conformidade

Antes de colocar em produção, verificar:

- [ ] Job rodando a cada 1 hora (minuto 0)
- [ ] JSON bruto sendo salvo antes do processamento
- [ ] Todas as métricas sendo extraídas
- [ ] Level = ad em todas as chamadas
- [ ] Date preset = today
- [ ] Upsert implementado (não duplica dados)
- [ ] Retry com exponential backoff
- [ ] Paginação automática
- [ ] Campaigns em tabela separada (atualização diária)
- [ ] Breakdowns em tabela separada
- [ ] Erros sendo logados com detalhes
- [ ] Currency verificado (BRL)
- [ ] Actions salvo como JSONB

---

## 🔄 Comparação com Webhooks GHL

| Aspecto | Webhooks GHL | Meta Ads API |
|---------|--------------|--------------|
| **Disparo** | Evento do GHL (real-time) | Cron job (1h) |
| **Origem** | Webhook push | API pull |
| **Dados** | Payload JSON | Query parameters |
| **Raw** | `webhooks_ghl` | `meta_ads_raw_insights` |
| **Processamento** | Função trigger/cron | Função PostgreSQL |
| **Frequência** | Imediata | A cada 1 hora |

---

## ❓ FAQ

**P: Por que não extrair a cada 5 minutos?**
R: Rate limits da Meta API (limite por hora/conta) + dados de hoje são acumulativos.

**P: E se a Meta API estiver fora do ar?**
R: Retry automático. Se falhar todas as tentativas, loga erro. Próxima hora tenta novamente.

**P: Posso extrair dados de ontem?**
R: Sim, mudando `date_preset=yesterday`, mas use com moderação (histórico consome mais quota).

**P: Como sei se os dados estão corretos?**
R: Comparar com Meta Ads Manager. Devem ser idênticos (pode ter delay de alguns minutos).

---

## 🔗 Links Relacionados

- [PROCESSO-EXTRACAO.md](./PROCESSO-EXTRACAO.md) - Fluxo técnico detalhado
- [MAPEAMENTO-CAMPOS.md](./MAPEAMENTO-CAMPOS.md) - Mapeamento de campos
- [EVENTOS.md](./EVENTOS.md) - Endpoints da API

---

*Regras baseadas na Meta Marketing API v18.0*