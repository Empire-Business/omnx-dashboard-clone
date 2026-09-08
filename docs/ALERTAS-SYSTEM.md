# Sistema de Alertas & Monitoramento

**Criado:** 2026-03-16
**Propósito:** Detectar e alertar sobre falhas em sincronizações críticas

---

## 🚨 Alertas Implementados

### 1. Alerta: pipeline_name NULL crescendo

**O que monitora:**
Se mais de **50 oportunidades** tiverem `pipeline_name = NULL` por mais de **30 minutos**, significa que o cron `sync-opp-pipelines` está falhando ou atrasado.

**Por quê é crítico:**
Leads com `pipeline_name = NULL` desaparecem do dashboard (invisibilidade = perda de dados).

**Como verificar manualmente:**
```sql
-- Count de pipeline_name NULL
SELECT COUNT(*)
FROM oportunidades
WHERE pipeline_name IS NULL;

-- Listar últimas 5 para investigar
SELECT id, ghl_opportunity_id, pipeline_id, data_lead_recebido
FROM oportunidades
WHERE pipeline_name IS NULL
ORDER BY data_lead_recebido DESC
LIMIT 5;
```

**Ação recomendada:**
1. Verificar logs do cron: Supabase Dashboard > Functions > sync-opp-pipelines
2. Se erro for rate limit: aumentar delay de 130ms para 200ms
3. Se erro for auth: verificar GHL_API_KEY expirou
4. Se erro for conexão: verificar internet/firewall

---

### 2. Alerta: data_lead_recebido NULL

**O que monitora:**
Se **mais de 5 oportunidades** ficarem com `data_lead_recebido = NULL` por mais de **30 minutos**, o cron `sync-opp-dates` pode estar falhando.

**Por quê é crítico:**
Sem data de criação, o lead não é classificado em nenhum cohort (análise de qualidade fica comprometida).

**Como verificar manualmente:**
```sql
SELECT COUNT(*)
FROM oportunidades
WHERE data_lead_recebido IS NULL
AND ghl_opportunity_id IS NOT NULL;
```

**Ação recomendada:**
1. Verificar API GHL está respondendo
2. Verificar se há oportunidades deletadas no GHL (retornam NULL na API)
3. Se muitos, disparar backfill manual

---

### 3. Alerta: Cron não rodou nos últimos X minutos

**O que monitora:**
Se `last_successful_run` for mais antiga que a frequência do cron, significa:
- Cron está quebrado
- Servidor pg_cron offline
- Edge function retornando erro

**Como verificar:**
```sql
SELECT
  jobname,
  last_successful_run,
  last_failed_run,
  last_run_status,
  EXTRACT(MINUTE FROM (NOW() - last_successful_run)) as minutos_atraso
FROM cron.job
WHERE jobname IN ('sync-opp-dates', 'sync-opp-pipelines', 'sync-ghl-conversations-incremental')
ORDER BY last_successful_run;
```

**Interpretação:**
- `minutos_atraso > 15` para cron de 10min = ⚠️ atrasado
- `minutos_atraso > 45` para cron de 30min = ⚠️ atrasado
- `last_run_status = 'failed'` = 🔴 crítico

---

## 📈 Dashboard de Status (Manual)

Execute essa query periodicamente para ter visão completa:

```sql
WITH status_crons AS (
  SELECT
    jobname,
    last_successful_run,
    last_failed_run,
    CASE
      WHEN last_failed_run > last_successful_run THEN 'ERRO'
      WHEN (NOW() - last_successful_run) > INTERVAL '20 minutes' THEN 'ATRASADO'
      ELSE 'OK'
    END as status,
    ROUND(EXTRACT(MINUTE FROM (NOW() - last_successful_run))::numeric, 0) as minutos_desde_ultimo_run
  FROM cron.job
  WHERE jobname IN ('sync-opp-dates', 'sync-opp-pipelines', 'sync-ghl-conversations-incremental', 'sync-meta-ads')
),
opp_health AS (
  SELECT
    COUNT(CASE WHEN pipeline_name IS NULL THEN 1 END) as pipeline_name_null,
    COUNT(CASE WHEN data_lead_recebido IS NULL THEN 1 END) as data_lead_null,
    COUNT(*) as total_opps
  FROM oportunidades
)
SELECT
  'CRONS' as categoria,
  jobname as item,
  status,
  minutos_desde_ultimo_run as metrica
FROM status_crons
UNION ALL
SELECT
  'DADOS' as categoria,
  'pipeline_name = NULL' as item,
  CASE WHEN pipeline_name_null > 50 THEN 'ALERTA' ELSE 'OK' END as status,
  pipeline_name_null as metrica
FROM opp_health
UNION ALL
SELECT
  'DADOS' as categoria,
  'data_lead_recebido = NULL' as item,
  CASE WHEN data_lead_null > 5 THEN 'ALERTA' ELSE 'OK' END as status,
  data_lead_null as metrica
FROM opp_health;
```

