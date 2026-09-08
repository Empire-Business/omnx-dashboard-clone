# Meta Ads - Backfill Histórico

Guia para extrair dados históricos da Meta Marketing API de forma segura e controlada.

---

## 📊 Visão Geral

O backfill permite extrair dados desde uma data inicial (ex: 01/09/2025) até hoje, **dia por dia**, respeitando os rate limits da Meta API.

### Rate Limits da Meta

| Tipo | Limite |
|------|--------|
| Standard Access | 200 calls/hora por user |
| Nossa estratégia | 720 calls/hora (1 a cada 5s) |

### Estratégia de Segurança

1. **Extrair por dia** (não por hora) → Reduz 24x o número de chamadas
2. **1 chamada a cada 5 segundos** → Seguro dentro dos limites
3. **Controle de progresso** → Pode parar e retomar depois
4. **Salvar raw primeiro** → Processamento posterior
5. **Paginação automática** → Até 50 páginas por dia (25k registros)

---

## 🚀 Como Usar

### 1. Dry Run (Simulação)

Veja quantos dias serão processados sem salvar nada:

```bash
curl -X POST \
  https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-09-01",
    "data_fim": "2026-02-20",
    "dry_run": true
  }'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Dry run - nenhum dado será salvo",
  "controle_id": "uuid-gerado",
  "dias_pendentes": 173,
  "dias": ["2025-09-01", "2025-09-02", ...]
}
```

---

### 2. Iniciar Backfill Completo

Extrai todos os dados desde 01/09/2025 até hoje:

```bash
curl -X POST \
  https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-09-01",
    "data_fim": "2026-02-20"
  }'
```

**Tempo estimado:** ~14 minutos (173 dias × 5 segundos)

---

### 3. Extrair em Lotes (Recomendado)

Para não deixar a função rodando muito tempo, use `max_dias`:

```bash
# Extrair apenas 30 dias por vez
curl -X POST \
  https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-09-01",
    "data_fim": "2026-02-20",
    "max_dias": 30
  }'
```

Depois continue chamando até completar.

---

### 4. Continuar Backfill Existente

Se parou no meio, continue de onde parou:

```bash
curl -X POST \
  https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Content-Type: application/json" \
  -d '{
    "controle_id": "uuid-do-backfill",
    "max_dias": 30
  }'
```

---

## 📋 Controle via SQL

### Ver Status do Backfill

```sql
-- Ver todos os backfills
SELECT * FROM meta_ads_backfill_controle ORDER BY created_at DESC;

-- Ver progresso específico
SELECT * FROM ver_status_backfill('uuid-do-backfill');
```

### Ver Dias com Erro

```sql
-- Listar dias que falharam
SELECT * FROM listar_dias_backfill_erro('uuid-do-backfill');

-- Ver log detalhado
SELECT 
  data,
  status,
  registros_count,
  error_message,
  started_at,
  finished_at
FROM meta_ads_backfill_log
WHERE controle_id = 'uuid-do-backfill'
ORDER BY data;
```

### Pausar / Retomar

```sql
-- Pausar
SELECT pausar_backfill_meta_ads('uuid-do-backfill');

-- Retomar
SELECT retomar_backfill_meta_ads('uuid-do-backfill');
```

---

## 📈 Estimativas

| Período | Dias | Tempo Estimado | Chamadas API |
|---------|------|----------------|--------------|
| 1 mês | ~30 | ~2.5 minutos | ~30 |
| 3 meses | ~90 | ~7.5 minutos | ~90 |
| 6 meses | ~180 | ~15 minutos | ~180 |
| 1 ano | ~365 | ~30 minutos | ~365 |

> ⚠️ Se um dia tiver muitos dados (>500 registros), haverá paginação adicional.

---

## 🔍 Verificar Dados Extraídos

```sql
-- Total de registros por mês
SELECT 
  DATE_TRUNC('month', date) as mes,
  COUNT(*) as registros,
  SUM(spend) as total_spend,
  SUM(impressions) as total_impressoes,
  SUM(clicks) as total_cliques
FROM meta_ads_insights
GROUP BY 1
ORDER BY 1;

-- Campanhas encontradas
SELECT 
  campaign_id,
  campaign_name,
  MIN(date) as primeira_data,
  MAX(date) as ultima_data,
  COUNT(*) as dias_com_dados
FROM meta_ads_insights
GROUP BY campaign_id, campaign_name
ORDER BY total_spend DESC;
```

---

## ⚠️ Tratamento de Erros

### Se a API retornar erro em um dia:

1. O dia é marcado como `error` no log
2. O backfill continua com os próximos dias
3. Você pode ver os erros com `listar_dias_backfill_erro()`
4. Para reprocessar, altere o status no log:

```sql
-- Marcar dia com erro para retry
UPDATE meta_ads_backfill_log
SET status = 'pending', error_message = NULL
WHERE controle_id = 'uuid-do-backfill' 
  AND data = '2025-10-15';

-- Retomar o backfill
SELECT retomar_backfill_meta_ads('uuid-do-backfill');
```

### Rate Limit Atingido

Se atingir o rate limit (erro 4):
- A função para automaticamente
- Aguarde 1 hora
- Continue chamando com o mesmo `controle_id`

---

## 📝 Checklist

Antes de iniciar:
- [ ] Variáveis de ambiente configuradas (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`)
- [ ] Tabelas criadas (`meta_ads_raw_insights`, `meta_ads_insights`, etc)
- [ ] Edge Function deployada (`sync-meta-ads-backfill`)
- [ ] Fazer dry run primeiro
- [ ] Definir período adequado (recomendado: 30 dias por vez)

---

*Documentação criada em: 2026-02-20*  
*Edge Function: `sync-meta-ads-backfill`*
