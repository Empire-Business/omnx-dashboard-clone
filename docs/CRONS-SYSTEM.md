# Sistema de Crons — Agendamento Automático

**Atualizado:** 2026-03-16

---

## 📋 Lista Completa dos Crons

### 1️⃣ `sync-opp-dates` — A cada **10 minutos**

**O que faz:**
Sincroniza o campo `data_lead_recebido` (data que o lead foi criado no GHL) para oportunidades que chegaram sem essa informação.

**Por quê?**
O webhook do GHL às vezes não traz o `createdAt` da oportunidade. Sem essa data, o lead desaparece do **cohort** de tráfego (não tem mês de geração para análise).

**Como funciona:**
- Edge function: `supabase/functions/sync-opp-dates/index.ts`
- Busca opps com `data_lead_recebido = NULL`
- Chama API GHL: `GET /opportunities/{id}` → extrai `createdAt`
- Atualiza banco: 1 opp por vez, com delay de 130ms (rate limit GHL)
- Rate limit: 100 req / 10s (implementa backoff exponencial em caso de 429)

**Consumo:**
- Típico: 0-10 opps/ciclo (maioria já tem data)
- Pico: até 500 opps (backfill)
- Custo: ~13 req/ciclo (seguro)

**Migration:**
`20260314300000_create_sync_opp_dates_cron.sql`

---

### 2️⃣ `sync-opp-pipelines` — A cada **10 minutos**

**O que faz:**
Sincroniza `pipeline_id` e `pipeline_name` para oportunidades incompletas.

**Por quê?**
Webhook chegam às vezes SEM pipeline (`pipeline_id = NULL`) ou com `pipeline_id` mas SEM `pipeline_name`. Sem pipeline, o lead fica **invisível no dashboard** (filtros excluem NULL automaticamente).

**Como funciona:**
- Edge function: `supabase/functions/sync-opp-pipelines/index.ts`
- Busca opps com `pipeline_id = NULL` OU `pipeline_name = NULL`
- Chama API GHL: `GET /opportunities/{id}` → extrai `pipelineId` e `pipelineName`
- Atualiza banco com ambos os campos
- Rate limit: 100 req / 10s com delay de 130ms

**Consumo:**
- Típico: 50-100 opps/ciclo (novos webhooks incompletos)
- Custo: ~100 req/ciclo

**Status atual (2026-03-16):**
- ✅ Backfill de 4356 opps = COMPLETO
- ⏳ Contínuo: novos webhooks chegando SEM `pipeline_name` (~74+ por ciclo)
- ⚠️ **Problema de raiz:** webhook GHL não traz `pipeline_name` em alguns casos

**Migration:**
`20260321000000_cron_sync_opp_pipelines.sql`

---

### 3️⃣ `sync-ghl-conversations-incremental` — A cada **30 minutos**

**O que faz:**
Sincroniza mensagens e ligações (comunicações) entre GHL e Supabase em tempo próximo do real.

**Por quê?**
Análise de tempo de resposta, contagem de mensagens e padrão de comunicação do SDR depende de dados atualizados. 30 minutos é o balanço entre:
- Ser recente o suficiente para dashboard (vs 2h anterior)
- Respeitar rate limit GHL (200k req/dia)

**Como funciona:**
- Edge function: `supabase/functions/sync-ghl-conversations/index.ts`
- Modo incremental: apenas últimas conversas atualizadas (vs full sync)
- Chama API GHL: `GET /conversations` com filtros de data
- Insere/atualiza tabela `comunicacoes`

**Consumo estimado:**
- Conversas ativas: ~20-80 por ciclo
- Requisições: ~40-160 por ciclo
- Diário: ~7.680 req (3.8% do limite de 200k)

**Migration:**
`20260311220000_update_ghl_sync_cron_to_30min.sql`

---

### 4️⃣ `sync-meta-ads` — A cada **1 hora**

**O que faz:**
Sincroniza dados de anúncios do Meta Ads (campanhas, leads, custos) para análise de tráfego pago.

**Por quê?**
Relatórios de ROI, ROAS e faturamento dependem de dados do Meta. Hourly é suficiente pois dados são consolidados (não mudam minuto a minuto).

**Como funciona:**
- Edge function: `supabase/functions/sync-meta-ads/index.ts`
- Chama API Meta Marketing: `GET /ads_insights`
- Filtra por data (últimas 24h)
- Insere/atualiza tabela `meta_ads_campaigns`