---

## 🔔 Alertas Automáticos (Futuros)

### Implementação sugerida:

1. **Via Slack/Email:**
   ```sql
   -- Criar função que chama webhook de notificação
   CREATE OR REPLACE FUNCTION notify_cron_failure()
   RETURNS void AS $$
   DECLARE
     failed_crons TEXT;
   BEGIN
     SELECT STRING_AGG(jobname, ', ')
     INTO failed_crons
     FROM cron.job
     WHERE last_failed_run > last_successful_run;

     IF failed_crons IS NOT NULL THEN
       PERFORM net.http_post(
         url := 'https://hooks.slack.com/services/seu-webhook',
         headers := jsonb_build_object('Content-Type', 'application/json'),
         body := jsonb_build_object(
           'text', '🚨 Falha em crons: ' || failed_crons
         )
       );
     END IF;
   END;
   $$ LANGUAGE plpgsql;

   -- Agendar para rodar a cada 15 minutos
   SELECT cron.schedule('check-cron-failures', '*/15 * * * *',
     'SELECT notify_cron_failure()');
   ```

2. **Via Dashboard (Grafana/Metabase):**
   - Query acima rodando a cada 1 minuto
   - Painel visual com status dos crons
   - Gráfico de tendências (grows/shrinks de NULL)

3. **Via Pagerduty/Opsgenie:**
   - Integração automática com alerts críticos
   - Escalação se cron não rodar por 1h

---

## 📋 Checklist de Monitoramento

**Diário:**
- [ ] Verificar se `pipeline_name = NULL` está < 50
- [ ] Verificar se `data_lead_recebido = NULL` está < 5
- [ ] Dashboard retorna dados "frescos" (< 30min de atraso)

**Semanal:**
- [ ] Revisar logs de crons: quantas execuções, erros?
- [ ] Analisar taxa de sucesso (esperado: > 99%)
- [ ] Verificar rate limit GHL (consumo vs limite)

**Mensal:**
- [ ] Revisar padrão de falhas
- [ ] Ajustar frequência dos crons se necessário
- [ ] Atualizar documentação com novos insights

---

## 🛠️ Troubleshooting Rápido

| Problema | Sintoma | Solução |
|----------|---------|---------|
| **Cron não rodando** | `last_successful_run` é antigo | Verificar pg_cron está habilitado no Supabase |
| **API GHL rate limit** | `sync-opp-pipelines` falha com 429 | Aumentar delay ou reduzir batch_size |
| **Webhook incompleto** | `pipeline_name` sempre NULL | Verificar configuração webhook GHL |
| **Data inválida** | `data_lead_recebido` vem errada | Usar sync-opp-dates via API (não webhook) |
| **Conexão internet** | Todos os crons falham simultaneamente | Verificar DNS/firewall/VPN |

---

## 📚 Referências

- [`docs/CRONS-SYSTEM.md`](CRONS-SYSTEM.md) — Lista completa de crons
- [`docs/SYNC-OPP-DATES.md`](SYNC-OPP-DATES.md) — Edge function sync-opp-dates
- [`docs/SYNC-OPP-PIPELINES.md`](SYNC-OPP-PIPELINES.md) — Edge function sync-opp-pipelines
- Supabase Docs: https://supabase.com/docs/guides/functions/pg-cron