**Rate limit Meta:**
- 200 req / hora por app
- 1000 req / hora no total
- Consumo estimado: ~20-50 req/ciclo (seguro)

**Migration:**
`20260225100500_create_meta_ads_sync_infra.sql`

---

## 🚨 Monitoring & Alertas

### Logs de Execução

Cada cron gera logs em:
- **Supabase:** Abas de Logs > Edge Functions (procure por jobname)
- **Database:** Tabela `cron.job_run_details` (contém status, erro, duration)

### O que monitorar

| Cron | Alerta se... | Ação |
|------|-----------|------|
| `sync-opp-dates` | Falhar 2x consecutivas | Verificar API GHL (rate limit, auth) |
| `sync-opp-pipelines` | `pipeline_name` NULL > 100 por 30min | Investigar webhook do GHL |
| `sync-ghl-conversations` | Lag > 2h | Possível erro na API ou conexão |
| `sync-meta-ads` | Sem atualização por 3h | Verificar token Meta expirou |

### Como Verificar Status Agora

```sql
-- Logs de execução dos crons
SELECT
  jobid,
  jobname,
  last_successful_run,
  last_failed_run,
  last_run_status
FROM cron.job
WHERE jobname IN (
  'sync-opp-dates',
  'sync-opp-pipelines',
  'sync-ghl-conversations-incremental',
  'sync-meta-ads'
);

-- Detalhes do último erro
SELECT
  job_id,
  database,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY end_time DESC
LIMIT 5;
```

---

## ⚠️ Problemas Conhecidos

### 1. Webhook GHL incompleto

**Sintoma:** `pipeline_name = NULL` apareça regularmente
**Causa:** Webhook do GHL não traz `pipeline_name` em alguns casos
**Solução atual:** Edge function sincroniza a cada 10min (workaround)
**Solução permanente:** Verificar configuração webhook GHL com suporte

### 2. Rate limit Meta Ads

**Sintoma:** `sync-meta-ads` falha com 429
**Causa:** Pico de requisições excedendo limite
**Solução:** Aumentar intervalo para 2h (menos frequente mas seguro)

### 3. Lag de sincronização

**Sintoma:** Dashboard mostra dados "antigos"
**Causa:** Cron rodou mas API GHL demorou
**Solução:** Normal — delays de até 10min são esperados na rede

---

## 📊 Resumo de Custo x Benefício

| Cron | Frequência | Req/dia | % Limite | Benefício |
|------|-----------|---------|----------|-----------|
| sync-opp-dates | 10min | ~1.8k | 0.9% | Leads aparecem no cohort |
| sync-opp-pipelines | 10min | ~7.2k | 3.6% | Leads visíveis no dashboard |
| sync-ghl-conversations | 30min | ~7.7k | 3.8% | Análise de resposta em tempo real |
| sync-meta-ads | 1h | ~0.5k | 0.25% | ROI/ROAS precisos |
| **TOTAL** | — | **~17k** | **8.5%** | — |

**Conclusão:** Sistema está **altamente seguro** — usa apenas 8.5% do limite diário de GHL.

---

## 🔧 Como Adicionar um Novo Cron

1. Criar migration: `supabase/migrations/YYYYMMDDHHMMSS_criar_cron_xxx.sql`
2. Usar pattern:
   ```sql
   SELECT cron.schedule(
     'nome-descritivo',
     '*/10 * * * *',  -- frequência em cron format
     $$
     SELECT net.http_post(
       url     := 'https://sua-url/functions/v1/funcao',
       headers := jsonb_build_object(...),
       body    := jsonb_build_object(...)
     ) AS request_id;
     $$
   );
   ```
3. Testar: `supabase db push`
4. Verificar: `SELECT * FROM cron.job WHERE jobname = 'seu-cron'`

---

## 📚 Referências

- [`docs/SYNC-OPP-DATES.md`](SYNC-OPP-DATES.md) — Edge function sync-opp-dates detalhado
- [`docs/SYNC-OPP-PIPELINES.md`](SYNC-OPP-PIPELINES.md) — Edge function sync-opp-pipelines detalhado
- [`docs/COMUNICACOES-GHL-SYNC.md`](COMUNICACOES-GHL-SYNC.md) — Sync de conversas GHL
- [`docs/meta-ads/TROUBLESHOOTING-SYNC.md`](meta-ads/TROUBLESHOOTING-SYNC.md) — Meta Ads troubleshooting
